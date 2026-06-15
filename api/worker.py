"""独立 worker 进程入口（Docker / 拆分部署用）。

本地零配置默认由 API 进程内跑 worker，无需用到这个文件。
拆分部署时：把 API 的 WORKER_IN_PROCESS=false，再单独运行：

    python worker.py

它与 API 共用同一个数据库，轮询 jobs 表执行生成任务。
"""
from __future__ import annotations

import asyncio

from app.db.base import init_models, is_sqlite
from app.jobs import worker
from app.settings import settings


async def _main() -> None:
    # 独立进程下若用 SQLite 也确保表存在（生产用 Postgres 由 alembic 迁移负责）
    if is_sqlite():
        await init_models()
    print(
        f"[worker] standalone starting (concurrency={settings.worker_concurrency}, "
        f"poll={settings.worker_poll_interval_sec}s)",
        flush=True,
    )
    await worker.run_forever(settings.worker_concurrency, settings.worker_poll_interval_sec)


if __name__ == "__main__":
    asyncio.run(_main())
