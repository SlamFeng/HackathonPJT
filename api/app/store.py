from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .models import JobStatus, JobType, ProviderPreference, QualityScores


@dataclass
class JobRecord:
    id: str
    job_type: JobType
    provider_preference: ProviderPreference
    status: JobStatus = JobStatus.queued
    stage: Optional[str] = None
    progress: Optional[float] = None
    inputs: dict[str, Any] = field(default_factory=dict)
    constraints: Optional[dict[str, Any]] = None
    artifacts: Optional[list[dict[str, Any]]] = None
    quality_scores: Optional[QualityScores] = None
    error: Optional[dict[str, Any]] = None
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
        constraints: Optional[dict[str, Any]],
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

    async def get(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update(
        self,
        job_id: str,
        *,
        status: Optional[JobStatus] = None,
        stage: Optional[str] = None,
        progress: Optional[float] = None,
        artifacts: Optional[list[dict[str, Any]]] = None,
        quality_scores: Optional[QualityScores] = None,
        error: Optional[dict[str, Any]] = None,
    ) -> Optional[JobRecord]:
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

    async def events(self, job_id: str) -> Optional[asyncio.Queue[str]]:
        async with self._lock:
            return self._event_queues.get(job_id)


job_store = JobStore()
