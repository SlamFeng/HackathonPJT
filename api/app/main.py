from __future__ import annotations

import asyncio
import os
import sys
import uuid

# 某些非 UTF-8 控制台（日文 cp932、中文 GBK 等）无法编码调试日志里的中文，
# 会让 print(prompt) 抛 UnicodeEncodeError，进而拖垮整个生成任务。
# 这里在应用入口把 stdout/stderr 强制改为 UTF-8（容器/Linux 本就是 UTF-8，无副作用）。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .admin import service as admin_service
from .admin.router import router as admin_router
from .assets.router import router as assets_router
from .auth.deps import get_current_user, require_admin
from .auth.router import router as auth_router
from .auth.service import seed_admin
from .db.base import SessionLocal, init_models, is_sqlite
from .db.models import User
from .generation_logs import generation_log_store
from .inference.nanobanana import NanobananaProvider
from .models import JobCreateRequest, JobResponse, JobStatus, QualityScores
from .settings import settings
from .store import JobRecord, job_store


app = FastAPI(title="AI智能试衣间 API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage_path = Path(__file__).resolve().parents[1] / settings.storage_dir
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(storage_path)), name="static")

provider = NanobananaProvider()

app.include_router(auth_router)
app.include_router(assets_router)
app.include_router(admin_router)


@app.on_event("startup")
async def _startup() -> None:
    # SQLite 本地零配置模式：没有 alembic 迁移流程，启动时自动建表。
    # Postgres / 容器模式由 entrypoint.sh 的 alembic upgrade head 负责，跳过这里。
    if is_sqlite():
        try:
            await init_models()
        except Exception as e:  # noqa: BLE001
            print(f"[startup] init_models skipped: {type(e).__name__}: {e}", flush=True)
    # 幂等创建管理员（迁移由容器 entrypoint 的 alembic 负责）。
    # 数据库未就绪时不阻断启动，便于无 DB 场景下仍能访问 /health。
    try:
        async with SessionLocal() as db:
            await seed_admin(db)
            # 载入管理员保存过的运行时配置（API key / 模型），覆盖 .env 默认
            await admin_service.load_into_runtime(db)
    except Exception as e:  # noqa: BLE001
        print(f"[startup] seed_admin/load_settings skipped: {type(e).__name__}: {e}", flush=True)


def _ensure_owner(job: JobRecord | None, user: User) -> JobRecord:
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    if user.role != "admin" and job.user_id != str(user.id):
        # 不泄露他人任务是否存在
        raise HTTPException(status_code=404, detail="job not found")
    return job


def _file_ext(name: str) -> str:
    base = os.path.basename(name)
    _, ext = os.path.splitext(base)
    return ext.lower()


@app.post("/v1/assets/upload")
async def upload_asset(
    file: UploadFile = File(...), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    if file.size is not None and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大")

    ext = _file_ext(file.filename or "")
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/webp")

    asset_id = str(uuid.uuid4())
    out_name = f"{asset_id}{ext}"
    out_path = storage_path / out_name

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大")
    out_path.write_bytes(content)

    return {"assetId": asset_id, "url": f"/static/{out_name}"}


async def _run_job(job_id: str) -> None:
    job = await job_store.get(job_id)
    if job is None:
        return

    await job_store.update(job_id, status=JobStatus.running, stage="running", progress=0.05)
    await job_store.emit(job_id, "running", 0.05, "任务开始")

    await asyncio.sleep(0.15)
    await job_store.update(job_id, stage="inference", progress=0.2)
    await job_store.emit(job_id, "inference", 0.2, "推理中")

    try:
        if job.job_type.value == "avatar_generate":
            result = await provider.avatar_generate(inputs=job.inputs, constraints=job.constraints, job_id=job_id)
            quality = QualityScores(idSimilarity=0.9, artifactScore=0.9)
        elif job.job_type.value == "pose_render":
            result = await provider.pose_render(inputs=job.inputs, constraints=job.constraints, job_id=job_id)
            quality = QualityScores(idSimilarity=0.9, poseMatch=0.96, artifactScore=0.85)
        elif job.job_type.value == "garment_extract":
            result = await provider.garment_extract(inputs=job.inputs, constraints=job.constraints, job_id=job_id)
            quality = QualityScores(boundaryF1=0.9, artifactScore=0.85)
        elif job.job_type.value == "vton_tryon":
            result = await provider.vton_tryon(inputs=job.inputs, constraints=job.constraints, job_id=job_id)
            quality = QualityScores(idSimilarity=0.9, boundaryF1=0.93, artifactScore=0.85)
        else:
            result = await provider.avatar_generate(inputs=job.inputs, constraints=job.constraints, job_id=job_id)
            quality = QualityScores(artifactScore=0.8)

        await asyncio.sleep(0.2)
        await job_store.update(
            job_id,
            status=JobStatus.succeeded,
            stage="done",
            progress=1.0,
            artifacts=[{"kind": "image", "url": result.get("imageUrl"), "meta": result.get("meta")}],
            quality_scores=quality,
        )
        await job_store.emit(job_id, "done", 1.0, "完成")
    except Exception as e:
        msg = str(e)
        if not msg:
            # TimeoutError 等异常的 str() 可能为空，补充类型信息方便排查
            msg = f"{type(e).__name__}"
        await job_store.update(
            job_id,
            status=JobStatus.failed,
            stage="failed",
            progress=1.0,
            error={"code": "INFERENCE_FAILED", "message": msg},
        )
        await job_store.emit(job_id, "failed", 1.0, "失败")


@app.post("/v1/jobs", response_model=JobResponse)
async def create_job(req: JobCreateRequest, user: User = Depends(get_current_user)) -> JobResponse:
    record = await job_store.create(
        job_type=req.jobType,
        provider_preference=req.providerPreference,
        inputs=req.inputs,
        constraints=req.constraints.model_dump() if req.constraints else None,
        user_id=str(user.id),
    )
    asyncio.create_task(_run_job(record.id))
    return JobResponse(jobId=record.id, status=record.status, stage=record.stage, progress=record.progress)


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: User = Depends(get_current_user)) -> JobResponse:
    job = _ensure_owner(await job_store.get(job_id), user)
    return JobResponse(
        jobId=job.id,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        artifacts=job.artifacts,
        qualityScores=job.quality_scores,
        error=job.error,
    )


@app.get("/v1/jobs/{job_id}/events")
async def job_events(job_id: str, user: User = Depends(get_current_user)) -> StreamingResponse:
    _ensure_owner(await job_store.get(job_id), user)
    q = await job_store.events(job_id)
    if q is None:
        raise HTTPException(status_code=404, detail="job not found")

    async def gen() -> AsyncIterator[bytes]:
        while True:
            data = await q.get()
            yield f"data: {data}\n\n".encode("utf-8")

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
