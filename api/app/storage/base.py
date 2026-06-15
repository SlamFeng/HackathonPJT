from __future__ import annotations

import mimetypes
from typing import Protocol


class Storage(Protocol):
    """图片存储后端抽象。本地与 S3/R2/OSS 都实现这套接口，业务层不感知差异。"""

    async def save(self, data: bytes, ext: str) -> str:
        """保存一份数据，返回对象 key（如 <uuid>.png）。"""
        ...

    async def read(self, key: str) -> bytes: ...

    async def exists(self, key: str) -> bool: ...

    async def delete(self, key: str) -> None: ...


def content_type_for(key: str) -> str:
    return mimetypes.guess_type(key)[0] or "application/octet-stream"
