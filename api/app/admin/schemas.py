from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from ..db.models import Job, UsageEvent, User


class SettingsOut(BaseModel):
    hasApiKey: bool
    apiKeyMasked: str | None
    keySource: str  # runtime | env | none
    model: str
    availableModels: list[str]
    # 垂立调试链路（demo lane）
    demoLaneEnabled: bool
    demoLaneModel: str | None
    demoLanePrompt: str | None


class SettingsUpdate(BaseModel):
    # 用 model_fields_set 区分「未传该字段」与「传了 null/空字符串（=清除）」
    apiKey: str | None = None
    model: str | None = None
    demoLaneEnabled: bool | None = None
    demoLaneModel: str | None = None
    demoLanePrompt: str | None = None


class ConfigStatusOut(BaseModel):
    hasApiKey: bool
    model: str


# ===== Phase 5 =====
class AdminUserOut(BaseModel):
    id: str
    email: str
    displayName: str | None
    role: str
    status: str
    credits: int
    createdAt: datetime
    lastLoginAt: datetime | None

    @classmethod
    def of(cls, u: User) -> "AdminUserOut":
        return cls(
            id=str(u.id), email=u.email, displayName=u.display_name, role=u.role, status=u.status,
            credits=u.credits, createdAt=u.created_at, lastLoginAt=u.last_login_at,
        )


class GrantRequest(BaseModel):
    amount: int
    reason: str | None = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    displayName: str | None = None
    role: str = "user"  # user | admin
    initialCredits: int = 0  # 建号时发放的额度（默认 0，由管理员决定）


class AdminJobOut(BaseModel):
    id: str
    userEmail: str
    jobType: str
    status: str
    createdAt: datetime
    finishedAt: datetime | None
    errorMessage: str | None

    @classmethod
    def of(cls, j: Job, email: str) -> "AdminJobOut":
        err = (j.error_json or {}).get("message") if j.error_json else None
        return cls(
            id=str(j.id), userEmail=email, jobType=j.job_type, status=j.status,
            createdAt=j.created_at, finishedAt=j.finished_at, errorMessage=err,
        )


class UsageEventOut(BaseModel):
    eventType: str
    amount: int
    reason: str | None
    jobId: str | None
    createdAt: datetime

    @classmethod
    def of(cls, e: UsageEvent) -> "UsageEventOut":
        return cls(
            eventType=e.event_type, amount=e.amount, reason=e.reason,
            jobId=str(e.job_id) if e.job_id else None, createdAt=e.created_at,
        )


class MeCreditsOut(BaseModel):
    credits: int
    events: list[UsageEventOut]
