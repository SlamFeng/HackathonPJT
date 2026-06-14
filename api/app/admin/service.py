from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import runtime_config
from ..credits import service as credits_service
from ..db.models import AppSetting, Job, UsageEvent, User

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


# ===== Phase 5：管理后台数据 =====
class AdminError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


async def list_users(db: AsyncSession, *, limit: int = 200) -> list[User]:
    res = await db.execute(select(User).order_by(User.created_at.desc()).limit(limit))
    return list(res.scalars().all())


async def grant_credits(db: AsyncSession, *, user_id: str, amount: int, reason: str) -> User:
    try:
        uid = uuid.UUID(str(user_id))
    except (ValueError, TypeError):
        raise AdminError("用户不存在")
    user = await db.get(User, uid)
    if user is None:
        raise AdminError("用户不存在")
    await credits_service.grant(db, user_id=user.id, amount=amount, reason=reason or "admin_grant")
    await db.refresh(user)
    return user


async def list_jobs(db: AsyncSession, *, status: str | None = None, limit: int = 100) -> list[tuple[Job, str]]:
    stmt = select(Job, User.email).join(User, Job.user_id == User.id)
    if status:
        stmt = stmt.where(Job.status == status)
    stmt = stmt.order_by(Job.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return [(row[0], row[1]) for row in res.all()]


async def usage_stats(db: AsyncSession) -> dict:
    async def _count(stmt) -> int:
        return int((await db.execute(stmt)).scalar() or 0)

    user_count = await _count(select(func.count()).select_from(User))
    total_jobs = await _count(select(func.count()).select_from(Job))
    succeeded = await _count(select(func.count()).select_from(Job).where(Job.status == "succeeded"))
    failed = await _count(select(func.count()).select_from(Job).where(Job.status == "failed"))
    running = await _count(select(func.count()).select_from(Job).where(Job.status.in_(["queued", "running"])))

    spent = int((await db.execute(
        select(func.coalesce(func.sum(UsageEvent.amount), 0)).where(UsageEvent.event_type == "spend")
    )).scalar() or 0)
    granted = int((await db.execute(
        select(func.coalesce(func.sum(UsageEvent.amount), 0)).where(UsageEvent.event_type == "grant")
    )).scalar() or 0)
    refunded = int((await db.execute(
        select(func.coalesce(func.sum(UsageEvent.amount), 0)).where(UsageEvent.event_type == "refund")
    )).scalar() or 0)

    # 近 7 天按天统计（取近 7 天任务在 Python 里分组，避免方言差异）
    since = datetime.now(timezone.utc) - timedelta(days=7)
    recent = (await db.execute(select(Job.created_at, Job.status).where(Job.created_at >= since))).all()
    by_day: dict[str, dict[str, int]] = {}
    for created_at, st in recent:
        day = created_at.astimezone(timezone.utc).strftime("%m-%d") if created_at.tzinfo else created_at.strftime("%m-%d")
        d = by_day.setdefault(day, {"jobs": 0, "succeeded": 0, "failed": 0})
        d["jobs"] += 1
        if st == "succeeded":
            d["succeeded"] += 1
        elif st == "failed":
            d["failed"] += 1
    last7 = [{"date": k, **v} for k, v in sorted(by_day.items())]

    denom = succeeded + failed
    return {
        "userCount": user_count,
        "jobTotals": {"total": total_jobs, "succeeded": succeeded, "failed": failed, "running": running},
        "successRate": round(succeeded / denom, 3) if denom else None,
        "credits": {"spent": -spent, "granted": granted, "refunded": refunded},
        "last7days": last7,
    }
