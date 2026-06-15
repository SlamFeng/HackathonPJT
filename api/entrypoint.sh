#!/bin/sh
set -e

# 数据库初始化：
# - Postgres（生产/compose 默认）：跑 alembic 迁移确保表结构最新。
# - SQLite（lite 最小成本部署）：没有迁移流程，由应用 startup 的 init_models() 自动建表，
#   这里跳过 alembic（SQLite 上跑 PG 迁移既无必要也可能不兼容）。
case "${DATABASE_URL}" in
  sqlite*)
    echo "[entrypoint] SQLite detected -> skip alembic (tables auto-created on startup)"
    ;;
  *)
    echo "[entrypoint] running database migrations..."
    alembic upgrade head
    ;;
esac

echo "[entrypoint] starting api..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
