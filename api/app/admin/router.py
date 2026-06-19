from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .. import runtime_config
from ..auth.deps import get_current_user, require_admin
from ..credits import service as credits_service
from ..db.base import get_db
from ..db.models import User
from . import service
from .schemas import (
    AdminJobOut,
    AdminUserOut,
    ConfigStatusOut,
    CreateUserRequest,
    GrantRequest,
    MeCreditsOut,
    SettingsOut,
    SettingsUpdate,
    UsageEventOut,
)

router = APIRouter(tags=["admin"])


def _current_settings() -> SettingsOut:
    return SettingsOut(
        hasApiKey=runtime_config.has_api_key(),
        apiKeyMasked=runtime_config.masked_api_key(),
        keySource=runtime_config.key_source(),
        model=runtime_config.get_model(),
        availableModels=runtime_config.AVAILABLE_MODELS,
        demoLaneEnabled=runtime_config.demo_lane_enabled(),
        demoLaneModel=runtime_config.get_demo_lane_model(),
        demoLanePrompt=runtime_config.get_demo_lane_prompt(),
    )


@router.get("/v1/admin/settings", response_model=SettingsOut)
async def get_settings(_admin: User = Depends(require_admin)) -> SettingsOut:
    return _current_settings()


@router.put("/v1/admin/settings", response_model=SettingsOut)
async def update_settings(
    req: SettingsUpdate, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> SettingsOut:
    fields = req.model_fields_set
    if "apiKey" in fields:
        await service.update_api_key(db, req.apiKey)
    if "model" in fields:
        await service.update_model(db, req.model)
    if "demoLaneEnabled" in fields:
        await service.update_demo_lane_enabled(db, bool(req.demoLaneEnabled))
    if "demoLaneModel" in fields:
        await service.update_demo_lane_model(db, req.demoLaneModel)
    if "demoLanePrompt" in fields:
        await service.update_demo_lane_prompt(db, req.demoLanePrompt)
    return _current_settings()


# 任意登录用户都可查询「是否已配置 Key」，用于前端无 Key 提醒横幅。
@router.get("/v1/config/status", response_model=ConfigStatusOut)
async def config_status(_user: User = Depends(get_current_user)) -> ConfigStatusOut:
    return ConfigStatusOut(hasApiKey=runtime_config.has_api_key(), model=runtime_config.get_model())


# ===== Phase 5：当前用户额度 =====
@router.get("/v1/me/credits", response_model=MeCreditsOut)
async def my_credits(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> MeCreditsOut:
    events = await credits_service.list_events(db, user_id=user.id, limit=30)
    return MeCreditsOut(credits=user.credits, events=[UsageEventOut.of(e) for e in events])


# ===== Phase 5：管理后台 =====
@router.get("/v1/admin/users", response_model=list[AdminUserOut])
async def admin_users(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return [AdminUserOut.of(u) for u in await service.list_users(db)]


@router.post("/v1/admin/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    req: CreateUserRequest, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    email = (req.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入合法邮箱")
    if not req.password or len(req.password) < 8:
        raise HTTPException(status_code=400, detail="密码至少 8 位")
    role = req.role if req.role in ("user", "admin") else "user"
    if req.initialCredits < 0:
        raise HTTPException(status_code=400, detail="初始额度不能为负")
    try:
        u = await service.create_user(
            db, email=email, password=req.password, display_name=req.displayName,
            role=role, initial_credits=req.initialCredits,
        )
    except service.AdminError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)
    return AdminUserOut.of(u)


@router.post("/v1/admin/users/{user_id}/grant", response_model=AdminUserOut)
async def admin_grant(
    user_id: str, req: GrantRequest, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    if req.amount == 0:
        raise HTTPException(status_code=400, detail="发放额度不能为 0")
    try:
        u = await service.grant_credits(db, user_id=user_id, amount=req.amount, reason=req.reason or "admin_grant")
    except service.AdminError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    return AdminUserOut.of(u)


@router.get("/v1/admin/jobs", response_model=list[AdminJobOut])
async def admin_jobs(
    status: str | None = None, limit: int = 100, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    rows = await service.list_jobs(db, status=status, limit=limit)
    return [AdminJobOut.of(j, email) for (j, email) in rows]


@router.get("/v1/admin/usage")
async def admin_usage(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.usage_stats(db)
