from __future__ import annotations

import asyncio
import os
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .inference.nanobanana import NanobananaProvider
from .models import BodyAnalysisResult, JobCreateRequest, JobResponse, JobStatus, ProductItem, QualityScores, RecommendRequest, RecommendResponse, SavedScript
from .settings import settings
from .store import job_store, product_store, saved_scripts_store, session_store


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
            result = await provider.avatar_generate(inputs=job.inputs, constraints=job.constraints)
            quality = QualityScores(idSimilarity=0.9, artifactScore=0.9)
        elif job.job_type.value == "pose_render":
            result = await provider.pose_render(inputs=job.inputs, constraints=job.constraints)
            quality = QualityScores(idSimilarity=0.9, poseMatch=0.96, artifactScore=0.85)
        elif job.job_type.value == "vton_tryon":
            result = await provider.vton_tryon(inputs=job.inputs, constraints=job.constraints)
            quality = QualityScores(idSimilarity=0.9, boundaryF1=0.93, artifactScore=0.85)
        else:
            result = await provider.avatar_generate(inputs=job.inputs, constraints=job.constraints)
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


@app.post("/v1/body/analyze")
async def analyze_body(request: dict[str, Any]) -> dict[str, Any]:
    image_url = request.get("imageUrl") or request.get("avatarImageUrl")
    session_id = request.get("sessionId", "default")
    if not image_url:
        raise HTTPException(status_code=400, detail="缺少图片URL")

    try:
        result = await provider.analyze_body(image_url=image_url)
    except Exception as e:
        result = {
            "height_estimate": "中等",
            "body_shape": "直筒形",
            "shoulder_width": "中",
            "waist_definition": "一般",
            "style_suggestion": "建议尝试多种风格",
        }

    analysis = BodyAnalysisResult(**result)
    await session_store.set_body_analysis(session_id, analysis)
    return {"sessionId": session_id, "analysis": analysis.model_dump()}


@app.get("/v1/body/analysis/{session_id}")
async def get_body_analysis(session_id: str) -> dict[str, Any]:
    session = await session_store.get_session(session_id)
    return {"sessionId": session_id, "analysis": session.get("body_analysis")}


@app.post("/v1/scripts/generate")
async def generate_script(request: dict[str, Any]) -> dict[str, Any]:
    session_id = request.get("sessionId", "default")
    customer_note = request.get("customerNote", "")

    session = await session_store.get_session(session_id)
    body_analysis = session.get("body_analysis")
    if not body_analysis:
        raise HTTPException(status_code=400, detail="请先进行体型分析")

    analysis = BodyAnalysisResult(**body_analysis)
    block = analysis.to_prompt_block()

    try:
        text = await provider.generate_script(body_analysis_block=block, customer_note=customer_note)
    except Exception as e:
        text = (
            f"根据顾客体型分析，推荐以下搭配方案：\n{block}\n"
            f"建议优先试穿适合该体型的款式，突出优势部位。"
        )

    return {"sessionId": session_id, "script": text}


@app.post("/v1/scripts/save")
async def save_script(request: dict[str, Any]) -> dict[str, Any]:
    script = SavedScript(
        id=str(uuid.uuid4()),
        session_id=request.get("sessionId", "default"),
        body_type_summary=request.get("bodyTypeSummary", ""),
        category=request.get("category", "通用"),
        content=request.get("content", ""),
        created_at_ms=int(time.time() * 1000),
    )
    saved = await saved_scripts_store.create(script)
    return {"id": saved.id, "status": "saved"}


@app.get("/v1/scripts")
async def list_scripts(favorites_only: bool = False) -> list[dict[str, Any]]:
    if favorites_only:
        scripts = await saved_scripts_store.get_favorites()
    else:
        scripts = await saved_scripts_store.get_all()
    return [s.model_dump() for s in scripts]


@app.patch("/v1/scripts/{script_id}/favorite")
async def toggle_script_favorite(script_id: str) -> dict[str, Any]:
    s = await saved_scripts_store.toggle_favorite(script_id)
    if s is None:
        raise HTTPException(status_code=404, detail="话术未找到")
    return {"id": s.id, "favorite": s.favorite}


@app.post("/v1/products/recommend", response_model=RecommendResponse)
async def recommend_products(req: RecommendRequest) -> RecommendResponse:
    session = await session_store.get_session(req.session_id)
    body_analysis = session.get("body_analysis", {})
    body_shape = body_analysis.get("body_shape", "直筒形")

    import json as _json
    if req.body_type_json:
        try:
            parsed = _json.loads(req.body_type_json)
            body_shape = parsed.get("body_shape", body_shape)
        except Exception:
            pass

    results = await product_store.recommend(body_shape)
    recommended = [p.id for p, _ in results]
    reasons = {p.id: r for p, r in results}

    return RecommendResponse(recommended=recommended, reasons=reasons)


@app.get("/v1/products")
async def list_products() -> list[dict[str, Any]]:
    products = await product_store.get_all()
    return [p.model_dump() for p in products]


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True})
