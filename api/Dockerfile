FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# 先装依赖，利用 Docker 层缓存
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝应用代码（storage/ data/ .env 已由 .dockerignore 排除）
COPY . .

# 运行时生成的图片与日志目录（生产建议挂载为持久卷）
RUN mkdir -p storage data && chmod +x entrypoint.sh

EXPOSE 8000

# entrypoint 先跑 alembic 迁移，再启动 uvicorn
CMD ["./entrypoint.sh"]
