from __future__ import annotations

import base64
import json
import mimetypes
import uuid
from pathlib import Path
from typing import Any

import httpx

from ..prompts import build_prompt
from ..settings import settings


class NanobananaProvider:
    def _default_overlay_transform(self, category: str | None) -> dict[str, Any]:
        c = (category or "").lower()
        if c == "top":
            return {"cx": 0.5, "cy": 0.40, "w": 0.66, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "outerwear":
            return {"cx": 0.5, "cy": 0.42, "w": 0.74, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "dress":
            return {"cx": 0.5, "cy": 0.54, "w": 0.74, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "suit":
            return {"cx": 0.5, "cy": 0.52, "w": 0.78, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "skirt":
            return {"cx": 0.5, "cy": 0.62, "w": 0.70, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "pants":
            return {"cx": 0.5, "cy": 0.70, "w": 0.62, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "underwear":
            return {"cx": 0.5, "cy": 0.52, "w": 0.66, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        if c == "shoes":
            return {"cx": 0.5, "cy": 0.88, "w": 0.50, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}
        return {"cx": 0.5, "cy": 0.50, "w": 0.70, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply"}

    def _extract_json_obj(self, text: str) -> dict[str, Any] | None:
        s = text.strip()
        if not s:
            return None
        start = s.find("{")
        end = s.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        blob = s[start : end + 1]
        try:
            obj = json.loads(blob)
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None

    async def _predict_vton_overlay(
        self,
        *,
        avatar_bytes: bytes,
        avatar_mime: str,
        garment_bytes: bytes,
        garment_mime: str,
        category: str | None,
        pose_id: str | None,
        timeout: float,
    ) -> dict[str, Any]:
        endpoint = settings.nanobanana_endpoint or self._default_endpoint()
        headers = {"x-goog-api-key": settings.nanobanana_api_key, "Content-Type": "application/json"}

        prompt = "\n".join(
            [
                "你是专业的人体结构识别与虚拟试穿定位助手。",
                "输入：两张图片。图片A=人物，图片B=服装单品。",
                "输出：只输出一个 JSON 对象，不要输出任何多余文字。",
                "",
                "目标：给出一个“叠加定位方案（overlayTransform）”用于把服装B覆盖到人物A的合理位置。",
                "必须尽量符合物理常识与遮挡关系：衣服在人体前方/后方、袖子位置、腰线、鞋子在脚踝下方等。",
                "如人物A被裁切、遮挡、姿态特殊，请优先保证位置不怪而不是强行贴合。",
                "",
                f"服装品类: {category or 'unknown'}",
                f"姿态提示: {pose_id or 'unknown'}",
                "",
                "JSON schema（所有坐标均为人物图片A的归一化比例 0~1）：",
                "{",
                '  "overlayTransform": { "cx": 0.5, "cy": 0.5, "w": 0.7, "rotationDeg": 0, "opacity": 0.85, "blendMode": "multiply" },',
                '  "keypoints": { "leftShoulder": [0.0,0.0], "rightShoulder": [0.0,0.0], "waist": [0.0,0.0], "leftAnkle": [0.0,0.0], "rightAnkle": [0.0,0.0] },',
                '  "notes": "一句话解释定位逻辑与遮挡考虑"',
                "}",
            ]
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": avatar_mime, "data": base64.b64encode(avatar_bytes).decode("utf-8")}},
                        {"inlineData": {"mimeType": garment_mime, "data": base64.b64encode(garment_bytes).decode("utf-8")}},
                    ]
                }
            ],
            "generationConfig": {"responseModalities": ["TEXT"]},
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates") or []
        parts = (((candidates[0] if candidates else {}) or {}).get("content") or {}).get("parts") or []
        texts: list[str] = []
        for part in parts:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                texts.append(part["text"])
        obj = self._extract_json_obj("\n".join(texts))
        if not obj:
            return {
                "overlayTransform": self._default_overlay_transform(category),
                "keypoints": None,
                "notes": "模型未返回可解析 JSON，使用规则估算",
            }

        overlay = obj.get("overlayTransform")
        if not isinstance(overlay, dict):
            overlay = self._default_overlay_transform(category)
        else:
            try:
                cx = float(overlay.get("cx", 0.5))
                cy = float(overlay.get("cy", 0.5))
                w = float(overlay.get("w", 0.7))
                rot = float(overlay.get("rotationDeg", 0))
                opacity = float(overlay.get("opacity", 0.85))
                blend = overlay.get("blendMode", "multiply")
                if not isinstance(blend, str):
                    blend = "multiply"
                overlay = {
                    "cx": max(0.0, min(1.0, cx)),
                    "cy": max(0.0, min(1.0, cy)),
                    "w": max(0.15, min(0.95, w)),
                    "rotationDeg": max(-25.0, min(25.0, rot)),
                    "opacity": max(0.15, min(1.0, opacity)),
                    "blendMode": blend,
                }
            except Exception:
                overlay = self._default_overlay_transform(category)

        keypoints = obj.get("keypoints") if isinstance(obj.get("keypoints"), dict) else None
        notes = obj.get("notes") if isinstance(obj.get("notes"), str) else None
        return {"overlayTransform": overlay, "keypoints": keypoints, "notes": notes}

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

    async def _call(self, *, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            garment_category = inputs.get("garmentCategory")
            pose_id = inputs.get("poseId")
            if not avatar_url or not garment_url:
                return {
                    "imageUrl": avatar_url or garment_url,
                    "meta": {"provider": "nanobanana", "mode": "mock", "reason": "missing_avatar_or_garment"},
                }
            if not settings.nanobanana_api_key:
                return {
                    "imageUrl": avatar_url,
                    "meta": {
                        "provider": "nanobanana",
                        "mode": "mock",
                        "reason": "missing_api_key",
                        "overlayGarmentImageUrl": garment_url,
                        "overlayTransform": self._default_overlay_transform(str(garment_category) if garment_category is not None else None),
                    },
                }
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
            if not settings.nanobanana_api_key or not image_url:
                return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock", "reason": "missing_api_key_or_image"}}

            if task != "avatar_generate":
                return {"imageUrl": image_url, "meta": {"provider": "nanobanana", "mode": "mock", "reason": "task_not_implemented"}}

        timeout = constraints.get("timeoutSec", 60) if constraints else 60

        prompt = build_prompt(task=task, inputs=inputs, constraints=constraints)
        parts: list[dict[str, Any]] = [{"text": prompt}]
        meta: dict[str, Any] = {"provider": "nanobanana", "mode": "remote", "model": settings.nanobanana_model}
        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            garment_category = inputs.get("garmentCategory")
            pose_id = inputs.get("poseId")
            if not avatar_url or not garment_url:
                raise RuntimeError("缺少 avatarImageUrl 或 garmentImageUrl")
            avatar_bytes, avatar_mime = await self._read_uploaded_image(str(avatar_url), timeout=min(20, float(timeout)))
            garment_bytes, garment_mime = await self._read_uploaded_image(str(garment_url), timeout=min(20, float(timeout)))
            try:
                overlay = await self._predict_vton_overlay(
                    avatar_bytes=avatar_bytes,
                    avatar_mime=avatar_mime,
                    garment_bytes=garment_bytes,
                    garment_mime=garment_mime,
                    category=str(garment_category) if garment_category is not None else None,
                    pose_id=str(pose_id) if pose_id is not None else None,
                    timeout=min(30.0, float(timeout)),
                )
                meta["overlayTransform"] = overlay.get("overlayTransform")
                meta["keypoints"] = overlay.get("keypoints")
                meta["notes"] = overlay.get("notes")
            except Exception as e:
                meta["overlayTransform"] = self._default_overlay_transform(str(garment_category) if garment_category is not None else None)
                meta["notes"] = f"overlay 预测失败：{type(e).__name__}"
            parts.append(
                {
                    "inlineData": {
                        "mimeType": avatar_mime,
                        "data": base64.b64encode(avatar_bytes).decode("utf-8"),
                    }
                }
            )
            parts.append(
                {
                    "inlineData": {
                        "mimeType": garment_mime,
                        "data": base64.b64encode(garment_bytes).decode("utf-8"),
                    }
                }
            )
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
            if not image_url:
                raise RuntimeError("缺少输入图片")
            img_bytes, mime = await self._read_uploaded_image(str(image_url), timeout=min(20, float(timeout)))
            parts.append(
                {
                    "inlineData": {
                        "mimeType": mime,
                        "data": base64.b64encode(img_bytes).decode("utf-8"),
                    }
                }
            )

        payload = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
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
            meta["overlayGarmentImageUrl"] = inputs.get("garmentImageUrl")
            return {"imageUrl": out_url, "meta": meta}

    async def avatar_generate(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="avatar_generate", inputs=inputs, constraints=constraints)

    async def pose_render(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="pose_render", inputs=inputs, constraints=constraints)

    async def vton_tryon(self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints)
