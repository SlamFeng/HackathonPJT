from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class JobType(str, Enum):
    avatar_generate = "avatar_generate"
    pose_render = "pose_render"
    vton_tryon = "vton_tryon"
    outfit_render = "outfit_render"


class ProviderPreference(str, Enum):
    nanobanana_first = "nanobanana_first"
    open_source_first = "open_source_first"
    comfyui_first = "comfyui_first"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"


class BodyParams(BaseModel):
    heightCm: int = Field(ge=120, le=220)
    weightKg: int = Field(ge=30, le=200)
    shoulderWidthCm: Optional[int] = Field(default=None, ge=20, le=80)
    chestCm: Optional[int] = Field(default=None, ge=50, le=160)
    waistCm: Optional[int] = Field(default=None, ge=40, le=160)
    hipCm: Optional[int] = Field(default=None, ge=50, le=180)


class JobConstraints(BaseModel):
    identityLock: Optional[bool] = True
    poseLock: Optional[bool] = True
    garmentLock: Optional[bool] = True
    seed: Optional[int] = None
    qualityLevel: Optional[str] = "standard"
    timeoutSec: Optional[int] = 30


class JobCreateRequest(BaseModel):
    jobType: JobType
    providerPreference: ProviderPreference = ProviderPreference.nanobanana_first
    inputs: dict[str, Any]
    constraints: Optional[JobConstraints] = None


class JobArtifact(BaseModel):
    kind: str
    url: str
    meta: Optional[dict[str, Any]] = None


class QualityScores(BaseModel):
    idSimilarity: Optional[float] = None
    poseMatch: Optional[float] = None
    boundaryF1: Optional[float] = None
    artifactScore: Optional[float] = None


class JobError(BaseModel):
    code: str
    message: str
    detail: Optional[dict[str, Any]] = None


class JobResponse(BaseModel):
    jobId: str
    status: JobStatus
    stage: Optional[str] = None
    progress: Optional[float] = None
    artifacts: Optional[list[JobArtifact]] = None
    qualityScores: Optional[QualityScores] = None
    error: Optional[JobError] = None
