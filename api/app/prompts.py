from __future__ import annotations

from typing import Any, Callable


def _as_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        n = int(v)
        return n
    except Exception:
        return None


def _estimate_body_params(body_params: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    body_params = body_params or {}
    missing: list[str] = []

    height = _as_int(body_params.get("heightCm")) or 170
    weight = _as_int(body_params.get("weightKg")) or 65

    scale = max(0.85, min(1.25, height / 170))
    dw = weight - 65

    defaults: dict[str, int] = {
        "heightCm": height,
        "weightKg": weight,
        "shoulderWidthCm": int(round(42 * scale + dw * 0.05)),
        "chestCm": int(round(92 * scale + dw * 0.30)),
        "waistCm": int(round(78 * scale + dw * 0.25)),
        "hipCm": int(round(96 * scale + dw * 0.30)),
    }

    out: dict[str, Any] = dict(body_params)
    for k, dv in defaults.items():
        if _as_int(body_params.get(k)) is None:
            out[k] = dv
            missing.append(k)
    return out, missing


def _format_body_params(body_params: dict[str, Any] | None) -> str:
    """
    将前端 BodyFormState（经后端校验后的 bodyParams）格式化注入到 prompt 中。
    这里要“全量字段”输出，便于后续 prompt 迭代与线上排查。
    """
    body_params, missing = _estimate_body_params(body_params)

    def val(key: str) -> str:
        v = body_params.get(key)
        return "未填写" if v is None else str(v)

    lines = [
        f"- 身高(cm): {val('heightCm')}",
        f"- 体重(kg): {val('weightKg')}",
        f"- 肩宽(cm): {val('shoulderWidthCm')}",
        f"- 胸围(cm): {val('chestCm')}",
        f"- 腰围(cm): {val('waistCm')}",
        f"- 臀围(cm): {val('hipCm')}",
    ]
    if missing:
        lines.append(f"- 说明: 未填写项已按平均体型估算（以照片为准）: {', '.join(missing)}")
    return "\n".join(lines)


def avatar_generate_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    """
    数字人基础形象生成（text+image -> image）。
    注意：
    - 目标是生成“可试穿”的基础人像（背景干净、衣着简洁、全身可见）
    - 体型参数用于轻微比例修正，不应强制改形
    """
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    body_block = _format_body_params(inputs.get("bodyParams"))
    return "\n".join(
        [
            "你是一名专业的写实人物图像生成与修图助手。",
            "",
            "任务：基于我提供的照片生成一张“数字人基础形象（avatar base）”图片，用于后续虚拟试穿。",
            "",
            "硬性要求：",
            "1) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与原图一致；",
            "2) 输出写实风格，细节清晰，曝光正常；",
            "3) 背景替换为干净的浅色影棚背景（接近纯色），不要杂物；",
            "4) 人物必须从头部到鞋子完整可见（头顶与鞋子都不能被裁切），居中，站姿自然；",
            "   - 构图需留出足够边距，确保鞋子/脚部完整清晰可见；",
            "5) 服装尽量简洁贴身（例如纯色上衣+简单长裤），便于后续试穿叠加；",
            "6) 不要添加文字、水印、边框或额外人物；",
            "",
            "体型参数（用于轻微修正比例，不要夸张变形；如未填写请结合照片做合理估计，可参考估算值但以照片为准）：",
            body_block,
            "",
            f"质量等级参考：{quality_level}（尽可能高质量输出，但不要牺牲身份一致性）。",
            "",
            "输出格式要求：",
            "- 必须返回一张图片（不要只返回文字说明）。",
        ]
    )


def vton_tryon_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    pose_id = inputs.get("poseId") or "未指定"
    garment_category = inputs.get("garmentCategory") or "未指定"
    return "\n".join(
        [
            "你是一名专业的写实人物图像生成与虚拟试衣助手。",
            "",
            "任务：基于两张图片生成一张“虚拟试穿（try-on）”图片：",
            "- 图片 A：人物（avatar）",
            "- 图片 B：服装单品（garment）",
            "",
            "硬性要求：",
            "1) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与图片 A 一致；",
            "2) 必须保持人物姿态与身体朝向：尽可能与图片 A 一致；",
            f"   - 当前姿态提示：{pose_id}",
            "3) 必须把图片 B 的服装穿到图片 A 的人物身上：",
            "   - 保持服装款式、颜色、图案、材质纹理；",
            "   - 尺寸合身自然，褶皱与光影合理；",
            f"   - 服装品类提示：{garment_category}（决定穿戴区域，例如 dress 覆盖上身到腿部、shoes 仅覆盖脚部）",
            "4) 背景保持干净（浅色影棚背景优先），不要加入文字、水印、边框或其他人物；",
            "5) 人物需尽量全身可见（头到鞋子完整），居中站姿自然；",
            "",
            f"质量等级参考：{quality_level}（尽可能高质量输出，但不要牺牲身份一致性）。",
            "",
            "输出格式要求：",
            "- 必须返回一张图片（不要只返回文字说明）。",
        ]
    )


PromptBuilder = Callable[[dict[str, Any], dict[str, Any] | None], str]


PROMPT_BUILDERS: dict[str, Callable[..., str]] = {
    "avatar_generate": avatar_generate_prompt,
    "vton_tryon": vton_tryon_prompt,
    # 预留：后续可在此统一管理 pose_render / vton_tryon 等 prompt
    # "pose_render": ...,
}


def build_prompt(*, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    builder = PROMPT_BUILDERS.get(task)
    if builder is None:
        raise KeyError(f"Prompt not found for task: {task}")
    return builder(inputs=inputs, constraints=constraints)
