from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UsageEvent, User

# 各任务类型消耗的额度（大致正比于供应商调用次数；可后续配置化）
COSTS: dict[str, int] = {
    "avatar_generate": 2,
    "pose_render": 1,
    "garment_extract": 1,
    "vton_tryon": 2,
    "outfit_render": 2,
}


def cost_for(job_type: str) -> int:
    return COSTS.get(job_type, 1)


async def balance(db: AsyncSession, user_id: uuid.UUID) -> int:
    u = await db.get(User, user_id)
    return u.credits if u else 0


async def grant(
    db: AsyncSession, *, user_id: uuid.UUID, amount: int, reason: str, job_id: uuid.UUID | None = None
) -> None:
    """发放额度（注册赠送 / 管理员充值）。"""
    await db.execute(update(User).where(User.id == user_id).values(credits=User.credits + amount))
    db.add(UsageEvent(user_id=user_id, job_id=job_id, event_type="grant", amount=amount, reason=reason))
    await db.commit()


async def try_spend(db: AsyncSession, *, user: User, amount: int, reason: str) -> UsageEvent | None:
    """原子扣减：仅当余额足够才扣（防并发超额）。成功返回消费事件，不足返回 None。"""
    if amount <= 0:
        return None
    res = await db.execute(
        update(User).where(User.id == user.id, User.credits >= amount).values(credits=User.credits - amount)
    )
    if res.rowcount != 1:
        await db.rollback()
        return None
    ev = UsageEvent(user_id=user.id, event_type="spend", amount=-amount, reason=reason)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def attach_job(db: AsyncSession, *, event_id: uuid.UUID, job_id: uuid.UUID) -> None:
    await db.execute(update(UsageEvent).where(UsageEvent.id == event_id).values(job_id=job_id))
    await db.commit()


async def refund_job(
    db: AsyncSession, *, user_id: uuid.UUID, job_id: uuid.UUID, amount: int, reason: str
) -> bool:
    """任务失败退款，按 job 去重（一个任务最多退一次）。"""
    if amount <= 0:
        return False
    existing = (
        await db.execute(
            select(UsageEvent.id).where(UsageEvent.job_id == job_id, UsageEvent.event_type == "refund")
        )
    ).first()
    if existing is not None:
        return False
    await db.execute(update(User).where(User.id == user_id).values(credits=User.credits + amount))
    db.add(UsageEvent(user_id=user_id, job_id=job_id, event_type="refund", amount=amount, reason=reason))
    await db.commit()
    return True


async def list_events(db: AsyncSession, *, user_id: uuid.UUID, limit: int = 50) -> list[UsageEvent]:
    res = await db.execute(
        select(UsageEvent)
        .where(UsageEvent.user_id == user_id)
        .order_by(UsageEvent.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())
