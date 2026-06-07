from __future__ import annotations

from typing import Any, Protocol


class InferenceResult(Protocol):
    image_url: str
    meta: dict[str, Any] | None


class InferenceProvider(Protocol):
    async def avatar_generate(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        ...

    async def pose_render(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        ...

    async def vton_tryon(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        ...
