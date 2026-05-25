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
    body_params, missing = _estimate_body_params(body_params)

    def val(key: str) -> str:
        v = body_params.get(key)
        return '未填写' if v is None else str(v)

    lines = [
        f'- 身高(cm): {val("heightCm")}',
        f'- 体重(kg): {val("weightKg")}',
        f'- 肩宽(cm): {val("shoulderWidthCm")}',
        f'- 胸围(cm): {val("chestCm")}',
        f'- 腰围(cm): {val("waistCm")}',
        f'- 臀围(cm): {val("hipCm")}',
    ]
    if missing:
        lines.append(f'- 说明: 未填写项已按平均体型估算(以照片为准): {", ".join(missing)}')
    return "\n".join(lines)


def avatar_generate_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    body_block = _format_body_params(inputs.get("bodyParams"))
    return "\n".join([
        '你是一名专业的写实人物图像生成与修图助手。',
        '',
        '任务：基于我提供的照片生成一张数字人基础形象(avatar base)图片，用于后续虚拟试穿。',
        '',
        '硬性要求：',
        '1) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与原图一致；',
        '2) 输出写实风格，细节清晰，曝光正常；',
        '3) 背景替换为干净的浅色影棚背景(接近纯色)，不要杂物；',
        '4) 人物必须从头部到鞋子完整可见(头顶与鞋子都不能被裁切)，居中展示，全身完整；',
        '5) 服装尽量简洁贴身(例如纯色上衣+简单长裤)，便于后续试穿叠加；',
        '6) 不要添加文字、水印、边框或额外人物；',
        '',
        f'体型参数(用于轻微修正比例，不要夸张变形；如未填写请结合照片做合理估计，可参考估算值但以照片为准)：',
        body_block,
        '',
        f'质量等级参考：{quality_level}(尽可能高质量输出，但不要牺牲身份一致性)。',
        '',
        '输出格式要求：',
        '- 必须返回一张图片(不要只返回文字说明)。',
    ])


def vton_tryon_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    garment_category = inputs.get("garmentCategory") or '未指定'
    pose_id = inputs.get("poseId") or '未指定'
    pose_desc = POSE_DESCRIPTIONS.get(str(pose_id))
    pose_context = f'图片 A 当前姿态：{pose_id} - {pose_desc}' if pose_desc else ''
    return "\n".join([
        '你是一名专业的写实人物图像生成与虚拟试衣助手。',
        '',
        '任务：基于两张图片生成一张虚拟试穿(try-on)图片：',
        '- 图片 A：人物(avatar, 已处在正确姿态)',
        '- 图片 B：服装单品(garment)',
        '',
        '核心规则(必须严格遵守)：',
        '1) 只有两处可以修改：(a) 把图片 B 的服装穿到人物身上, (b) 服装遮挡处的原服装被覆盖。',
        '2) 绝对禁止修改以下内容：人物姿态、身体朝向、手势、头部角度、背景、光照、画幅构图、人物脸部特征。',
        pose_context,
        '',
        '试穿要求：',
        f'   - 服装品类：{garment_category}(决定穿戴区域)',
        '   - 保持服装款式、颜色、图案、材质纹理不变；',
        '   - 尺寸合身自然，褶皱与光影合理，服装与人物身体自然贴合；',
        '',
        '其他约束：',
        '4) 背景保持干净(浅色影棚背景优先)，不要加入文字、水印、边框或其他人物；',
        '5) 人物必须从头到鞋子完整可见，不能裁切或变形，居中展示，全身完整；',
        '',
        f'质量等级参考：{quality_level}(尽可能高质量输出，但不要牺牲身份一致性)。',
        '',
        '输出格式要求：',
        '- 必须返回一张图片(不要只返回文字说明)。',
    ])


POSE_DESCRIPTIONS: dict[str, str] = {
    'hands_on_hips': '双手叉腰，手肘微曲向外，站直，肩膀放松',
    'neutral_stand': '双手自然垂立于身体两侧，站直，目视前方',
    'hands_behind_back': '双手背在身后，手腕交叠或平行，挺胸站直',
    'runway_walk': '模特走秀迈步：一只脚向前迈出、膝盖微曲，另一只脚在后伸直支撑；双手自然前后摆动或垂于身侧；肩部下沉，下巴微抬，目视前方，重心略前倾，有动态跨步感',
    'casual_sit': '自然坐在椅子上，身体放松，双手自然放在大腿或扶手上',
    'side_stand': '侧身站立，身体转向一侧约45-90度，头部可微转向镜头，双手自然垂于身侧',
}


