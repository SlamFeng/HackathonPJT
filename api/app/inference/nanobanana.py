from __future__ import annotations

import base64
import mimetypes
import struct
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from ..generation_logs import generation_log_store
from ..prompts import build_prompt, self_correction_prompt
from ..settings import settings


class NanobananaProvider:
    @staticmethod
    def _get_image_dims(data: bytes) -> tuple[int, int] | None:
        """从图片二进制数据中解析宽高（支持PNG和JPEG）。"""
        if len(data) < 24:
            return None
        # PNG
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            w, h = struct.unpack('>II', data[16:24])
            return w, h
        # JPEG
        if data[:2] == b'\xff\xd8':
            i = 2
            while i < len(data) - 1:
                if data[i] != 0xff:
                    break
                marker = data[i+1]
                if marker in (0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0x01):
                    i += 2
                    continue
                if marker == 0xd9:  # EOI
                    break
                length = struct.unpack('>H', data[i+2:i+4])[0]
                if marker == 0xc0 or marker == 0xc1 or marker == 0xc2:
                    h, w = struct.unpack('>HH', data[i+5:i+9])
                    return w, h
                i += 2 + length
        return None

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

    def _storage_path(self) -> Path:
        base_dir = Path(__file__).resolve().parents[2]
        storage_path = base_dir / settings.storage_dir
        storage_path.mkdir(parents=True, exist_ok=True)
        return storage_path

    async def _read_uploaded_image(self, image_url: str, *, timeout: float = 20) -> tuple[bytes, str]:
        if image_url.startswith("/static/"):
            name = image_url.removeprefix("/static/").split("?", 1)[0]
            path = self._storage_path() / name
            data = path.read_bytes()
            mime = mimetypes.guess_type(str(path))[0] or "image/png"
            return data, mime

        if "/static/" in image_url:
            name = image_url.split("/static/", 1)[1].split("?", 1)[0]
            path = self._storage_path() / name
            if path.exists():
                data = path.read_bytes()
                mime = mimetypes.guess_type(str(path))[0] or "image/png"
                return data, mime

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
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def _endpoint_for_model(self, model: str) -> str:
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    @property
    def _model_fallback_chain(self) -> list[str]:
        """方案 C: 模型降级兜底链。主线模型失败时自动切到更稳定的 fallback 模型。"""
        primary = settings.nanobanana_model or "gemini-3.1-flash-image-preview"
        seen: list[str] = []
        for m in [primary, "gemini-2.5-flash-image"]:
            if m not in seen:
                seen.append(m)
        return seen

    async def _send_and_extract(
        self,
        *,
        parts: list[dict[str, Any]],
        timeout: float,
        modalities: list[str] | None = None,
        model: str,
    ) -> tuple[bytes, str, dict[str, Any] | None]:
        """发送请求给 Gemini 并提取返回的图片 bytes。集中处理各种异常。"""
        modalities = modalities or ["TEXT", "IMAGE"]
        endpoint = self._endpoint_for_model(model)
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": modalities},
        }
        headers = {
            "x-goog-api-key": settings.nanobanana_api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(endpoint, json=payload, headers=headers)
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                detail = ""
                try:
                    detail = e.response.text
                except Exception:
                    pass
                raise RuntimeError(f"NanoBanana 请求失败：HTTP {e.response.status_code} - {detail}") from e
            except httpx.TimeoutException as e:
                raise RuntimeError(f"NanoBanana 请求超时（timeoutSec={timeout}）") from e
            except httpx.RequestError as e:
                raise RuntimeError(f"NanoBanana 网络请求失败：{type(e).__name__}") from e

            data = resp.json()

        candidates = data.get("candidates") or []
        out_parts = (((candidates[0] if candidates else {}) or {}).get("content") or {}).get("parts") or []
        usage = data.get("usageMetadata") or data.get("usage_metadata")

        img_b64: str | None = None
        out_mime: str | None = None
        text_out: str | None = None

        for part in out_parts:
            if not isinstance(part, dict):
                continue
            if part.get("text"):
                text_out = part.get("text")
            blob = part.get("inlineData") or part.get("inline_data")
            if isinstance(blob, dict):
                img_b64 = blob.get("data")
                out_mime = blob.get("mimeType") or blob.get("mime_type")
                if img_b64:
                    break

        if img_b64:
            return base64.b64decode(img_b64), out_mime or "image/png", usage if isinstance(usage, dict) else None

        raise RuntimeError(f"模型 {model} 未返回图片（text={text_out!r}）")

    async def _generate_with_fallback(
        self,
        *,
        parts: list[dict[str, Any]],
        timeout: float,
        modalities: list[str] | None = None,
        round_index: int,
        kind: str,
        prompt: str,
        input_image_urls: list[str],
        log_id: str,
    ) -> tuple[bytes, str, str, dict[str, Any]]:
        """方案 C: 按 fallback 链依次尝试模型，直到任意模型返回图片。"""
        modalities = modalities or ["TEXT", "IMAGE"]
        last_errors: list[str] = []
        round_record: dict[str, Any] = {
            "roundIndex": round_index,
            "kind": kind,
            "prompt": prompt,
            "inputImageUrls": input_image_urls,
            "inputPartCount": len(parts),
            "outputImageUrl": None,
            "attempts": [],
        }

        for model in self._model_fallback_chain:
            started_at = int(time.time() * 1000)
            try:
                img_bytes, mime, usage = await self._send_and_extract(
                    parts=parts, timeout=timeout, modalities=modalities, model=model,
                )
                finished_at = int(time.time() * 1000)
                round_record["attempts"].append({
                    "model": model,
                    "status": "succeeded",
                    "startedAtMs": started_at,
                    "finishedAtMs": finished_at,
                    "durationMs": finished_at - started_at,
                    "usageMetadata": usage,
                })
                return img_bytes, mime, model, round_record
            except RuntimeError as e:
                finished_at = int(time.time() * 1000)
                last_errors.append(f"{model}: {str(e)}")
                round_record["attempts"].append({
                    "model": model,
                    "status": "failed",
                    "startedAtMs": started_at,
                    "finishedAtMs": finished_at,
                    "durationMs": finished_at - started_at,
                    "error": str(e),
                })
                continue

        round_record["error"] = f"所有模型均失败: {'; '.join(last_errors)}"
        await generation_log_store.append_round(log_id, round_record)
        raise RuntimeError(round_record["error"])

    async def _self_correction_round(
        self,
        *,
        task: str,
        original_image_urls: list[str],
        round1_url: str,
        original_timeout: float,
        log_id: str,
        inputs: dict[str, Any] | None = None,
    ) -> tuple[bytes, str, str, dict[str, Any]] | None:
        """
        方案 B - Round 2 自修正：
        把 Round 1 的结果图 + 原始输入图 + 修正 prompt 再次发送给 Gemini，
        让模型自我检查并修复典型问题（裁切、畸形、服装缺失、纯文本等）。
        如果自修正失败返回 None，由上层保留 Round 1 结果降级。
        """
        try:
            correction_text = self_correction_prompt(task=task, inputs=inputs)
            # ====== 调试日志：打印完整 Round 2 自修正 prompt ======
            sep = "=" * 40
            print(f"\n{sep}")
            print(f"[ROUND2 SELF-CORRECTION] task={task}  poseId={inputs.get('poseId','?') if inputs else '?'}")
            print(f"{sep}")
            print(correction_text)
            print(f"{sep}\n", flush=True)

            parts: list[dict[str, Any]] = [{"text": correction_text}]

            r1_bytes, r1_mime = await self._read_uploaded_image(round1_url, timeout=15)
            parts.append({
                "inlineData": {"mimeType": r1_mime, "data": base64.b64encode(r1_bytes).decode("utf-8")},
            })

            for url in original_image_urls:
                try:
                    ref_bytes, ref_mime = await self._read_uploaded_image(str(url), timeout=15)
                    parts.append({
                        "inlineData": {"mimeType": ref_mime, "data": base64.b64encode(ref_bytes).decode("utf-8")},
                    })
                except Exception:
                    continue

            corr_timeout = max(30.0, original_timeout * 0.6)
            img_bytes, mime, model, round_record = await self._generate_with_fallback(
                parts=parts,
                timeout=corr_timeout,
                round_index=2,
                kind="self_correction",
                prompt=correction_text,
                input_image_urls=[round1_url, *original_image_urls],
                log_id=log_id,
            )
            return img_bytes, mime, model, round_record
        except Exception:
            return None

    async def _call(
        self,
        *,
        task: str,
        inputs: dict[str, Any],
        constraints: dict[str, Any] | None,
        job_id: str | None = None,
    ) -> dict[str, Any]:
        log_id = await generation_log_store.start(job_id=job_id, task=task, inputs=inputs, constraints=constraints)
        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            garment_category = inputs.get("garmentCategory")
            pose_id = inputs.get("poseId")
            if not avatar_url or not garment_url:
                result = {
                    "imageUrl": avatar_url or garment_url,
                    "meta": {"provider": "nanobanana", "mode": "mock", "reason": "missing_avatar_or_garment", "generationLogId": log_id},
                }
                await generation_log_store.finish(log_id, status="succeeded", final_image_url=result["imageUrl"], meta=result["meta"])
                return result
            if not settings.nanobanana_api_key:
                result = {
                    "imageUrl": avatar_url,
                    "meta": {
                        "provider": "nanobanana", "mode": "mock", "reason": "missing_api_key",
                        "overlayGarmentImageUrl": garment_url,
                        "overlayTransform": self._default_overlay_transform(str(garment_category) if garment_category is not None else None),
                        "generationLogId": log_id,
                    },
                }
                await generation_log_store.finish(log_id, status="succeeded", final_image_url=result["imageUrl"], meta=result["meta"])
                return result
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
            if not settings.nanobanana_api_key or not image_url:
                result = {
                    "imageUrl": image_url,
                    "meta": {
                        "provider": "nanobanana",
                        "mode": "mock",
                        "reason": "missing_api_key_or_image",
                        "generationLogId": log_id,
                    },
                }
                await generation_log_store.finish(log_id, status="succeeded", final_image_url=result["imageUrl"], meta=result["meta"])
                return result
            if task not in ("avatar_generate", "pose_render"):
                result = {
                    "imageUrl": image_url,
                    "meta": {
                        "provider": "nanobanana",
                        "mode": "mock",
                        "reason": "task_not_implemented",
                        "generationLogId": log_id,
                    },
                }
                await generation_log_store.finish(log_id, status="succeeded", final_image_url=result["imageUrl"], meta=result["meta"])
                return result

        timeout = constraints.get("timeoutSec", 180) if constraints else 180

        # ====== 注入输入图片的实际分辨率，用于精确提示模型保持画幅尺寸 ======
        if task == "vton_tryon":
            avt_url = inputs.get("avatarImageUrl") or inputs.get("imageUrl")
            if avt_url:
                avt_bytes, _ = await self._read_uploaded_image(str(avt_url), timeout=15)
                dims = self._get_image_dims(avt_bytes)
                if dims:
                    w, h = dims
                    inputs = dict(inputs)  # copy to avoid mutating original
                    inputs["_avatarWidth"] = w
                    inputs["_avatarHeight"] = h
                    print(f"[DIMS] avatar image: {w}x{h}", flush=True)
        else:
            img_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl")
            if img_url:
                try:
                    img_bytes, _ = await self._read_uploaded_image(str(img_url), timeout=15)
                    dims = self._get_image_dims(img_bytes)
                    if dims:
                        print(f"[DIMS] input image: {dims[0]}x{dims[1]}", flush=True)
                except Exception:
                    pass

        prompt = build_prompt(task=task, inputs=inputs, constraints=constraints)
        # ====== 调试日志：打印完整 Round 1 prompt ======
        separator = "=" * 40
        print(f"\n{separator}")
        print(f"[ROUND1 PROMPT] task={task}  poseId={inputs.get('poseId','?')}")
        print(f"{separator}")
        print(prompt)
        print(f"{separator}\n", flush=True)

        parts: list[dict[str, Any]] = [{"text": prompt}]
        meta: dict[str, Any] = {"provider": "nanobanana", "mode": "remote", "generationLogId": log_id}
        # 用于排查前后端参数/拼接是否一致（不包含完整 prompt，避免过长）
        if "poseId" in inputs:
            meta["poseId"] = inputs.get("poseId")
        if "garmentCategory" in inputs:
            meta["garmentCategory"] = inputs.get("garmentCategory")
        original_image_urls: list[str] = []

        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            garment_category = inputs.get("garmentCategory")
            pose_id = inputs.get("poseId")
            if not avatar_url or not garment_url:
                raise RuntimeError("缺少 avatarImageUrl 或 garmentImageUrl")
            avatar_bytes, avatar_mime = await self._read_uploaded_image(str(avatar_url), timeout=min(20, float(timeout)))
            garment_bytes, garment_mime = await self._read_uploaded_image(str(garment_url), timeout=min(20, float(timeout)))
            original_image_urls = [str(avatar_url), str(garment_url)]
            meta["overlayTransform"] = self._default_overlay_transform(str(garment_category) if garment_category is not None else None)
            meta["notes"] = "品类规则定位"
            parts.append({"inlineData": {"mimeType": avatar_mime, "data": base64.b64encode(avatar_bytes).decode("utf-8")}})
            parts.append({"inlineData": {"mimeType": garment_mime, "data": base64.b64encode(garment_bytes).decode("utf-8")}})
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
            if not image_url:
                raise RuntimeError("缺少输入图片")
            img_bytes, mime = await self._read_uploaded_image(str(image_url), timeout=min(20, float(timeout)))
            original_image_urls = [str(image_url)]
            parts.append({"inlineData": {"mimeType": mime, "data": base64.b64encode(img_bytes).decode("utf-8")}})

        # ---- Round 1: 带降级兜底生成（方案 C） ----
        try:
            r1_bytes, r1_mime, model_used, r1_round = await self._generate_with_fallback(
                parts=parts,
                timeout=timeout,
                round_index=1,
                kind="initial_generation",
                prompt=prompt,
                input_image_urls=original_image_urls,
                log_id=log_id,
            )
        except Exception as e:
            await generation_log_store.finish(log_id, status="failed", error=str(e), meta=meta)
            raise
        meta["model"] = model_used
        r1_url = self._save_generated_image(r1_bytes, r1_mime)
        r1_round["outputImageUrl"] = r1_url
        await generation_log_store.append_round(log_id, r1_round)

        # ---- Round 2: 自修正（方案 B，失败不影响最终结果） ----
        correction = await self._self_correction_round(
            task=task,
            original_image_urls=original_image_urls,
            round1_url=r1_url,
            original_timeout=timeout,
            log_id=log_id,
            inputs=inputs,
        )

        if correction is not None:
            corr_bytes, corr_mime, corr_model, corr_round = correction
            final_url = self._save_generated_image(corr_bytes, corr_mime)
            corr_round["outputImageUrl"] = final_url
            await generation_log_store.append_round(log_id, corr_round)
            meta["selfCorrection"] = True
            meta["selfCorrectionModel"] = corr_model
            meta["model"] = f"{model_used}->{corr_model}"
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=final_url, meta=meta)
            return {"imageUrl": final_url, "meta": meta}
        else:
            meta["selfCorrection"] = False
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=r1_url, meta=meta)
            return {"imageUrl": r1_url, "meta": meta}

    async def avatar_generate(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        return await self._call(task="avatar_generate", inputs=inputs, constraints=constraints, job_id=job_id)

    async def pose_render(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        return await self._call(task="pose_render", inputs=inputs, constraints=constraints, job_id=job_id)

    async def vton_tryon(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints, job_id=job_id)
