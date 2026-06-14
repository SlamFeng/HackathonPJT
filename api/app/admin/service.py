from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import runtime_config
from ..db.models import AppSetting

KEY_API = "nanobanana_api_key"
KEY_MODEL = "nanobanana_model"


async def _upsert(db: AsyncSession, key: str, value: str | None) -> None:
    row = await db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    await db.commit()


async def load_into_runtime(db: AsyncSession) -> None:
    """启动时把 DB 里保存的运行时配置载入内存（覆盖 .env 默认）。"""
    rows = (await db.execute(select(AppSetting))).scalars().all()
    for r in rows:
        if r.key == KEY_API:
            runtime_config.set_api_key(r.value)
        elif r.key == KEY_MODEL:
            runtime_config.set_model(r.value)


async def update_api_key(db: AsyncSession, value: str | None) -> None:
    await _upsert(db, KEY_API, value or None)
    runtime_config.set_api_key(value)


async def update_model(db: AsyncSession, value: str | None) -> None:
    await _upsert(db, KEY_MODEL, value or None)
    runtime_config.set_model(value)
