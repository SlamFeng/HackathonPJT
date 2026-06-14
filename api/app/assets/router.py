from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user
from ..db.base import get_db
from ..db.models import User
from . import service
from .schemas import (
    AvatarCreate,
    AvatarOut,
    ClosetItemCreate,
    ClosetItemOut,
    PoseRenderOut,
    PoseRenderUpsert,
    TryonCreate,
    TryonOut,
)

router = APIRouter(prefix="/v1", tags=["assets"])


def _not_found(e: service.AssetError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)


# ---------- 数字人 ----------
@router.post("/avatars", response_model=AvatarOut, status_code=status.HTTP_201_CREATED)
async def create_avatar(req: AvatarCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = await service.create_avatar(
        db, user=user, image_url=req.imageUrl, name=req.name, params_json=req.paramsJson,
        source_job_id=req.sourceJobId, make_default=req.makeDefault,
    )
    return AvatarOut.of(a)


@router.get("/avatars", response_model=list[AvatarOut])
async def list_avatars(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return [AvatarOut.of(a) for a in await service.list_avatars(db, user=user)]


@router.post("/avatars/{avatar_id}/default", response_model=AvatarOut)
async def set_default(avatar_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return AvatarOut.of(await service.set_default_avatar(db, user=user, avatar_id=avatar_id))
    except service.AssetError as e:
        raise _not_found(e)


@router.delete("/avatars/{avatar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(avatar_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await service.delete_avatar(db, user=user, avatar_id=avatar_id)
    except service.AssetError as e:
        raise _not_found(e)


# ---------- 衣橱 ----------
@router.post("/closet-items", response_model=ClosetItemOut, status_code=status.HTTP_201_CREATED)
async def create_closet_item(req: ClosetItemCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await service.create_closet_item(
        db, user=user, garment_type=req.garmentType, extracted_image_url=req.extractedImageUrl,
        original_image_url=req.originalImageUrl, name=req.name, extract_job_id=req.extractJobId,
    )
    return ClosetItemOut.of(c)


@router.get("/closet-items", response_model=list[ClosetItemOut])
async def list_closet_items(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return [ClosetItemOut.of(c) for c in await service.list_closet_items(db, user=user)]


@router.post("/closet-items/{item_id}/favorite", response_model=ClosetItemOut)
async def toggle_favorite(item_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return ClosetItemOut.of(await service.toggle_favorite(db, user=user, item_id=item_id))
    except service.AssetError as e:
        raise _not_found(e)


@router.delete("/closet-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_closet_item(item_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await service.delete_closet_item(db, user=user, item_id=item_id)
    except service.AssetError as e:
        raise _not_found(e)


# ---------- 姿态 ----------
@router.put("/avatars/{avatar_id}/poses/{pose_key}", response_model=PoseRenderOut)
async def upsert_pose(
    avatar_id: str, pose_key: str, req: PoseRenderUpsert,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    try:
        p = await service.upsert_pose(
            db, user=user, avatar_id=avatar_id, pose_key=pose_key, image_url=req.imageUrl, job_id=req.jobId,
        )
        return PoseRenderOut.of(p)
    except service.AssetError as e:
        raise _not_found(e)


@router.get("/avatars/{avatar_id}/poses", response_model=list[PoseRenderOut])
async def list_poses(avatar_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return [PoseRenderOut.of(p) for p in await service.list_poses(db, user=user, avatar_id=avatar_id)]
    except service.AssetError as e:
        raise _not_found(e)


# ---------- 试穿 ----------
@router.post("/tryon-results", response_model=TryonOut, status_code=status.HTTP_201_CREATED)
async def create_tryon(req: TryonCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        t = await service.upsert_tryon(
            db, user=user, avatar_id=req.avatarId, image_url=req.imageUrl,
            pose_render_id=req.poseRenderId, closet_item_id=req.closetItemId,
            pose_key=req.poseKey, job_id=req.jobId,
        )
        return TryonOut.of(t)
    except service.AssetError as e:
        raise _not_found(e)


@router.get("/tryon-results", response_model=list[TryonOut])
async def list_tryons(avatarId: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return [TryonOut.of(t) for t in await service.list_tryons(db, user=user, avatar_id=avatarId)]


@router.delete("/tryon-results/{tryon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tryon(tryon_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await service.delete_tryon(db, user=user, tryon_id=tryon_id)
    except service.AssetError as e:
        raise _not_found(e)
