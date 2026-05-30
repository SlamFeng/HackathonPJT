from __future__ import annotations

try:
    # Python 3.11+
    from enum import StrEnum
except ImportError:  # pragma: no cover
    # Python 3.10 兼容：简易 StrEnum 实现（满足 FastAPI/Pydantic 的枚举序列化需求）
    from enum import Enum

    class StrEnum(str, Enum):
        pass
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
    # Gemini/NanoBanana 的图像生成与编辑经常超过 30s，默认放宽，避免任务误判超时
    timeoutSec: int | None = 180


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


class BodyAnalysisResult(BaseModel):
    height_estimate: str = "中等"
    body_shape: str = "直筒形"
    shoulder_width: str = "中"
    waist_definition: str = "一般"
    style_suggestion: str = ""

    def to_prompt_block(self) -> str:
        return (
            f"- 身高评估：{self.height_estimate}\n"
            f"- 体型：{self.body_shape}\n"
            f"- 肩宽：{self.shoulder_width}\n"
            f"- 腰线：{self.waist_definition}\n"
            f"- 穿搭建议：{self.style_suggestion}"
        )


class ProductItem(BaseModel):
    id: str
    name: str
    imageUrl: str
    category: str = "top"
    tags: list[str] = Field(default_factory=list)
    suitable_body_types: list[str] = Field(default_factory=list)


class RecommendRequest(BaseModel):
    session_id: str
    body_type_json: str


class RecommendResponse(BaseModel):
    recommended: list[str]
    reasons: dict[str, str]


class SavedScript(BaseModel):
    id: str
    session_id: str
    body_type_summary: str
    category: str = "通用"
    content: str
    favorite: bool = False
    created_at_ms: int = 0
