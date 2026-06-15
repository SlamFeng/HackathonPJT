from __future__ import annotations

from ..settings import settings
from .base import Storage, content_type_for
from .local import LocalStorage

# 按配置选择存储后端。默认本地（零配置）。
# 上 S3/R2/OSS 时：实现 .s3.S3Storage，并在此处按 settings.storage_backend == "s3" 装配，
# 业务层（上传、/v1/files、文件删除）无需改动。
if settings.storage_backend == "s3":
    # 预留接入点：尚未实现 S3 后端，当前回退到本地，避免误配置导致启动失败。
    print("[storage] STORAGE_BACKEND=s3 尚未实现，暂回退到本地存储", flush=True)
    storage: Storage = LocalStorage()
else:
    storage = LocalStorage()

__all__ = ["storage", "Storage", "content_type_for"]
