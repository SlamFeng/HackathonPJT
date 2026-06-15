from __future__ import annotations

import uuid
from pathlib import Path

from ..settings import settings


class LocalStorage:
    """本地文件系统存储（零配置默认）。对象保存在 api/storage/ 下，key 即文件名。"""

    def __init__(self) -> None:
        # 本文件位于 app/storage/local.py：parents[2] = api/
        base = Path(__file__).resolve().parents[2] / settings.storage_dir
        base.mkdir(parents=True, exist_ok=True)
        self._base = base

    def _path(self, key: str) -> Path:
        # 只取文件名，防止路径穿越（../ 之类）
        return self._base / Path(key).name

    async def save(self, data: bytes, ext: str) -> str:
        if ext and not ext.startswith("."):
            ext = "." + ext
        if ext == ".jpe":
            ext = ".jpg"
        key = f"{uuid.uuid4().hex}{ext or '.png'}"
        self._path(key).write_bytes(data)
        return key

    async def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()

    async def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()
