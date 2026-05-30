from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from .models import BodyAnalysisResult, JobStatus, JobType, ProductItem, ProviderPreference, QualityScores, SavedScript


@dataclass
class JobRecord:
    id: str
    job_type: JobType
    provider_preference: ProviderPreference
    status: JobStatus = JobStatus.queued
    stage: str | None = None
    progress: float | None = None
    inputs: dict[str, Any] = field(default_factory=dict)
    constraints: dict[str, Any] | None = None
    artifacts: list[dict[str, Any]] | None = None
    quality_scores: QualityScores | None = None
    error: dict[str, Any] | None = None
    created_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._event_queues: dict[str, asyncio.Queue[str]] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        job_type: JobType,
        provider_preference: ProviderPreference,
        inputs: dict[str, Any],
        constraints: dict[str, Any] | None,
    ) -> JobRecord:
        job_id = str(uuid.uuid4())
        record = JobRecord(
            id=job_id,
            job_type=job_type,
            provider_preference=provider_preference,
            inputs=inputs,
            constraints=constraints,
        )
        async with self._lock:
            self._jobs[job_id] = record
            self._event_queues[job_id] = asyncio.Queue()
        await self.emit(job_id, "queued", 0.0, "queued")
        return record

    async def get(self, job_id: str) -> JobRecord | None:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        stage: str | None = None,
        progress: float | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        quality_scores: QualityScores | None = None,
        error: dict[str, Any] | None = None,
    ) -> JobRecord | None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if status is not None:
                job.status = status
            if stage is not None:
                job.stage = stage
            if progress is not None:
                job.progress = progress
            if artifacts is not None:
                job.artifacts = artifacts
            if quality_scores is not None:
                job.quality_scores = quality_scores
            if error is not None:
                job.error = error
            job.updated_at_ms = int(time.time() * 1000)
            return job

    async def emit(self, job_id: str, stage: str, progress: float, message: str) -> None:
        async with self._lock:
            q = self._event_queues.get(job_id)
        if q is None:
            return
        payload = {
            "jobId": job_id,
            "stage": stage,
            "progress": progress,
            "message": message,
            "ts": int(time.time() * 1000),
        }
        q.put_nowait(json.dumps(payload, ensure_ascii=False))

    async def events(self, job_id: str) -> asyncio.Queue[str] | None:
        async with self._lock:
            return self._event_queues.get(job_id)


job_store = JobStore()


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def get_session(self, session_id: str) -> dict[str, Any]:
        async with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = {"id": session_id, "body_analysis": None}
            return self._sessions[session_id]

    async def set_body_analysis(self, session_id: str, analysis: BodyAnalysisResult) -> None:
        async with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = {"id": session_id}
            self._sessions[session_id]["body_analysis"] = analysis.model_dump()


session_store = SessionStore()


DEFAULT_PRODUCTS: list[dict[str, Any]] = [
    {"id": "p1", "name": "修身显瘦连衣裙", "imageUrl": "", "category": "dress", "tags": ["显瘦", "收腰", "优雅"], "suitable_body_types": ["梨形", "沙漏形"]},
    {"id": "p2", "name": "宽松休闲T恤", "imageUrl": "", "category": "top", "tags": ["宽松", "舒适", "百搭"], "suitable_body_types": ["苹果形", "直筒形"]},
    {"id": "p3", "name": "高腰直筒裤", "imageUrl": "", "category": "pants", "tags": ["显高", "收腹", "通勤"], "suitable_body_types": ["梨形", "直筒形", "苹果形"]},
    {"id": "p4", "name": "收腰西装外套", "imageUrl": "", "category": "outerwear", "tags": ["收腰", "挺括", "通勤"], "suitable_body_types": ["沙漏形", "直筒形"]},
    {"id": "p5", "name": "A字半身裙", "imageUrl": "", "category": "skirt", "tags": ["遮胯", "显瘦", "甜美"], "suitable_body_types": ["梨形", "苹果形"]},
    {"id": "p6", "name": "连体阔腿套装", "imageUrl": "", "category": "suit", "tags": ["显高", "遮肉", "气质"], "suitable_body_types": ["苹果形", "直筒形", "梨形"]},
    {"id": "p7", "name": "塑形运动内衣", "imageUrl": "", "category": "underwear", "tags": ["塑形", "透气", "运动"], "suitable_body_types": ["直筒形", "沙漏形"]},
    {"id": "p8", "name": "小白鞋", "imageUrl": "", "category": "shoes", "tags": ["百搭", "舒适", "休闲"], "suitable_body_types": ["梨形", "苹果形", "沙漏形", "直筒形"]},
]


class ProductStore:
    def __init__(self) -> None:
        self._products: dict[str, ProductItem] = {}
        self._lock = asyncio.Lock()
        for p in DEFAULT_PRODUCTS:
            self._products[p["id"]] = ProductItem(**p)

    async def get_all(self) -> list[ProductItem]:
        async with self._lock:
            return list(self._products.values())

    async def get_by_ids(self, ids: list[str]) -> list[ProductItem]:
        async with self._lock:
            return [self._products[i] for i in ids if i in self._products]

    async def recommend(self, body_shape: str, limit: int = 5) -> list[tuple[ProductItem, str]]:
        results: list[tuple[ProductItem, str]] = []
        async with self._lock:
            all_items = list(self._products.values())
        for p in all_items:
            if body_shape in p.suitable_body_types:
                reason = f"适合{body_shape}体型"
                if "显瘦" in p.tags:
                    reason += "，显瘦效果佳"
                elif "收腰" in p.tags:
                    reason += "，收腰显曲线"
                elif "宽松" in p.tags:
                    reason += "，舒适遮肉"
                elif "百搭" in p.tags:
                    reason += "，百搭不挑人"
                results.append((p, reason))
        return results[:limit]


product_store = ProductStore()


class SavedScriptsStore:
    def __init__(self) -> None:
        self._scripts: dict[str, SavedScript] = {}
        self._lock = asyncio.Lock()

    async def create(self, script: SavedScript) -> SavedScript:
        async with self._lock:
            self._scripts[script.id] = script
            return script

    async def get_all(self) -> list[SavedScript]:
        async with self._lock:
            return list(self._scripts.values())

    async def get_favorites(self) -> list[SavedScript]:
        async with self._lock:
            return [s for s in self._scripts.values() if s.favorite]

    async def toggle_favorite(self, script_id: str) -> SavedScript | None:
        async with self._lock:
            s = self._scripts.get(script_id)
            if s is None:
                return None
            s.favorite = not s.favorite
            return s


saved_scripts_store = SavedScriptsStore()
