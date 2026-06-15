from __future__ import annotations

import uuid
from pathlib import PurePosixPath

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import FileObject
from ..storage import storage

_FILES_PREFIX = "/v1/files/"
_STATIC_PREFIX = "/static/"


def key_from_url(url: str | None) -> str | None:
    """从 /v1/files/<key> 或 /static/<key>（含绝对 URL）中解析出存储 key。"""
    if not url:
        return None
    s = str(url).split("?", 1)[0]
    for prefix in (_FILES_PREFIX, _STATIC_PREFIX):
        idx = s.find(prefix)
        if idx != -1:
            return s[idx + len(prefix):].strip("/") or None
    return None


def file_url(key: str) -> str:
    return f"{_FILES_PREFIX}{key}"


async def register(db: AsyncSession, *, key: str, user_id: uuid.UUID, content_type: str | None) -> None:
    """登记图片归属（幂等）。"""
    key = PurePosixPath(key).name  # 防穿越
    existing = await db.get(FileObject, key)
    if existing is None:
        db.add(FileObject(key=key, user_id=user_id, content_type=content_type))
    else:
        existing.user_id = user_id
        if content_type:
            existing.content_type = content_type
    await db.commit()


async def register_url(db: AsyncSession, *, url: str | None, user_id: uuid.UUID, content_type: str | None) -> None:
    key = key_from_url(url)
    if key:
        await register(db, key=key, user_id=user_id, content_type=content_type)


async def get_record(db: AsyncSession, key: str) -> FileObject | None:
    return await db.get(FileObject, PurePosixPath(key).name)


async def delete_by_url(db: AsyncSession, url: str | None) -> None:
    """删除资产时调用：删登记 + best-effort 删存储对象，使删后不可再访问。"""
    key = key_from_url(url)
    if not key:
        return
    key = PurePosixPath(key).name
    rec = await db.get(FileObject, key)
    if rec is not None:
        await db.delete(rec)
        await db.commit()
    try:
        await storage.delete(key)
    except Exception:
        pass
