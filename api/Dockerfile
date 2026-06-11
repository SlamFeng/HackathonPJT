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
RUN mkdir -p storage data

EXPOSE 8000

# main.py 内为 `from app.main import app`
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
