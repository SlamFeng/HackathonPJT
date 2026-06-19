from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import User, UserSession
from ..settings import settings
from .security import hash_password, hash_token, new_session_token, verify_password


class AuthError(Exception):
    """业务级鉴权错误，由路由层翻译成 HTTP 状态码。"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware_utc(dt: datetime) -> datetime:
    """把可能为 naive 的时间统一成 UTC aware。

    Postgres 的 timestamptz 读回来是 aware；SQLite 不存时区，读回来是 naive。
    本地 SQLite 模式下若不归一化，naive 与 aware 比较会抛 TypeError。
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email.lower()))
    return res.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str | None,
    role: str = "user",
    initial_credits: int | None = None,
) -> User:
    """创建用户。

    initial_credits=None：使用默认注册赠送额度（自助注册 / seed_admin）。
    initial_credits=N：发放指定额度（管理员后台建号，可为 0，不走"注册赠送"避免白嫖）。
    """
    email = email.lower()
    if await get_user_by_email(db, email) is not None:
        raise AuthError("EMAIL_TAKEN", "该邮箱已被注册")
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        role=role,
        status="active",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    # Phase 5：赠送额度（账本记一笔 grant）
    from ..credits import service as credits_service  # 局部导入避免循环依赖

    if initial_credits is None:
        grant_amount, reason = settings.credit_signup_grant, "signup_grant"
    else:
        grant_amount, reason = initial_credits, "admin_create_grant"
    if grant_amount and grant_amount > 0:
        await credits_service.grant(db, user_id=user.id, amount=grant_amount, reason=reason)
        await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError("INVALID_CREDENTIALS", "邮箱或密码错误")
    if user.status != "active":
        raise AuthError("ACCOUNT_DISABLED", "账号已停用")
    user.last_login_at = _now()
    await db.commit()
    return user


async def create_session(db: AsyncSession, *, user: User) -> str:
    """创建会话，返回明文 token（仅此一次，数据库只存哈希）。"""
    token = new_session_token()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=_now() + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    await db.commit()
    return token


async def resolve_session(db: AsyncSession, token: str) -> User | None:
    res = await db.execute(
        select(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    session = res.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return None
    if _as_aware_utc(session.expires_at) <= _now():
        return None
    user = await db.get(User, session.user_id)
    if user is None or user.status != "active":
        return None
    return user


async def revoke_session(db: AsyncSession, token: str) -> None:
    res = await db.execute(
        select(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    session = res.scalar_one_or_none()
    if session is not None and session.revoked_at is None:
        session.revoked_at = _now()
        await db.commit()


async def seed_admin(db: AsyncSession) -> None:
    """根据环境变量幂等创建管理员账号。"""
    if not settings.admin_email or not settings.admin_password:
        return
    existing = await get_user_by_email(db, settings.admin_email)
    if existing is not None:
        return
    await create_user(
        db,
        email=settings.admin_email,
        password=settings.admin_password,
        display_name="Admin",
        role="admin",
    )
