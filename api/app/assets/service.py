from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Avatar, ClosetItem, PoseRender, TryonResult, User


class AssetError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise AssetError("NOT_FOUND", "资源不存在")


# ---------- 数字人 ----------
async def create_avatar(
    db: AsyncSession, *, user: User, image_url: str, name: str | None,
    params_json: dict[str, Any] | None, source_job_id: str | None, make_default: bool,
) -> Avatar:
    has_any = (await db.execute(select(Avatar.id).where(Avatar.user_id == user.id).limit(1))).first()
    is_default = make_default or has_any is None
    if is_default:
        await db.execute(update(Avatar).where(Avatar.user_id == user.id).values(is_default=False))
    avatar = Avatar(
        user_id=user.id, image_url=image_url, name=name, params_json=params_json,
        source_job_id=source_job_id, is_default=is_default,
    )
    db.add(avatar)
    await db.commit()
    await db.refresh(avatar)
    return avatar


async def list_avatars(db: AsyncSession, *, user: User) -> list[Avatar]:
    res = await db.execute(
        select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at.desc())
    )
    return list(res.scalars().all())


async def get_owned_avatar(db: AsyncSession, *, user: User, avatar_id: str) -> Avatar:
    avatar = await db.get(Avatar, _uuid(avatar_id))
    if avatar is None or avatar.user_id != user.id:
        raise AssetError("NOT_FOUND", "数字人不存在")
    return avatar


async def set_default_avatar(db: AsyncSession, *, user: User, avatar_id: str) -> Avatar:
    avatar = await get_owned_avatar(db, user=user, avatar_id=avatar_id)
    await db.execute(update(Avatar).where(Avatar.user_id == user.id).values(is_default=False))
    avatar.is_default = True
    await db.commit()
    await db.refresh(avatar)
    return avatar


async def delete_avatar(db: AsyncSession, *, user: User, avatar_id: str) -> None:
    avatar = await get_owned_avatar(db, user=user, avatar_id=avatar_id)
    was_default = avatar.is_default
    await db.delete(avatar)
    await db.commit()
    if was_default:
        # 删掉的是默认数字人，把最近一个补为默认
        latest = (await db.execute(
            select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        if latest is not None:
            latest.is_default = True
            await db.commit()


# ---------- 衣橱 ----------
async def create_closet_item(
    db: AsyncSession, *, user: User, garment_type: str, extracted_image_url: str,
    original_image_url: str | None, name: str | None, extract_job_id: str | None,
) -> ClosetItem:
    item = ClosetItem(
        user_id=user.id, garment_type=garment_type, extracted_image_url=extracted_image_url,
        original_image_url=original_image_url, name=name, extract_job_id=extract_job_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_closet_items(db: AsyncSession, *, user: User) -> list[ClosetItem]:
    res = await db.execute(
        select(ClosetItem).where(ClosetItem.user_id == user.id).order_by(ClosetItem.created_at.desc())
    )
    return list(res.scalars().all())


async def delete_closet_item(db: AsyncSession, *, user: User, item_id: str) -> None:
    item = await db.get(ClosetItem, _uuid(item_id))
    if item is None or item.user_id != user.id:
        raise AssetError("NOT_FOUND", "单品不存在")
    await db.delete(item)
    await db.commit()


async def toggle_favorite(db: AsyncSession, *, user: User, item_id: str) -> ClosetItem:
    item = await db.get(ClosetItem, _uuid(item_id))
    if item is None or item.user_id != user.id:
        raise AssetError("NOT_FOUND", "单品不存在")
    item.favorited = not item.favorited
    await db.commit()
    await db.refresh(item)
    return item


# ---------- 姿态（按 avatar+pose_key 唯一，存在则覆盖） ----------
async def upsert_pose(
    db: AsyncSession, *, user: User, avatar_id: str, pose_key: str, image_url: str, job_id: str | None,
) -> PoseRender:
    avatar = await get_owned_avatar(db, user=user, avatar_id=avatar_id)
    existing = (await db.execute(
        select(PoseRender).where(PoseRender.avatar_id == avatar.id, PoseRender.pose_key == pose_key)
    )).scalar_one_or_none()
    if existing is not None:
        existing.image_url = image_url
        existing.job_id = job_id
        existing.status = "succeeded"
        await db.commit()
        await db.refresh(existing)
        return existing
    pose = PoseRender(
        user_id=user.id, avatar_id=avatar.id, pose_key=pose_key, image_url=image_url, job_id=job_id,
    )
    db.add(pose)
    await db.commit()
    await db.refresh(pose)
    return pose


async def list_poses(db: AsyncSession, *, user: User, avatar_id: str) -> list[PoseRender]:
    avatar = await get_owned_avatar(db, user=user, avatar_id=avatar_id)
    res = await db.execute(select(PoseRender).where(PoseRender.avatar_id == avatar.id))
    return list(res.scalars().all())


# ---------- 试穿（按 avatar+pose_key+closet_item 唯一，重新试穿覆盖） ----------
async def upsert_tryon(
    db: AsyncSession, *, user: User, avatar_id: str, image_url: str,
    pose_render_id: str | None, closet_item_id: str | None, pose_key: str | None, job_id: str | None,
) -> TryonResult:
    avatar = await get_owned_avatar(db, user=user, avatar_id=avatar_id)
    pr_uuid = _uuid(pose_render_id) if pose_render_id else None
    ci_uuid = _uuid(closet_item_id) if closet_item_id else None
    existing = None
    if pose_key is not None and ci_uuid is not None:
        existing = (await db.execute(
            select(TryonResult).where(
                TryonResult.avatar_id == avatar.id,
                TryonResult.pose_key == pose_key,
                TryonResult.closet_item_id == ci_uuid,
            )
        )).scalar_one_or_none()
    if existing is not None:
        existing.image_url = image_url
        existing.pose_render_id = pr_uuid
        existing.job_id = job_id
        await db.commit()
        await db.refresh(existing)
        return existing
    tryon = TryonResult(
        user_id=user.id, avatar_id=avatar.id, pose_render_id=pr_uuid, closet_item_id=ci_uuid,
        pose_key=pose_key, image_url=image_url, job_id=job_id,
    )
    db.add(tryon)
    await db.commit()
    await db.refresh(tryon)
    return tryon


async def list_tryons(db: AsyncSession, *, user: User, avatar_id: str | None) -> list[TryonResult]:
    stmt = select(TryonResult).where(TryonResult.user_id == user.id)
    if avatar_id:
        stmt = stmt.where(TryonResult.avatar_id == _uuid(avatar_id))
    stmt = stmt.order_by(TryonResult.updated_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def delete_tryon(db: AsyncSession, *, user: User, tryon_id: str) -> None:
    tryon = await db.get(TryonResult, _uuid(tryon_id))
    if tryon is None or tryon.user_id != user.id:
        raise AssetError("NOT_FOUND", "试穿记录不存在")
    await db.delete(tryon)
    await db.commit()
