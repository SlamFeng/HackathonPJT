from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..db.models import Avatar, ClosetItem, PoseRender, TryonResult


# ---------- 数字人 ----------
class AvatarCreate(BaseModel):
    imageUrl: str
    name: str | None = Field(default=None, max_length=120)
    paramsJson: dict[str, Any] | None = None
    sourceJobId: str | None = Field(default=None, max_length=64)
    makeDefault: bool = True


class AvatarOut(BaseModel):
    id: str
    name: str | None
    imageUrl: str
    paramsJson: dict[str, Any] | None
    isDefault: bool
    status: str
    createdAt: datetime

    @classmethod
    def of(cls, a: Avatar) -> "AvatarOut":
        return cls(
            id=str(a.id), name=a.name, imageUrl=a.image_url, paramsJson=a.params_json,
            isDefault=a.is_default, status=a.status, createdAt=a.created_at,
        )


# ---------- 衣橱 ----------
class ClosetItemCreate(BaseModel):
    garmentType: str = Field(max_length=40)
    extractedImageUrl: str
    originalImageUrl: str | None = None
    name: str | None = Field(default=None, max_length=120)
    extractJobId: str | None = Field(default=None, max_length=64)


class ClosetItemOut(BaseModel):
    id: str
    name: str | None
    garmentType: str
    originalImageUrl: str | None
    extractedImageUrl: str
    favorited: bool
    createdAt: datetime

    @classmethod
    def of(cls, c: ClosetItem) -> "ClosetItemOut":
        return cls(
            id=str(c.id), name=c.name, garmentType=c.garment_type,
            originalImageUrl=c.original_image_url, extractedImageUrl=c.extracted_image_url,
            favorited=c.favorited, createdAt=c.created_at,
        )


# ---------- 姿态 ----------
class PoseRenderUpsert(BaseModel):
    poseKey: str = Field(max_length=40)
    imageUrl: str
    jobId: str | None = Field(default=None, max_length=64)


class PoseRenderOut(BaseModel):
    id: str
    avatarId: str
    poseKey: str
    imageUrl: str
    status: str
    updatedAt: datetime

    @classmethod
    def of(cls, p: PoseRender) -> "PoseRenderOut":
        return cls(
            id=str(p.id), avatarId=str(p.avatar_id), poseKey=p.pose_key,
            imageUrl=p.image_url, status=p.status, updatedAt=p.updated_at,
        )


# ---------- 试穿 ----------
class TryonCreate(BaseModel):
    avatarId: str
    imageUrl: str
    poseRenderId: str | None = None
    closetItemId: str | None = None
    poseKey: str | None = Field(default=None, max_length=40)
    jobId: str | None = Field(default=None, max_length=64)


class TryonOut(BaseModel):
    id: str
    avatarId: str
    poseRenderId: str | None
    closetItemId: str | None
    poseKey: str | None
    imageUrl: str
    createdAt: datetime
    updatedAt: datetime

    @classmethod
    def of(cls, t: TryonResult) -> "TryonOut":
        return cls(
            id=str(t.id), avatarId=str(t.avatar_id),
            poseRenderId=str(t.pose_render_id) if t.pose_render_id else None,
            closetItemId=str(t.closet_item_id) if t.closet_item_id else None,
            poseKey=t.pose_key, imageUrl=t.image_url,
            createdAt=t.created_at, updatedAt=t.updated_at,
        )
