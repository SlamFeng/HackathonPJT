from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import uuid
import zipfile

# 某些非 UTF-8 控制台（日文 cp932、中文 GBK 等）无法编码调试日志里的中文，
# 会让 print(prompt) 抛 UnicodeEncodeError，进而拖垮整个生成任务。
# 这里在应用入口把 stdout/stderr 强制改为 UTF-8（容器/Linux 本就是 UTF-8，无副作用）。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .admin import service as admin_service
from .admin.router import router as admin_router
from .assets.router import router as assets_router
from .auth.deps import get_current_user, require_admin
from .auth.router import router as auth_router
from .auth.service import seed_admin
from .credits import service as credits_service
from .db.base import SessionLocal, get_db, init_models, is_sqlite
from .db.models import Job, User
from .files import service as files_service
from .files.router import router as files_router
from .generation_logs import generation_log_store
from .jobs import service as job_service
from .jobs import worker as job_worker
from .models import (
    BatchJobCreateRequest,
    BatchJobResponse,
    BatchSummary,
    ExportZipRequest,
    JobCreateRequest,
    JobResponse,
)
from .settings import settings
from .storage import content_type_for, storage


app = FastAPI(title="AI智能试衣间 API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 4：不再公开挂载 /static（任何人猜 URL 即可看图）。
# 图片改由 /v1/files/{key} 鉴权按归属提供（见 files 路由）。
app.include_router(auth_router)
app.include_router(assets_router)
app.include_router(admin_router)
app.include_router(files_router)


@app.on_event("startup")
async def _startup() -> None:
    # SQLite 本地零配置模式：没有 alembic 迁移流程，启动时自动建表。
    # Postgres / 容器模式由 entrypoint.sh 的 alembic upgrade head 负责，跳过这里。
    if is_sqlite():
        try:
            await init_models()
        except Exception as e:  # noqa: BLE001
            print(f"[startup] init_models skipped: {type(e).__name__}: {e}", flush=True)
    try:
        async with SessionLocal() as db:
            await seed_admin(db)
            # 载入管理员保存过的运行时配置（API key / 模型），覆盖 .env 默认
            await admin_service.load_into_runtime(db)
    except Exception as e:  # noqa: BLE001
        print(f"[startup] seed_admin/load_settings skipped: {type(e).__name__}: {e}", flush=True)

    # Phase 3：恢复上次崩溃残留的任务（running -> queued），并按需启动进程内 worker
    await job_worker.recover_on_start()
    if settings.worker_in_process:
        job_worker.start_in_process(settings.worker_concurrency, settings.worker_poll_interval_sec)


@app.on_event("shutdown")
async def _shutdown() -> None:
    if settings.worker_in_process:
        await job_worker.stop_in_process()


def _job_response(job: Job) -> JobResponse:
    return JobResponse(
        jobId=str(job.id),
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        artifacts=job.artifacts_json,
        qualityScores=job.quality_json,
        error=job.error_json,
    )


def _file_ext(name: str) -> str:
    base = os.path.basename(name)
    _, ext = os.path.splitext(base)
    return ext.lower()


@app.post("/v1/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if file.size is not None and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大")

    ext = _file_ext(file.filename or "")
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/webp")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大")

    key = await storage.save(content, ext)
    # 登记归属：上传者拥有该图，仅本人/管理员可通过 /v1/files 访问
    await files_service.register(db, key=key, user_id=user.id, content_type=content_type_for(key))
    return {"assetId": key, "url": files_service.file_url(key)}


