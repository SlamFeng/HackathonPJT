from __future__ import annotations

from typing import Any

import httpx

from ..settings import settings


class NanobananaProvider:
    async def _call(self, *, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
        if not settings.nanobanana_api_key or not settings.nanobanana_endpoint or not image_url:
            return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock"}}

        payload = {
            "task": task,
            "inputs": inputs,
            "constraints": constraints or {},
        }
        headers = {"Authorization": f"Bearer {settings.nanobanana_api_key}"}

        async with httpx.AsyncClient(timeout=constraints.get("timeoutSec", 30) if constraints else 30) as client:
            resp = await client.post(settings.nanobanana_endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            out_url = data.get("imageUrl") or data.get("output", {}).get("imageUrl") or data.get("url")
            return {"imageUrl": out_url, "meta": {"provider": "nanobanana", "mode": "remote", "raw": data}}

    async def avatar_generate(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="avatar_generate", inputs=inputs, constraints=constraints)

    async def pose_render(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="pose_render", inputs=inputs, constraints=constraints)

    async def vton_tryon(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints)

