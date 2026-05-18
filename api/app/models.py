from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class JobType(StrEnum):
    avatar_generate = "avatar_generate"
    pose_render = "pose_render"
    vton_tryon = "vton_tryon"
    outfit_render = "outfit_render"


class ProviderPreference(StrEnum):
    nanobanana_first = "nanobanana_first"
    open_source_first = "open_source_first"
    comfyui_first = "comfyui_first"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"


class BodyParams(BaseModel):
    heightCm: int = Field(ge=120, le=220)
    weightKg: int = Field(ge=30, le=200)
    shoulderWidthCm: int | None = Field(default=None, ge=20, le=80)
    chestCm: int | None = Field(default=None, ge=50, le=160)
    waistCm: int | None = Field(default=None, ge=40, le=160)
    hipCm: int | None = Field(default=None, ge=50, le=180)


class JobConstraints(BaseModel):
    identityLock: bool | None = True
    poseLock: bool | None = True
    garmentLock: bool | None = True
    seed: int | None = None
    qualityLevel: str | None = "standard"
    timeoutSec: int | None = 30


class JobCreateRequest(BaseModel):
    jobType: JobType
    providerPreference: ProviderPreference = ProviderPreference.nanobanana_first
    inputs: dict[str, Any]
    constraints: JobConstraints | None = None


class JobArtifact(BaseModel):
    kind: str
    url: str
    meta: dict[str, Any] | None = None


class QualityScores(BaseModel):
    idSimilarity: float | None = None
    poseMatch: float | None = None
    boundaryF1: float | None = None
    artifactScore: float | None = None


class JobError(BaseModel):
    code: str
    message: str
    detail: dict[str, Any] | None = None


class JobResponse(BaseModel):
    jobId: str
    status: JobStatus
    stage: str | None = None
    progress: float | None = None
    artifacts: list[JobArtifact] | None = None
    qualityScores: QualityScores | None = None
    error: JobError | None = None