@app.post("/v1/jobs", response_model=JobResponse)
async def create_job(
    req: JobCreateRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> JobResponse:
    # 持久化为排队任务，由后台 worker 拉取执行（不再在请求线程内直接跑）。
    # 幂等：重复提交相同 key 直接返回已有任务，且不重复扣额度。
    existing = await job_service.find_existing(db, user=user, idempotency_key=req.idempotencyKey)
    if existing is not None:
        return _job_response(existing)

    # 额度：入队前原子扣减；不足返回 402。
    cost = credits_service.cost_for(req.jobType.value)
    spend = await credits_service.try_spend(db, user=user, amount=cost, reason=f"job:{req.jobType.value}")
    if spend is None:
        raise HTTPException(status_code=402, detail="额度不足，请联系管理员充值后再生成")

    job, created = await job_service.create_or_get(
        db,
        user=user,
        job_type=req.jobType.value,
        provider_preference=req.providerPreference.value if req.providerPreference else None,
        inputs=req.inputs,
        constraints=req.constraints.model_dump() if req.constraints else None,
        idempotency_key=req.idempotencyKey,
    )
    if created:
        await credits_service.attach_job(db, event_id=spend.id, job_id=job.id)
    else:
        # 并发重复（极少）：退回刚扣的额度
        await credits_service.grant(db, user_id=user.id, amount=cost, reason="dup_idempotency_refund")
    return _job_response(job)


@app.post("/v1/jobs/batch", response_model=BatchJobResponse)
async def create_jobs_batch(
    req: BatchJobCreateRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> BatchJobResponse:
    """批量出图：一次入队多个生成任务。

    计费策略：先按"新任务"汇总总额度并一次性原子扣减——余额不足则整批拒绝（402），
    一张都不创建，便于商家在动批量前就知道能不能负担；幂等命中的已存在任务不计费。
    每个任务失败时仍由 worker 按任务单独退款（沿用现有去重退款机制）。
    """
    if len(req.jobs) > 50:
        raise HTTPException(status_code=400, detail="单次批量最多 50 个任务")

    # 第一遍：区分"幂等命中的已存在任务"与"需新建任务"，并累计新建任务应扣总额度。
    plan: list[tuple[JobCreateRequest, Job | None, int]] = []
    total_cost = 0
    for item in req.jobs:
        existing = await job_service.find_existing(db, user=user, idempotency_key=item.idempotencyKey)
        if existing is not None:
            plan.append((item, existing, 0))
        else:
            cost = credits_service.cost_for(item.jobType.value)
            total_cost += cost
            plan.append((item, None, cost))

    new_count = sum(1 for _, existing, _ in plan if existing is None)
    if total_cost > 0:
        bal = await credits_service.balance(db, user.id)
        spend = await credits_service.try_spend(
            db, user=user, amount=total_cost, reason=f"batch:{new_count} jobs"
        )
        if spend is None:
            raise HTTPException(
                status_code=402,
                detail=f"额度不足：本次批量需 {total_cost} 额度，当前余额 {bal}。请联系管理员充值后再生成。",
            )

    # 本次批量的分组 id：新建任务都打上它，便于「出图记录按批次」聚合与整包下载。
    batch_uuid = uuid.uuid4()

    # 创建任务；unaccounted = 已扣但尚未"确认消耗或已退回"的额度，出异常时整体退回。
    responses: list[JobResponse] = []
    charged = 0
    unaccounted = total_cost
    try:
        for item, existing, cost in plan:
            if existing is not None:
                responses.append(_job_response(existing))
                continue
            job, created = await job_service.create_or_get(
                db,
                user=user,
                job_type=item.jobType.value,
                provider_preference=item.providerPreference.value if item.providerPreference else None,
                inputs=item.inputs,
                constraints=item.constraints.model_dump() if item.constraints else None,
                idempotency_key=item.idempotencyKey,
                batch_id=batch_uuid,
            )
            if created:
                charged += cost
                unaccounted -= cost
            else:
                # 并发下被其它请求抢先创建（幂等）：退回这一份，避免重复计费
                await credits_service.grant(db, user_id=user.id, amount=cost, reason="batch_dup_refund")
                unaccounted -= cost
            responses.append(_job_response(job))
    except Exception:
        if unaccounted > 0:
            await credits_service.grant(
                db, user_id=user.id, amount=unaccounted, reason="batch_create_error_refund"
            )
        raise

    return BatchJobResponse(
        jobs=responses, batchId=str(batch_uuid), charged=charged, duplicates=len(plan) - new_count
    )


@app.post("/v1/exports/zip")
async def export_jobs_zip(
    req: ExportZipRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    """把若干任务的成功出图打包成 ZIP 下载（批量出图的最后一公里）。"""
    buf = io.BytesIO()
    count = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, jid in enumerate(req.jobIds):
            job = await job_service.get_owned(db, user=user, job_id=jid)
            if job is None or job.status != "succeeded":
                continue
            artifacts = job.artifacts_json or []
            image = next((a for a in artifacts if a.get("kind") == "image" and a.get("url")), None)
            if image is None:
                continue
            key = files_service.key_from_url(image["url"])
            if not key or not await storage.exists(key):
                continue
            data = await storage.read(key)
            ext = os.path.splitext(key)[1] or ".png"
            inputs = job.input_json or {}
            parts = [f"{idx + 1:02d}", job.job_type]
            pose = inputs.get("poseId")
            if pose:
                parts.append(str(pose))
            zf.writestr("_".join(parts) + ext, data)
            count += 1

    if count == 0:
        raise HTTPException(status_code=404, detail="没有可导出的成功结果")

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="tryon_batch.zip"'},
    )


@app.get("/v1/batches", response_model=list[BatchSummary])
async def list_batches(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[BatchSummary]:
    """出图记录「按批次」：把同一次批量出图的任务聚合成一张卡的数据。"""
    jobs = await job_service.list_batched_jobs(db, user_id=user.id)
    # 按 batch_id 分组（保持创建时间倒序：jobs 已倒序，首次出现即最新）
    order: list[str] = []
    groups: dict[str, list[Job]] = {}
    for j in jobs:
        bid = str(j.batch_id)
        if bid not in groups:
            groups[bid] = []
            order.append(bid)
        groups[bid].append(j)

    out: list[BatchSummary] = []
    for bid in order:
        items = groups[bid]
        thumbs: list[str] = []
        for j in items:
            if j.status == "succeeded":
                img = next((a for a in (j.artifacts_json or []) if a.get("kind") == "image" and a.get("url")), None)
                if img and len(thumbs) < 8:
                    thumbs.append(img["url"])
        created = min(j.created_at for j in items)
        out.append(
            BatchSummary(
                batchId=bid,
                createdAt=created.isoformat() if created else "",
                jobType=items[0].job_type if items else None,
                total=len(items),
                succeeded=sum(1 for j in items if j.status == "succeeded"),
                failed=sum(1 for j in items if j.status == "failed"),
                running=sum(1 for j in items if j.status == "running"),
                queued=sum(1 for j in items if j.status == "queued"),
                thumbnails=thumbs,
                jobIds=[str(j.id) for j in items],
            )
        )
    return out


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> JobResponse:
    job = await job_service.get_owned(db, user=user, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _job_response(job)


@app.get("/v1/jobs/{job_id}/events")
async def job_events(
    job_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> StreamingResponse:
    job = await job_service.get_owned(db, user=user, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    job_uuid = job.id

    # SSE：轮询数据库中的任务状态并推送变化（前端目前主用轮询，这里保持可用）。
    async def gen() -> AsyncIterator[bytes]:
        last: tuple[Any, Any, Any] | None = None
        for _ in range(2000):  # 上限保护，约 20 分钟
            async with SessionLocal() as s:
                j = await s.get(Job, job_uuid)
            if j is None:
                break
            cur = (j.status, j.stage, j.progress)
            if cur != last:
                last = cur
                payload = {"jobId": str(j.id), "status": j.status, "stage": j.stage, "progress": j.progress}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
            if j.status in ("succeeded", "failed", "canceled"):
                break
            await asyncio.sleep(0.6)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/v1/debug/generation-logs")
async def list_generation_logs(limit: int = 50, _admin: User = Depends(require_admin)) -> dict[str, Any]:
    return {"logs": await generation_log_store.list(limit=limit)}


@app.get("/v1/debug/generation-logs/{log_id}")
async def get_generation_log(log_id: str, _admin: User = Depends(require_admin)) -> dict[str, Any]:
    record = await generation_log_store.get(log_id)
    if record is None:
        raise HTTPException(status_code=404, detail="generation log not found")
    return record


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True})
