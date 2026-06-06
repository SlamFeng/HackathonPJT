from __future__ import annotations

from typing import Any, Optional, Protocol


class InferenceResult(Protocol):
    image_url: str
    meta: Optional[dict[str, Any]]


class InferenceProvider(Protocol):
    async def avatar_generate(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        ...

    async def pose_render(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        ...

    async def vton_tryon(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        ...
