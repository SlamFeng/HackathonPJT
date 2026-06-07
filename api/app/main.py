from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .generation_logs import generation_log_store
from .inference.nanobanana import NanobananaProvider
from .models import JobCreateRequest, JobResponse, JobStatus, QualityScores
from .settings import settings
from .store import job_store


app = FastAPI(title="AI智能试衣间 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage_path = Path(__file__).resolve().parents[1] / settings.storage_dir
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(storage_path)), name="static")

provider = NanobananaProvider()


def _file_ext(name: str) -> str:
    base = os.path.basename(name)
    _, ext = os.path.splitext(base)
    return ext.lower()


@app.post("/v1/assets/upload")
async def upload_asset(file: UploadFile = File(...)) -> dict[str, Any]:
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
async def create_job(req: JobCreateRequest) -> JobResponse:
    record = await job_store.create(
        job_type=req.jobType,
        provider_preference=req.providerPreference,
        inputs=req.inputs,
        constraints=req.constraints.model_dump() if req.constraints else None,
    )
    asyncio.create_task(_run_job(record.id))
    return JobResponse(jobId=record.id, status=record.status, stage=record.stage, progress=record.progress)


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = await job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
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
async def job_events(job_id: str) -> StreamingResponse:
    q = await job_store.events(job_id)
    if q is None:
        raise HTTPException(status_code=404, detail="job not found")

    async def gen() -> AsyncIterator[bytes]:
        while True:
            data = await q.get()
            yield f"data: {data}\n\n".encode("utf-8")

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/v1/debug/generation-logs")
async def list_generation_logs(limit: int = 50) -> dict[str, Any]:
    return {"logs": await generation_log_store.list(limit=limit)}


@app.get("/v1/debug/generation-logs/{log_id}")
async def get_generation_log(log_id: str) -> dict[str, Any]:
    record = await generation_log_store.get(log_id)
    if record is None:
        raise HTTPException(status_code=404, detail="generation log not found")
    return record


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True})
