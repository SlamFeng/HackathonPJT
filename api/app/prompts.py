from __future__ import annotations

from typing import Any, Callable


def _format_body_params(body_params: dict[str, Any] | None) -> str:
    """
    将前端 BodyFormState（经后端校验后的 bodyParams）格式化注入到 prompt 中。
    这里要“全量字段”输出，便于后续 prompt 迭代与线上排查。
    """
    body_params = body_params or {}

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
            "4) 人物全身可见（从头到脚），居中，站姿自然；",
            "5) 服装尽量简洁贴身（例如纯色上衣+简单长裤），便于后续试穿叠加；",
            "6) 不要添加文字、水印、边框或额外人物；",
            "",
            "体型参数（用于轻微修正比例，不要夸张变形；未填写项不要臆造具体数值）：",
            body_block,
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
    # 预留：后续可在此统一管理 pose_render / vton_tryon 等 prompt
    # "pose_render": ...,
    # "vton_tryon": ...,
}


def build_prompt(*, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    builder = PROMPT_BUILDERS.get(task)
    if builder is None:
        raise KeyError(f"Prompt not found for task: {task}")
    return builder(inputs=inputs, constraints=constraints)

