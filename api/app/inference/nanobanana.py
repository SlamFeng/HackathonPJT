from __future__ import annotations

import base64
import mimetypes
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx

from ..settings import settings


class NanobananaProvider:
    async def _download_image(self, url: str, *, timeout: float) -> tuple[bytes, str]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content_type = (resp.headers.get("content-type") or "").split(";")[0].strip()
            if not content_type.startswith("image/"):
                guessed, _ = mimetypes.guess_type(url)
                content_type = guessed or "image/jpeg"
            return resp.content, content_type

    def _save_image(self, image_bytes: bytes, mime_type: str) -> str:
        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/webp": ".webp",
        }.get(mime_type, ".png")
        file_name = f"{uuid.uuid4()}{ext}"
        storage_dir = Path(__file__).resolve().parents[2] / settings.storage_dir
        storage_dir.mkdir(parents=True, exist_ok=True)
        out_path = storage_dir / file_name
        out_path.write_bytes(image_bytes)
        return f"/static/{file_name}"

    def _build_prompt(self, *, task: str, inputs: dict[str, Any]) -> str:
        if task == "vton_tryon":
            pose_id = inputs.get("poseId") or "neutral_stand"
            return (
                "You are a professional virtual try-on image model.\n"
                "Use the first image as the person reference and the second image as the garment reference.\n"
                f"Generate a photorealistic image of the person wearing the garment in pose '{pose_id}'.\n"
                "Preserve the person's identity, face, body proportions, and background.\n"
                "Keep garment logos, textures, and colors accurate. Natural lighting and realistic fabric folds."
            )
        if task == "pose_render":
            pose_id = inputs.get("poseId") or "neutral_stand"
            return (
                "Re-render the person in the reference image into the requested pose while preserving identity.\n"
                f"Requested pose: '{pose_id}'.\n"
                "Photorealistic, keep background consistent, natural lighting."
            )
        if task == "avatar_generate":
            return (
                "Generate a photorealistic full-body avatar image based on the reference photo.\n"
                "Preserve identity and make the result suitable for later virtual try-on."
            )
        return "Generate a photorealistic image based on the provided references."

    async def _call_gemini(self, *, task: str, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        api_key = settings.nanobanana_api_key
        model = settings.nanobanana_model
        if not api_key or not model:
            raise RuntimeError("Missing NANOBANANA_API_KEY or NANOBANANA_MODEL")

        timeout = float((constraints or {}).get("timeoutSec", 30))

        parts: list[dict[str, Any]] = []
        prompt = self._build_prompt(task=task, inputs=inputs)

        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            if not avatar_url or not garment_url:
                raise RuntimeError("Missing avatarImageUrl or garmentImageUrl")

            avatar_bytes, avatar_mime = await self._download_image(str(avatar_url), timeout=timeout)
            garment_bytes, garment_mime = await self._download_image(str(garment_url), timeout=timeout)

            parts.append(
                {
                    "inline_data": {
                        "mime_type": avatar_mime,
                        "data": base64.b64encode(avatar_bytes).decode("ascii"),
                    }
                }
            )
            parts.append(
                {
                    "inline_data": {
                        "mime_type": garment_mime,
                        "data": base64.b64encode(garment_bytes).decode("ascii"),
                    }
                }
            )
            parts.append({"text": prompt})
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl")
            if not image_url:
                raise RuntimeError("Missing imageUrl")

            image_bytes, image_mime = await self._download_image(str(image_url), timeout=timeout)
            parts.append(
                {
                    "inline_data": {
                        "mime_type": image_mime,
                        "data": base64.b64encode(image_bytes).decode("ascii"),
                    }
                }
            )
            parts.append({"text": prompt})

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {"x-goog-api-key": api_key}
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        image_bytes: Optional[bytes] = None
        image_mime: str = "image/png"
        for cand in data.get("candidates", []):
            content = cand.get("content") or {}
            for part in content.get("parts", []) or []:
                inline = part.get("inline_data") or part.get("inlineData")
                if not inline:
                    continue
                b64 = inline.get("data")
                if not b64:
                    continue
                image_mime = inline.get("mime_type") or inline.get("mimeType") or image_mime
                image_bytes = base64.b64decode(b64)
                break
            if image_bytes:
                break

        if not image_bytes:
            raise RuntimeError("Gemini did not return image data")

        out_url = self._save_image(image_bytes, image_mime)
        return {"imageUrl": out_url, "meta": {"provider": "gemini", "mode": "google", "model": model}}

    async def _call_remote(self, *, task: str, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        payload = {
            "task": task,
            "inputs": inputs,
            "constraints": constraints or {},
        }
        headers = {"Authorization": f"Bearer {settings.nanobanana_api_key}"}
        timeout = float((constraints or {}).get("timeoutSec", 30))

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(str(settings.nanobanana_endpoint), json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            out_url = data.get("imageUrl") or data.get("output", {}).get("imageUrl") or data.get("url")
            return {"imageUrl": out_url, "meta": {"provider": "nanobanana", "mode": "remote"}}

    async def _call(self, *, task: str, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        if settings.nanobanana_api_key and settings.nanobanana_endpoint:
            return await self._call_remote(task=task, inputs=inputs, constraints=constraints)
        if settings.nanobanana_api_key and settings.nanobanana_model:
            return await self._call_gemini(task=task, inputs=inputs, constraints=constraints)

        image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
        return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock"}}

    async def avatar_generate(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        return await self._call(task="avatar_generate", inputs=inputs, constraints=constraints)

    async def pose_render(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        return await self._call(task="pose_render", inputs=inputs, constraints=constraints)

    async def vton_tryon(self, *, inputs: dict[str, Any], constraints: Optional[dict[str, Any]]) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints)
