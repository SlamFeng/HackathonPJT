#!/bin/sh
set -e

# 等待数据库迁移完成后再启动应用。
# compose 里 api 依赖 db 健康检查，这里再跑一次迁移确保表结构最新。
echo "[entrypoint] running database migrations..."
alembic upgrade head

echo "[entrypoint] starting api..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
