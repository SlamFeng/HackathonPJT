from __future__ import annotations

import asyncio
from typing import Any

from ..credits import service as credits_service
from ..db.base import SessionLocal
from ..db.models import Job
from ..files import service as files_service
from ..inference.nanobanana import NanobananaProvider
from . import service

provider = NanobananaProvider()

# 各任务类型的质检分（沿用原 main.py 的硬编码值）
_QUALITY: dict[str, dict[str, float]] = {
    "avatar_generate": {"idSimilarity": 0.9, "artifactScore": 0.9},
    "pose_render": {"idSimilarity": 0.9, "poseMatch": 0.96, "artifactScore": 0.85},
    "garment_extract": {"boundaryF1": 0.9, "artifactScore": 0.85},
    "vton_tryon": {"idSimilarity": 0.9, "boundaryF1": 0.93, "artifactScore": 0.85},
}

_stop_event: asyncio.Event | None = None
_tasks: list[asyncio.Task] = []


async def _call_provider(job_type: str, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str) -> dict[str, Any]:
    if job_type == "avatar_generate":
        return await provider.avatar_generate(inputs=inputs, constraints=constraints, job_id=job_id)
    if job_type == "pose_render":
        return await provider.pose_render(inputs=inputs, constraints=constraints, job_id=job_id)
    if job_type == "garment_extract":
        return await provider.garment_extract(inputs=inputs, constraints=constraints, job_id=job_id)
    if job_type == "vton_tryon":
        return await provider.vton_tryon(inputs=inputs, constraints=constraints, job_id=job_id)
    return await provider.avatar_generate(inputs=inputs, constraints=constraints, job_id=job_id)


async def _run_one(job: Job) -> None:
    job_id = job.id
    job_type = job.job_type
    inputs = dict(job.input_json or {})
    constraints = job.constraints_json
    async with SessionLocal() as db:
        try:
            await service.set_progress(db, job_id, stage="inference", progress=0.2)
            result = await _call_provider(job_type, inputs, constraints, str(job_id))
            # Phase 4：把最终产出图登记归属到任务所属用户（仅本人/管理员可访问）
            await files_service.register_url(db, url=result.get("imageUrl"), user_id=job.user_id, content_type=None)
            artifacts = [{"kind": "image", "url": result.get("imageUrl"), "meta": result.get("meta")}]
            quality = _QUALITY.get(job_type, {"artifactScore": 0.8})
            await service.mark_succeeded(db, job_id, artifacts=artifacts, quality=quality)
        except Exception as e:  # noqa: BLE001
            msg = str(e) or type(e).__name__
            await service.mark_failed(db, job_id, error={"code": "INFERENCE_FAILED", "message": msg})
            # Phase 5：失败自动退款（按 job 去重，不会重复退）
            try:
                await credits_service.refund_job(
                    db, user_id=job.user_id, job_id=job_id,
                    amount=credits_service.cost_for(job_type), reason="job_failed_refund",
                )
            except Exception as re:  # noqa: BLE001
                print(f"[worker] refund failed for {job_id}: {type(re).__name__}: {re}", flush=True)


async def _worker_loop(stop: asyncio.Event, poll_interval: float) -> None:
    while not stop.is_set():
        claimed: Job | None = None
        try:
            async with SessionLocal() as db:
                claimed = await service.claim_next(db)
        except Exception as e:  # noqa: BLE001
            print(f"[worker] claim error: {type(e).__name__}: {e}", flush=True)
        if claimed is None:
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_interval)
            except asyncio.TimeoutError:
                pass
            continue
        await _run_one(claimed)


async def recover_on_start() -> None:
    """启动时把上次残留的 running 任务重置为 queued。"""
    try:
        async with SessionLocal() as db:
            n = await service.recover_stuck(db)
            if n:
                print(f"[worker] recovered {n} stuck job(s) -> requeued", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[worker] recover skipped: {type(e).__name__}: {e}", flush=True)


def start_in_process(concurrency: int, poll_interval: float) -> None:
    """在 API 进程内启动 worker 循环（本地零配置默认模式）。"""
    global _stop_event, _tasks
    _stop_event = asyncio.Event()
    _tasks = [asyncio.create_task(_worker_loop(_stop_event, poll_interval)) for _ in range(max(1, concurrency))]
    print(f"[worker] started in-process x{max(1, concurrency)} (poll={poll_interval}s)", flush=True)


async def stop_in_process() -> None:
    if _stop_event is not None:
        _stop_event.set()
    for t in _tasks:
        try:
            await asyncio.wait_for(t, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            t.cancel()
    _tasks.clear()


async def run_forever(concurrency: int, poll_interval: float) -> None:
    """独立 worker 进程入口（Docker / 拆分部署用）。"""
    await recover_on_start()
    stop = asyncio.Event()
    tasks = [asyncio.create_task(_worker_loop(stop, poll_interval)) for _ in range(max(1, concurrency))]
    await asyncio.gather(*tasks)
