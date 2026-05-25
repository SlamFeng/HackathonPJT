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
            "4) 人物必须从头部到鞋子完整可见（头顶与鞋子都不能被裁切），居中展示，全身完整；",
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
            f"2) 根据以下姿态提示把人物切换到目标姿态（如果图片 A 的姿态与目标不同，请自由调整身体、四肢到目标姿态）：",
            f"   - 当前姿态提示：{pose_id}",
            "   - 身体朝向可参考图片 A，但最终动作必须符合姿态提示；",
            "3) 必须把图片 B 的服装穿到图片 A 的人物身上：",
            "   - 保持服装款式、颜色、图案、材质纹理；",
            "   - 尺寸合身自然，褶皱与光影合理，服装随姿态变化自然变形；",
            f"   - 服装品类提示：{garment_category}（决定穿戴区域，例如 dress 覆盖上身到腿部、shoes 仅覆盖脚部）",
            "4) 背景保持干净（浅色影棚背景优先），不要加入文字、水印、边框或其他人物；",
            "5) 人物必须从头到鞋子完整可见，不能裁切或变形，居中展示，全身完整；",
            "",
            f"质量等级参考：{quality_level}（尽可能高质量输出，但不要牺牲身份一致性）。",
            "",
            "输出格式要求：",
            "- 必须返回一张图片（不要只返回文字说明）。",
        ]
    )


def pose_render_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    pose_id = inputs.get("poseId") or "未指定"
    return "\n".join(
        [
            "你是一名专业的写实人物图像编辑助手。",
            "",
            f"任务：基于我提供的人物照片，把人物切换到以下姿态：",
            f"   - 目标姿态：{pose_id}",
            "",
            "要求：",
            f"1) 根据姿态提示（{pose_id}）调整人物身体、四肢到对应的动作：",
            "   - hands_on_hips：双手叉腰",
            "   - neutral_stand：双手自然垂立，站直",
            "   - hands_behind_back：双手背在身后",
            "   - runway_walk：像走 T 台一样迈步行走",
            "   - casual_sit：自然坐在椅子上",
            "   - side_stand：侧身站立",
            "2) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与原图一致；",
            "3) 输出写实风格，细节清晰，不要变形；",
            "4) 背景保持与原图一致，不要自行修改背景或添加额外元素；",
            "5) 人物必须从头到鞋子完整可见（头顶与鞋子都不能被裁切），全身完整居中展示；",
            "6) 服装款式、颜色、材质保持与原图一致，随姿态自然变形；",
            "7) 不要添加文字、水印、边框或额外人物；",
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
    "pose_render": pose_render_prompt,
    "vton_tryon": vton_tryon_prompt,
}


def build_prompt(*, task: str, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    builder = PROMPT_BUILDERS.get(task)
    if builder is None:
        raise KeyError(f"Prompt not found for task: {task}")
    return builder(inputs=inputs, constraints=constraints)


def self_correction_prompt(*, task: str) -> str:
    """
    Round 2 自修正 prompt。
    用于把 Round 1 生成的结果图 + 原始输入图再次发送给 Gemini，
    让模型自行检查并修复以下典型问题：
      - 动作不对 / 没切换姿态
      - 服装缺失 / 贴合错误
      - 人体裁切 / 畸形（如三条腿）
      - 身份不一致
      - 只返回了文字说明
    注意：这个 prompt 要求返回图片，不要返回文字。
    """
    task_prompts = {
        "avatar_generate": [
            "请仔细检查上一步生成的数字人基础形象图片，逐一核对以下项目：",
            "",
            "- 完整性检查：人物是否从头到脚、从头部到鞋子全部可见，没有被裁切？",
            "  → 如有裁切，请在修复图中补全；",
            "- 身份一致性检查：脸部五官、发型发色、肤色是否与原始照片一致？",
            "  → 如不一致，请以原始照片为准修正；",
            "- 背景检查：背景是否为干净的浅色影棚风格？",
            "  → 如有复杂背景或杂物，请替换为纯色背景；",
            "- 畸形检查：人体比例是否自然，没有多余肢体、变形或错位？",
            "  → 如有畸形（如三条腿、手臂错位），请修复为正常人体；",
            "- 文字检查：图中是否有文字、水印或边框？",
            "  → 如有，请彻底移除。",
            "",
            "输出格式要求：",
            "- 如果上一步结果已完美满足所有条件，请保持原结果返回。",
            "- 如果存在问题，请生成一张修复后的图片。",
            "- 必须返回图片，不要只返回文字说明。",
        ],
        "pose_render": [
            "请仔细检查上一步生成的姿态切换图片，逐一核对以下项目：",
            "",
            "- 姿态检查：人物动作是否已切换到目标姿态？",
            "  → 如果人物仍保持原姿态未改变，请按目标姿态调整四肢和身体；",
            "- 完整性检查：人物是否从头到脚完整可见，没有被裁切？",
            "  → 如有裁切请补全；",
            "- 身份一致性检查：脸部五官、发型、肤色是否与原始照片一致？",
            "  → 如不一致请以原始照片为准修正；",
            "- 畸形检查：人体比例是否自然，没有多余肢体或错位？",
            "  → 如有畸形（如三条腿、多只手臂等），请修复为正常人体；",
            "- 服装检查：服装款式、颜色是否与原图一致，随姿态自然变形？",
            "",
            "输出格式要求：",
            "- 如果上一步结果已完美满足所有条件，请保持原结果返回。",
            "- 如果存在问题，请生成一张修复后的图片。",
            "- 必须返回图片，不要只返回文字说明。",
        ],
        "vton_tryon": [
            "请仔细检查上一步生成的虚拟试穿图片，逐一核对以下项目：",
            "",
            "- 服装检查：目标服装是否已穿到人物身上？",
            "  → 如果服装缺失或未穿上，请将目标服装正确穿到人物身上；",
            "- 服装贴合检查：服装是否合身、褶皱与光影是否自然？",
            "  → 如有明显不贴合（过大/过小/悬空），请修正；",
            "- 身份一致性检查：脸部五官、发型、肤色是否与原始人物一致？",
            "  → 如不一致请以人物原始照片为准修正；",
            "- 姿态检查：人物动作是否符合姿态提示？",
            "  → 如有偏差请修正为正确姿态；",
            "- 完整性检查：人物是否从头到脚完整可见，没有裁切或多余肢体？",
            "  → 如有畸形或裁切请修复；",
            "- 背景检查：背景是否为干净的浅色风格，没有多余元素？",
            "",
            "输出格式要求：",
            "- 如果上一步结果已完美满足所有条件，请保持原结果返回。",
            "- 如果存在问题，请生成一张修复后的图片。",
            "- 必须返回图片，不要只返回文字说明。",
        ],
    }
    lines = task_prompts.get(task, task_prompts["avatar_generate"])
    return "\n".join(lines)