def pose_render_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    pose_id = inputs.get("poseId") or '未指定'
    pose_desc = POSE_DESCRIPTIONS.get(pose_id, '请调整到目标姿态')
    return "\n".join([
        '你是一名专业的写实人物图像编辑助手。',
        '',
        f'任务：基于我提供的人物照片，把人物切换到以下姿态：',
        f'   - 目标姿态：{pose_id}',
        '',
        '要求：',
        f'1) 根据以下描述调整人物身体、四肢到目标姿态：',
        f'   {pose_id}：{pose_desc}',

        '2) 必须保持人物身份一致：脸部五官、发型发色、肤色尽可能与原图一致；',
        '3) 输出写实风格，细节清晰，不要变形；',
        '4) 背景保持与原图一致，不要自行修改背景或添加额外元素；',
        '5) 人物必须从头到鞋子完整可见(头顶与鞋子都不能被裁切)，全身完整居中展示；',
        '6) 服装款式、颜色、材质保持与原图一致，随姿态自然变形；',
        '7) 不要添加文字、水印、边框或额外人物；',
        '',
        f'质量等级参考：{quality_level}(尽可能高质量输出，但不要牺牲身份一致性)。',
        '',
        '输出格式要求：',
        '- 必须返回一张图片(不要只返回文字说明)。',
    ])


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
    task_prompts = {
        "avatar_generate": [
            '请仔细检查上一步生成的数字人基础形象图片，逐一核对以下项目：',
            '',
            '- 完整性检查：人物是否从头到脚、从头部到鞋子全部可见，没有被裁切？',
            '  -> 如有裁切，请在修复图中补全；',
            '- 身份一致性检查：脸部五官、发型发色、肤色是否与原始照片一致？',
            '  -> 如不一致，请以原始照片为准修正；',
            '- 背景检查：背景是否为干净的浅色影棚风格？',
            '  -> 如有复杂背景或杂物，请替换为纯色背景；',
            '- 畸形检查：人体比例是否自然，没有多余肢体、变形或错位？',
            '  -> 如有畸形(如三条腿、手臂错位)，请修复为正常人体；',
            '- 文字检查：图中是否有文字、水印或边框？',
            '  -> 如有，请彻底移除。',
            '',
            '输出格式要求：',
            '- 如果上一步结果已完美满足所有条件，请保持原结果返回。',
            '- 如果存在问题，请生成一张修复后的图片。',
            '- 必须返回图片，不要只返回文字说明。',
        ],
        "pose_render": [
            '请仔细检查上一步生成的姿态切换图片，逐一核对以下项目：',
            '',
            '- 姿态检查：人物动作是否已切换到目标姿态？',
            '  -> 如果人物仍保持原姿态未改变，请按目标姿态调整四肢和身体；',
            '  -> 如果是 runway_walk(T台)：确保一只脚向前跨出、有动态感，非简单站立；',
            '- 完整性检查：人物是否从头到脚完整可见，没有被裁切？',
            '  -> 如有裁切请补全；',
            '- 身份一致性检查：脸部五官、发型、肤色是否与原始照片一致？',
            '  -> 如不一致请以原始照片为准修正；',
            '- 畸形检查：人体比例是否自然，没有多余肢体或错位？',
            '  -> 如有畸形(如三条腿、多只手臂等)，请修复为正常人体；',
            '- 服装检查：服装款式、颜色是否与原图一致，随姿态自然变形？',
            '',
            '输出格式要求：',
            '- 如果上一步结果已完美满足所有条件，请保持原结果返回。',
            '- 如果存在问题，请生成一张修复后的图片。',
            '- 必须返回图片，不要只返回文字说明。',
        ],
        "vton_tryon": [
            '请仔细检查上一步生成的虚拟试穿图片，逐一核对以下项目：',
            '',
            '- 服装检查：目标服装是否已正确穿在人物身上(覆盖了原服装)？',
            '  -> 如果服装缺失或人物仍穿着原服装，请把目标服装正确穿上；',
            '- 姿势检查：人物姿态、身体朝向、手势、头部角度是否与图片 A 完全一致？',
            '  -> 如果有任何变化(包括手脚位置、头部角度、身体朝向)，请还原为与图片 A 一模一样；',
            '- 背景检查：背景、光照是否与图片 A 一致？没有多余元素？',
            '  -> 如果背景变了，请还原为与图片 A 完全相同；',
            '- 身份一致性检查：脸部五官、发型、肤色是否与原始人物一致？',
            '  -> 如不一致请以人物原始照片为准修正；',
            '- 完整性检查：人物是否从头到脚完整可见，没有裁切或多余肢体？',
            '  -> 如有畸形或裁切请修复；',
            '',
            '输出格式要求：',
            '- 如果上一步结果已完美满足所有条件，请保持原结果返回。',
            '- 如果存在问题，请生成一张修复后的图片。注意：只修改有问题的部分，不要改变正确的内容。',
            '- 必须返回图片，不要只返回文字说明。',
        ],
    }
    lines = task_prompts.get(task, task_prompts["avatar_generate"])
    return "\n".join(lines)
