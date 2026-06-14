from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Job, User


def _uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


async def create_or_get(
    db: AsyncSession,
    *,
    user: User,
    job_type: str,
    provider_preference: str | None,
    inputs: dict[str, Any],
    constraints: dict[str, Any] | None,
    idempotency_key: str | None,
) -> tuple[Job, bool]:
    """创建排队任务；若同一用户的同一幂等键已存在则返回已有任务。返回 (job, created)。"""
    if idempotency_key:
        existing = (
            await db.execute(
                select(Job).where(Job.user_id == user.id, Job.idempotency_key == idempotency_key)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False

    job = Job(
        user_id=user.id,
        job_type=job_type,
        provider_preference=provider_preference,
        status="queued",
        stage="queued",
        progress=0.0,
        input_json=inputs,
        constraints_json=constraints,
        idempotency_key=idempotency_key,
    )
    db.add(job)
    try:
        await db.commit()
    except IntegrityError:
        # 并发下同一幂等键被另一个请求抢先插入：回滚并返回已有任务
        await db.rollback()
        existing = (
            await db.execute(
                select(Job).where(Job.user_id == user.id, Job.idempotency_key == idempotency_key)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False
        raise
    await db.refresh(job)
    return job, True


async def get_owned(db: AsyncSession, *, user: User, job_id: str) -> Job | None:
    jid = _uuid(job_id)
    if jid is None:
        return None
    job = await db.get(Job, jid)
    if job is None:
        return None
    if user.role != "admin" and job.user_id != user.id:
        return None  # 不泄露他人任务是否存在（路由层按 404 处理）
    return job


async def claim_next(db: AsyncSession) -> Job | None:
    """原子领取一个排队任务（compare-and-swap，SQLite/Postgres 通用）。"""
    cand = (
        await db.execute(select(Job.id).where(Job.status == "queued").order_by(Job.created_at).limit(1))
    ).scalar_one_or_none()
    if cand is None:
        return None
    res = await db.execute(
        update(Job)
        .where(Job.id == cand, Job.status == "queued")
        .values(status="running", stage="running", progress=0.05, started_at=func.now())
    )
    await db.commit()
    if res.rowcount == 1:
        return await db.get(Job, cand)
    return None  # 被其它 worker 抢走，调用方会再次轮询


async def set_progress(db: AsyncSession, job_id: uuid.UUID, *, stage: str, progress: float) -> None:
    await db.execute(update(Job).where(Job.id == job_id).values(stage=stage, progress=progress))
    await db.commit()


async def mark_succeeded(
    db: AsyncSession, job_id: uuid.UUID, *, artifacts: list[dict[str, Any]], quality: dict[str, Any] | None
) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(
            status="succeeded", stage="done", progress=1.0,
            artifacts_json=artifacts, quality_json=quality, finished_at=func.now(),
        )
    )
    await db.commit()


async def mark_failed(db: AsyncSession, job_id: uuid.UUID, *, error: dict[str, Any]) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="failed", stage="failed", progress=1.0, error_json=error, finished_at=func.now())
    )
    await db.commit()


async def recover_stuck(db: AsyncSession) -> int:
    """启动时把上次崩溃残留的 running 任务重置为 queued，实现「重启不丢、继续执行」。"""
    res = await db.execute(
        update(Job)
        .where(Job.status == "running")
        .values(status="queued", stage="queued", progress=0.0, started_at=None, retry_count=Job.retry_count + 1)
    )
    await db.commit()
    return res.rowcount
