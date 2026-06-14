from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .. import runtime_config
from ..auth.deps import get_current_user, require_admin
from ..db.base import get_db
from ..db.models import User
from . import service
from .schemas import ConfigStatusOut, SettingsOut, SettingsUpdate

router = APIRouter(tags=["admin"])


def _current_settings() -> SettingsOut:
    return SettingsOut(
        hasApiKey=runtime_config.has_api_key(),
        apiKeyMasked=runtime_config.masked_api_key(),
        keySource=runtime_config.key_source(),
        model=runtime_config.get_model(),
        availableModels=runtime_config.AVAILABLE_MODELS,
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
    return _current_settings()


# 任意登录用户都可查询「是否已配置 Key」，用于前端无 Key 提醒横幅。
@router.get("/v1/config/status", response_model=ConfigStatusOut)
async def config_status(_user: User = Depends(get_current_user)) -> ConfigStatusOut:
    return ConfigStatusOut(hasApiKey=runtime_config.has_api_key(), model=runtime_config.get_model())
