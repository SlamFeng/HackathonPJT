from __future__ import annotations

import base64
import mimetypes
import uuid
from pathlib import Path
from typing import Any

import httpx

from ..settings import settings


class NanobananaProvider:
    def _storage_path(self) -> Path:
        # api/app/inference/nanobanana.py -> parents[2] == api/
        base_dir = Path(__file__).resolve().parents[2]
        storage_path = base_dir / settings.storage_dir
        storage_path.mkdir(parents=True, exist_ok=True)
        return storage_path

    async def _read_uploaded_image(self, image_url: str, *, timeout: float = 20) -> tuple[bytes, str]:
        """
        前端上传后会拿到形如：
          - /static/<id>.png
          - http://localhost:8000/static/<id>.png
        这里优先把它映射到本地 storage 目录读取 bytes，避免再走 HTTP 回环。
        """
        # 允许直接传相对路径
        if image_url.startswith("/static/"):
            name = image_url.removeprefix("/static/").split("?", 1)[0]
            path = self._storage_path() / name
            data = path.read_bytes()
            mime = mimetypes.guess_type(str(path))[0] or "image/png"
            return data, mime

        # 允许传绝对 URL
        if "/static/" in image_url:
            name = image_url.split("/static/", 1)[1].split("?", 1)[0]
            path = self._storage_path() / name
            if path.exists():
                data = path.read_bytes()
                mime = mimetypes.guess_type(str(path))[0] or "image/png"
                return data, mime

        # 最后兜底：去拉取外部 URL（需要对方可访问）
        mime = "image/png"
        try:
            mime = mimetypes.guess_type(image_url)[0] or mime
        except Exception:
            pass
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            return resp.content, mime

    def _save_generated_image(self, image_bytes: bytes, mime: str | None = None) -> str:
        mime = mime or "image/png"
        ext = mimetypes.guess_extension(mime) or ".png"
        if ext == ".jpe":
            ext = ".jpg"
        out_name = f"{uuid.uuid4().hex}{ext}"
        out_path = self._storage_path() / out_name
        out_path.write_bytes(image_bytes)
        return f"/static/{out_name}"

    def _default_endpoint(self) -> str:
        model = settings.nanobanana_model or "gemini-3.1-flash-image-preview"
        # 文档：POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def _build_avatar_prompt(self, *, body_params: dict[str, Any] | None) -> str:
        # 目标：生成“可试穿的基础数字人”——身份保持优先，背景干净，衣着尽量简洁。
        # 注意：这里仅作为 MVP prompt，可后续做成模板化 preset。
        parts: list[str] = [
            "请基于我提供的全身照片生成一张“数字人基础形象（avatar base）”图片：",
            "1) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与原图一致；",
            "2) 输出为写实风格、光线均匀、细节清晰；",
            "3) 背景替换为干净的浅色影棚背景（接近纯色），不要杂物；",
            "4) 人物保持全身可见（从头到脚），居中，尽量保持原姿态；",
            "5) 服装尽量简洁贴身（例如纯色上衣+简单长裤），便于后续虚拟试穿叠加；",
            "6) 不要添加文字、水印、边框或额外人物。",
        ]
        if body_params:
            # 以“指导”而非“强制改形”为主，避免出现畸形
            hp = body_params.get("heightCm")
            wp = body_params.get("weightKg")
            if hp or wp:
                parts.append(f"体型参数参考（仅用于轻微修正比例，不要夸张变形）：身高={hp}cm，体重={wp}kg。")
        return "\n".join(parts)

    async def _call(self, *, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
        if not settings.nanobanana_api_key or not image_url:
            return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock", "reason": "missing_api_key_or_image"}}

        # 仅先落地 avatar_generate（数字人生成）。其它任务先走 mock，避免误调用到 generateContent。
        if task != "avatar_generate":
            return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock", "reason": "task_not_implemented"}}

        timeout = constraints.get("timeoutSec", 60) if constraints else 60

        # 读取上传图片 bytes
        img_bytes, mime = await self._read_uploaded_image(image_url, timeout=min(20, float(timeout)))
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        prompt = self._build_avatar_prompt(body_params=inputs.get("bodyParams"))
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            # Gemini API 的 JSON 字段名使用驼峰（inlineData / mimeType）。
                            # 部分旧示例会写成 inline_data / mime_type，但在 v1beta 下可能导致 400。
                            "inlineData": {
                                "mimeType": mime,
                                "data": b64,
                            },
                        },
                    ]
                }
            ],
            # 生成图片必须声明希望返回 IMAGE（否则可能仅返回文本）。
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }
        endpoint = settings.nanobanana_endpoint or self._default_endpoint()
        headers = {
            "x-goog-api-key": settings.nanobanana_api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(endpoint, json=payload, headers=headers)
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                # 把 Gemini 的详细错误信息返回给上层（否则只有“400 Bad Request”不利于排查）
                detail = ""
                try:
                    detail = e.response.text
                except Exception:
                    pass
                raise RuntimeError(f"NanoBanana 请求失败：HTTP {e.response.status_code} - {detail}") from e
            except httpx.TimeoutException as e:
                raise RuntimeError(f"NanoBanana 请求超时（timeoutSec={timeout}）") from e
            except httpx.RequestError as e:
                # 网络/DNS/SSL 等
                raise RuntimeError(f"NanoBanana 网络请求失败：{type(e).__name__}") from e

            data = resp.json()

            # 从返回 candidates[0].content.parts 中提取图片 inline data
            candidates = data.get("candidates") or []
            parts = (((candidates[0] if candidates else {}) or {}).get("content") or {}).get("parts") or []
            img_b64: str | None = None
            out_mime: str | None = None

            for part in parts:
                if not isinstance(part, dict):
                    continue
                blob = part.get("inlineData") or part.get("inline_data")
                if isinstance(blob, dict):
                    img_b64 = blob.get("data")
                    out_mime = blob.get("mimeType") or blob.get("mime_type")
                    if img_b64:
                        break

            if not img_b64:
                # 兜底：把文本返回出来便于排查
                text_out = None
                for part in parts:
                    if isinstance(part, dict) and part.get("text"):
                        text_out = part.get("text")
                        break
                raise RuntimeError(f"NanoBanana 未返回图片（text={text_out!r}）")

            out_bytes = base64.b64decode(img_b64)
            out_url = self._save_generated_image(out_bytes, out_mime)
            return {"imageUrl": out_url, "meta": {"provider": "nanobanana", "mode": "remote", "model": settings.nanobanana_model}}

    async def avatar_generate(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="avatar_generate", inputs=inputs, constraints=constraints)

    async def pose_render(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="pose_render", inputs=inputs, constraints=constraints)

    async def vton_tryon(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints)
