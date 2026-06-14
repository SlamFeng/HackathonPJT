from __future__ import annotations

from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user
from ..db.base import get_db
from ..db.models import User
from ..storage import content_type_for, storage
from . import service

router = APIRouter(tags=["files"])


@router.get("/v1/files/{key}")
async def get_file(
    key: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    safe_key = PurePosixPath(key).name  # 防路径穿越
    if not await storage.exists(safe_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    rec = await service.get_record(db, safe_key)
    if rec is None:
        # 未登记（生成中间图等）：仅管理员可访问
        if user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    elif rec.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    data = await storage.read(safe_key)
    ctype = (rec.content_type if rec else None) or content_type_for(safe_key)
    # 私有缓存：允许浏览器缓存，但不进共享缓存
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "private, max-age=3600"})
