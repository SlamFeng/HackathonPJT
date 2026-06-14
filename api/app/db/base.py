from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from ..settings import settings


class Base(DeclarativeBase):
    pass


# 引擎是惰性的：导入时不会真正连接数据库，首次查询才建立连接。
engine = create_async_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def is_sqlite() -> bool:
    return settings.database_url.startswith("sqlite")


async def init_models() -> None:
    """SQLite 本地零配置模式下自动建表。

    Postgres / 容器部署走 Alembic 迁移（entrypoint.sh 里 alembic upgrade head），
    不会调用这里；本机直接双击启动脚本时用 SQLite，没有迁移流程，靠它建表。
    导入 models 以确保所有表都注册到 Base.metadata。
    """
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
