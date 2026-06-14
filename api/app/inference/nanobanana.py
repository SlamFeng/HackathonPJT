from __future__ import annotations

import base64
import mimetypes
import struct
import time
import uuid
import zlib
from pathlib import Path
from typing import Any

import httpx

from .. import runtime_config
from ..generation_logs import generation_log_store
from ..prompts import build_prompt, self_correction_prompt
from ..settings import settings


class NanobananaProvider:
    @staticmethod
    def _decode_png_rgb(data: bytes) -> tuple[int, int, bytes] | None:
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            return None

        pos = 8
        width = height = bit_depth = color_type = None
        idat = bytearray()
        while pos + 8 <= len(data):
            length = struct.unpack(">I", data[pos:pos + 4])[0]
            chunk_type = data[pos + 4:pos + 8]
            chunk_data = data[pos + 8:pos + 8 + length]
            pos += 12 + length
            if chunk_type == b"IHDR":
                width, height = struct.unpack(">II", chunk_data[:8])
                bit_depth = chunk_data[8]
                color_type = chunk_data[9]
            elif chunk_type == b"IDAT":
                idat.extend(chunk_data)
            elif chunk_type == b"IEND":
                break

        if not width or not height or bit_depth != 8 or color_type not in (2, 6):
            return None

        channels = 3 if color_type == 2 else 4
        stride = width * channels
        try:
            raw = zlib.decompress(bytes(idat))
        except Exception:
            return None

        rows: list[bytearray] = []
        offset = 0
        prev = bytearray(stride)
        for _ in range(height):
            if offset >= len(raw):
                return None
            filter_type = raw[offset]
            offset += 1
            row = bytearray(raw[offset:offset + stride])
            offset += stride
            if len(row) != stride:
                return None
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                up = prev[i]
                up_left = prev[i - channels] if i >= channels else 0
                if filter_type == 1:
                    row[i] = (row[i] + left) & 0xFF
                elif filter_type == 2:
                    row[i] = (row[i] + up) & 0xFF
                elif filter_type == 3:
                    row[i] = (row[i] + ((left + up) // 2)) & 0xFF
                elif filter_type == 4:
                    p = left + up - up_left
                    pa = abs(p - left)
                    pb = abs(p - up)
                    pc = abs(p - up_left)
                    pr = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                    row[i] = (row[i] + pr) & 0xFF
                elif filter_type != 0:
                    return None
            rows.append(row)
            prev = row

        rgb = bytearray(width * height * 3)
        out = 0
        for row in rows:
            for x in range(width):
                src = x * channels
                rgb[out:out + 3] = row[src:src + 3]
                out += 3
        return width, height, bytes(rgb)

    @staticmethod
    def _encode_png_rgb(width: int, height: int, rgb: bytes) -> bytes:
        def chunk(kind: bytes, payload: bytes) -> bytes:
            crc = zlib.crc32(kind)
            crc = zlib.crc32(payload, crc) & 0xFFFFFFFF
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)

        raw = bytearray()
        stride = width * 3
        for y in range(height):
            raw.append(0)
            start = y * stride
            raw.extend(rgb[start:start + stride])
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")

    @classmethod
    def _compose_overlay_png(
        cls,
        *,
        base_bytes: bytes,
        overlay_bytes: bytes,
        transform: dict[str, Any],
    ) -> bytes | None:
        base = cls._decode_png_rgb(base_bytes)
        overlay = cls._decode_png_rgb(overlay_bytes)
        if not base or not overlay:
            return None
        bw, bh, bp = base
        ow, oh, op = overlay
        out = bytearray(bp)
        target_w = max(1, int(bw * float(transform.get("w", 0.7))))
        target_h = max(1, int(target_w * oh / ow))
        cx = int(bw * float(transform.get("cx", 0.5)))
        cy = int(bh * float(transform.get("cy", 0.5)))
        left = cx - target_w // 2
        top = cy - target_h // 2
        opacity = max(0.0, min(1.0, float(transform.get("opacity", 0.85))))

        for y in range(target_h):
            by = top + y
            if by < 0 or by >= bh:
                continue
            sy = min(oh - 1, int(y * oh / target_h))
            for x in range(target_w):
                bx = left + x
                if bx < 0 or bx >= bw:
                    continue
                sx = min(ow - 1, int(x * ow / target_w))
                si = (sy * ow + sx) * 3
                sr, sg, sb = op[si], op[si + 1], op[si + 2]
                if sr > 238 and sg > 238 and sb > 238 and max(sr, sg, sb) - min(sr, sg, sb) < 18:
                    continue
                di = (by * bw + bx) * 3
                br, bg, bb = out[di], out[di + 1], out[di + 2]
                if str(transform.get("blendMode", "normal")) == "multiply":
                    nr, ng, nb = br * sr / 255, bg * sg / 255, bb * sb / 255
                else:
                    nr, ng, nb = sr, sg, sb
                out[di] = int(br * (1 - opacity) + nr * opacity)
                out[di + 1] = int(bg * (1 - opacity) + ng * opacity)
                out[di + 2] = int(bb * (1 - opacity) + nb * opacity)
        return cls._encode_png_rgb(bw, bh, bytes(out))

    @classmethod
    def _torso_difference_score(cls, original: bytes, candidate: bytes) -> float | None:
        a = cls._decode_png_rgb(original)
        b = cls._decode_png_rgb(candidate)
        if not a or not b:
            return None
        aw, ah, ap = a
        bw, bh, bp = b
        if aw != bw or ah != bh:
            return None
        x0, x1 = int(aw * 0.28), int(aw * 0.72)
        y0, y1 = int(ah * 0.20), int(ah * 0.66)
        total = 0
        count = 0
        step = 8
        for y in range(y0, y1, step):
            for x in range(x0, x1, step):
                i = (y * aw + x) * 3
                total += abs(ap[i] - bp[i]) + abs(ap[i + 1] - bp[i + 1]) + abs(ap[i + 2] - bp[i + 2])
                count += 3
        if count == 0:
            return None
        return total / (count * 255)

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
        # 本地图片（/v1/files/<key> 或 /static/<key>，含绝对 URL）：解析 key 直接读本地文件
        name: str | None = None
        for prefix in ("/v1/files/", "/static/"):
            if prefix in image_url:
                name = image_url.split(prefix, 1)[1].split("?", 1)[0].strip("/")
                break
        if name:
            path = self._storage_path() / Path(name).name
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
        # Phase 4：返回鉴权取图 URL（公开 /static 已移除）
        return f"/v1/files/{out_name}"

    def _default_endpoint(self) -> str:
        model = runtime_config.get_model()
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def _endpoint_for_model(self, model: str) -> str:
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def _garment_reference_prompt(self, *, category: str | None) -> str:
        return "\n".join([
            "你是一个专业的服装商品图提取工具。",
            "",
            "任务：从输入图片中提取最主要、最显眼的目标服装本体，生成一张干净的服装参考图。",
            "",
            "要求：",
            f"1) 前端品类参考：{category or '未指定'}，但请以图片中最主要服装为准。",
            "2) 如果图片中有人体/模特/脸/头发/手/腿/鞋/裤子/背景/品牌Logo/文字/水印，请全部移除。",
            "3) 只保留目标服装本体。若目标是外套/风衣/大衣/夹克，请保留完整外套，包括领口、袖子、门襟、腰带、纽扣、口袋、下摆长度。",
            "4) 不要保留模特姿势，不要保留人物身体，不要生成真人。",
            "5) 使用干净白色或浅灰纯色背景，服装居中，完整可见，不裁切。",
            "6) 必须返回一张图片，不要只返回文字说明。",
            "",
            "Hard rule in English: output an empty garment-only product image. No human, no face, no hair, no hands, no pants, no shoes, no mannequin body.",
        ])

    def _garment_reference_cleanup_prompt(self, *, category: str | None) -> str:
        return "\n".join([
            "你是一个专业的服装单品图清理工具。",
            "",
            "你会看到两张图：",
            "- 图片 A：上一轮提取出的服装参考图，可能仍残留人物、头脸、手、裤子或鞋子。",
            "- 图片 B：原始商品图，只用于确认目标服装的款式细节。",
            "",
            "任务：输出一张更干净、更适合虚拟试穿的服装单品参考图。",
            "",
            "硬性要求：",
            f"1) 前端品类参考：{category or '未指定'}，但以图片中最主要服装为准。",
            "2) 只保留目标服装本体。若是风衣/大衣/外套/夹克，请保留完整外套本身，包括领口、袖子、门襟、腰带、纽扣、口袋和下摆长度。",
            "3) 严禁输出任何人物、脸、头发、脖子、手、腿、裤子、鞋、模特身体、Logo、文字、水印或背景道具。",
            "4) 如果图片 A 里仍有人穿着服装，请把人体彻底移除，重建为空的服装单品图或隐形模特效果。",
            "5) 白色或浅灰纯色背景，服装居中、完整、正面可见，不裁切。",
            "6) 必须返回一张图片，不要只返回文字说明。",
            "",
            "English guardrail: create a clean empty garment-only reference image. Absolutely no person or body parts may remain.",
        ])

    @property
    def _model_fallback_chain(self) -> list[str]:
        """方案 C: 模型降级兜底链。主线模型失败时自动切到更稳定的 fallback 模型。"""
        primary = runtime_config.get_model()
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
            "x-goog-api-key": runtime_config.get_api_key(),
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
            for retry_index in range(2):
                started_at = int(time.time() * 1000)
                retry_parts = parts
                if retry_index > 0:
                    retry_parts = [
                        *parts,
                        {
                            "text": (
                                "上一次没有返回图片。请严格按任务要求执行图像编辑，"
                                "这一次必须返回一张图片，不要只返回文字或空响应。"
                            )
                        },
                    ]
                try:
                    img_bytes, mime, usage = await self._send_and_extract(
                        parts=retry_parts, timeout=timeout, modalities=modalities, model=model,
                    )
                    finished_at = int(time.time() * 1000)
                    round_record["attempts"].append({
                        "model": model,
                        "retryIndex": retry_index,
                        "status": "succeeded",
                        "startedAtMs": started_at,
                        "finishedAtMs": finished_at,
                        "durationMs": finished_at - started_at,
                        "usageMetadata": usage,
                    })
                    return img_bytes, mime, model, round_record
                except RuntimeError as e:
                    finished_at = int(time.time() * 1000)
                    last_errors.append(f"{model}[retry={retry_index}]: {str(e)}")
                    round_record["attempts"].append({
                        "model": model,
                        "retryIndex": retry_index,
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
            parts.append({"text": "【上一步生成结果：请检查并在必要时修复这张图】"})
            parts.append({
                "inlineData": {"mimeType": r1_mime, "data": base64.b64encode(r1_bytes).decode("utf-8")},
            })

            for index, url in enumerate(original_image_urls):
                try:
                    ref_bytes, ref_mime = await self._read_uploaded_image(str(url), timeout=15)
                    if task == "vton_tryon" and index == 0:
                        label = "【原始图片 A：目标人物。修复后必须保持此人的身份、姿态、背景和画幅】"
                    elif task == "vton_tryon" and index == 1:
                        label = "【原始图片 B：衣橱中的干净服装单品图。必须把这件服装穿到图片 A 人物身上】"
                    else:
                        label = f"【原始参考图片 {index + 1}】"
                    parts.append({"text": label})
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

    async def _extract_garment_reference(
        self,
        *,
        garment_url: str,
        garment_bytes: bytes,
        garment_mime: str,
        garment_category: str | None,
        timeout: float,
        log_id: str,
    ) -> tuple[bytes, str, str | None]:
        prompt = self._garment_reference_prompt(category=garment_category)
        parts: list[dict[str, Any]] = [
            {"text": prompt},
            {"text": "【输入商品图：请只提取其中最主要的服装本体，去掉人物/Logo/文字/背景】"},
            {"inlineData": {"mimeType": garment_mime, "data": base64.b64encode(garment_bytes).decode("utf-8")}},
        ]
        img_bytes, mime, model, round_record = await self._generate_with_fallback(
            parts=parts,
            timeout=max(30.0, min(float(timeout), 120.0)),
            round_index=0,
            kind="garment_reference_extraction",
            prompt=prompt,
            input_image_urls=[garment_url],
            log_id=log_id,
        )
        extracted_url = self._save_generated_image(img_bytes, mime)
        round_record["outputImageUrl"] = extracted_url
        round_record["model"] = model
        await generation_log_store.append_round(log_id, round_record)

        cleanup_prompt = self._garment_reference_cleanup_prompt(category=garment_category)
        cleanup_parts: list[dict[str, Any]] = [
            {"text": cleanup_prompt},
            {"text": "【图片 A：上一轮服装参考图。如有任何人体/裤鞋/头脸残留，请彻底移除】"},
            {"inlineData": {"mimeType": mime, "data": base64.b64encode(img_bytes).decode("utf-8")}},
            {"text": "【图片 B：原始商品图。只参考目标服装款式细节，忽略模特/Logo/文字/背景】"},
            {"inlineData": {"mimeType": garment_mime, "data": base64.b64encode(garment_bytes).decode("utf-8")}},
        ]
        try:
            clean_bytes, clean_mime, clean_model, clean_round = await self._generate_with_fallback(
                parts=cleanup_parts,
                timeout=max(30.0, min(float(timeout), 120.0)),
                round_index=0,
                kind="garment_reference_cleanup",
                prompt=cleanup_prompt,
                input_image_urls=[extracted_url, garment_url],
                log_id=log_id,
            )
            clean_url = self._save_generated_image(clean_bytes, clean_mime)
            clean_round["outputImageUrl"] = clean_url
            clean_round["model"] = clean_model
            await generation_log_store.append_round(log_id, clean_round)
            return clean_bytes, clean_mime, clean_url
        except Exception:
            return img_bytes, mime, extracted_url

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
            if not runtime_config.get_api_key():
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
            if not runtime_config.get_api_key() or not image_url:
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
        avatar_url_for_fallback: str | None = None
        avatar_bytes_for_compare: bytes | None = None
        garment_overlay_url: str | None = None

        if task == "vton_tryon":
            avatar_url = inputs.get("avatarImageUrl")
            garment_url = inputs.get("garmentImageUrl")
            garment_category = inputs.get("garmentCategory")
            if not avatar_url or not garment_url:
                raise RuntimeError("缺少 avatarImageUrl 或 garmentImageUrl")
            avatar_bytes, avatar_mime = await self._read_uploaded_image(str(avatar_url), timeout=min(20, float(timeout)))
            garment_bytes, garment_mime = await self._read_uploaded_image(str(garment_url), timeout=min(20, float(timeout)))
            avatar_url_for_fallback = str(avatar_url)
            avatar_bytes_for_compare = avatar_bytes
            garment_overlay_url = str(garment_url)
            original_image_urls = [str(avatar_url), str(garment_url)]
            meta["overlayTransform"] = self._default_overlay_transform(str(garment_category) if garment_category is not None else None)
            meta["notes"] = "品类规则定位"
            meta["garmentImageUrl"] = str(garment_url)
            parts.append({"text": "【图片 A：目标人物。必须保持这个人的身份、姿态、背景和画幅】"})
            parts.append({"inlineData": {"mimeType": avatar_mime, "data": base64.b64encode(avatar_bytes).decode("utf-8")}})
            parts.append({"text": "【图片 B：衣橱中的干净服装单品图。必须把这件服装穿到图片 A 的人物身上，替换对应部位的原有服装】"})
            parts.append({"inlineData": {"mimeType": garment_mime, "data": base64.b64encode(garment_bytes).decode("utf-8")}})
        else:
            image_url = inputs.get("imageUrl") or inputs.get("avatarImageUrl") or inputs.get("garmentImageUrl")
            if not image_url:
                raise RuntimeError("缺少输入图片")
            img_bytes, mime = await self._read_uploaded_image(str(image_url), timeout=min(20, float(timeout)))
            original_image_urls = [str(image_url)]
            parts.append({"text": "【输入图片：待编辑人物图】"})
            parts.append({"inlineData": {"mimeType": mime, "data": base64.b64encode(img_bytes).decode("utf-8")}})

        async def fallback_if_unchanged(candidate_bytes: bytes, candidate_url: str) -> dict[str, Any] | None:
            if task != "vton_tryon" or not avatar_bytes_for_compare or not avatar_url_for_fallback or not garment_overlay_url:
                return None
            score = self._torso_difference_score(avatar_bytes_for_compare, candidate_bytes)
            if score is None:
                return None
            meta["torsoDifferenceScore"] = round(score, 5)
            if score >= 0.045:
                return None
            try:
                retry_prompt = "\n".join([
                    "上一步虚拟试穿结果与图片 A 几乎没有变化，判定为失败。请重新生成，不要保留原样图。",
                    "",
                    "你会看到两张图片：",
                    "- 图片 A：目标人物，请保持身份、姿态、背景和画幅。",
                    "- 图片 B：衣橱中的干净服装单品图。",
                    "",
                    "强制任务：把图片 B 的目标服装穿到图片 A 人物身上，替换对应部位原有服装。",
                    "如果目标服装是外套/风衣/大衣/夹克，请作为外层服装自然覆盖躯干和手臂。",
                    "不得输出与图片 A 基本相同的原图；必须明显看到目标服装。",
                    "",
                    "Return exactly one edited photorealistic image.",
                ])
                retry_garment_bytes, retry_garment_mime = await self._read_uploaded_image(garment_overlay_url, timeout=15)
                retry_parts = [
                    {"text": retry_prompt},
                    {"text": "【图片 A：目标人物】"},
                    {"inlineData": {"mimeType": avatar_mime, "data": base64.b64encode(avatar_bytes_for_compare).decode("utf-8")}},
                    {"text": "【图片 B：衣橱中的干净服装单品图】"},
                    {"inlineData": {"mimeType": retry_garment_mime, "data": base64.b64encode(retry_garment_bytes).decode("utf-8")}},
                ]
                retry_bytes, retry_mime, retry_model, retry_round = await self._generate_with_fallback(
                    parts=retry_parts,
                    timeout=max(30.0, float(timeout) * 0.6),
                    round_index=3,
                    kind="unchanged_retry",
                    prompt=retry_prompt,
                    input_image_urls=original_image_urls,
                    log_id=log_id,
                )
                retry_url = self._save_generated_image(retry_bytes, retry_mime)
                retry_round["outputImageUrl"] = retry_url
                retry_round["model"] = retry_model
                await generation_log_store.append_round(log_id, retry_round)
                retry_score = self._torso_difference_score(avatar_bytes_for_compare, retry_bytes)
                meta["unchangedRetry"] = True
                meta["unchangedRetryModel"] = retry_model
                meta["unchangedRetryImageUrl"] = retry_url
                if retry_score is not None:
                    meta["unchangedRetryTorsoDifferenceScore"] = round(retry_score, 5)
                if retry_score is not None and retry_score >= 0.045:
                    meta["mode"] = "remote"
                    meta["reason"] = "unchanged_retry_succeeded"
                    await generation_log_store.finish(log_id, status="succeeded", final_image_url=retry_url, meta=meta)
                    return {"imageUrl": retry_url, "meta": meta}
            except Exception as e:
                meta["unchangedRetryError"] = str(e)
            overlay_transform = {
                **self._default_overlay_transform(str(inputs.get("garmentCategory")) if inputs.get("garmentCategory") is not None else None),
                "opacity": 0.92,
                "blendMode": "normal",
            }
            final_url = avatar_url_for_fallback
            try:
                overlay_bytes, _ = await self._read_uploaded_image(garment_overlay_url, timeout=15)
                composite = self._compose_overlay_png(
                    base_bytes=avatar_bytes_for_compare,
                    overlay_bytes=overlay_bytes,
                    transform=overlay_transform,
                )
                if composite:
                    final_url = self._save_generated_image(composite, "image/png")
            except Exception as e:
                meta["fallbackCompositeError"] = str(e)
            meta["mode"] = "fallback_overlay"
            meta["reason"] = "remote_output_unchanged"
            meta["remoteImageUrl"] = candidate_url
            meta["overlayGarmentImageUrl"] = garment_overlay_url
            meta["overlayTransform"] = overlay_transform
            meta["selfCorrection"] = False
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=final_url, meta=meta)
            return {"imageUrl": final_url, "meta": meta}

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
            fallback = await fallback_if_unchanged(corr_bytes, final_url)
            if fallback is not None:
                return fallback
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=final_url, meta=meta)
            return {"imageUrl": final_url, "meta": meta}
        else:
            meta["selfCorrection"] = False
            fallback = await fallback_if_unchanged(r1_bytes, r1_url)
            if fallback is not None:
                return fallback
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

    async def garment_extract(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        image_url = inputs.get("imageUrl") or inputs.get("garmentImageUrl")
        garment_category = inputs.get("garmentCategory")
        log_id = await generation_log_store.start(
            job_id=job_id,
            task="garment_extract",
            inputs=inputs,
            constraints=constraints,
        )
        meta: dict[str, Any] = {
            "provider": "nanobanana",
            "mode": "remote",
            "generationLogId": log_id,
            "garmentCategory": garment_category,
        }
        if not image_url:
            await generation_log_store.finish(log_id, status="failed", error="缺少 imageUrl", meta=meta)
            raise RuntimeError("缺少 imageUrl")
        if not runtime_config.get_api_key():
            meta["mode"] = "mock"
            meta["reason"] = "missing_api_key"
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=str(image_url), meta=meta)
            return {"imageUrl": str(image_url), "meta": meta}

        timeout = constraints.get("timeoutSec", 180) if constraints else 180
        try:
            garment_bytes, garment_mime = await self._read_uploaded_image(str(image_url), timeout=min(20, float(timeout)))
            clean_bytes, clean_mime, clean_url = await self._extract_garment_reference(
                garment_url=str(image_url),
                garment_bytes=garment_bytes,
                garment_mime=garment_mime,
                garment_category=str(garment_category) if garment_category is not None else None,
                timeout=float(timeout),
                log_id=log_id,
            )
            meta["originalGarmentImageUrl"] = str(image_url)
            meta["model"] = "gemini-2.5-flash-image"
            await generation_log_store.finish(log_id, status="succeeded", final_image_url=clean_url, meta=meta)
            return {"imageUrl": clean_url, "meta": meta}
        except Exception as e:
            await generation_log_store.finish(log_id, status="failed", error=str(e), meta=meta)
            raise

    async def vton_tryon(
        self, *, inputs: dict[str, Any], constraints: dict[str, Any] | None, job_id: str | None = None
    ) -> dict[str, Any]:
        return await self._call(task="vton_tryon", inputs=inputs, constraints=constraints, job_id=job_id)
