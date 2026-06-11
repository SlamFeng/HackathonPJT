from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from .models import JobStatus, JobType, ProviderPreference, QualityScores


@dataclass
class JobRecord:
    id: str
    job_type: JobType
    provider_preference: ProviderPreference
    user_id: str | None = None
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
        user_id: str | None = None,
    ) -> JobRecord:
        job_id = str(uuid.uuid4())
        record = JobRecord(
            id=job_id,
            job_type=job_type,
            provider_preference=provider_preference,
            user_id=user_id,
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
