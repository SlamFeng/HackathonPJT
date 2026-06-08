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
    pose_context = f'人物当前姿态：{pose_id} - {pose_desc}' if pose_desc else ''
    # 从 inputs 获取输入图片的实际像素（如果可用），用来在 prompt 中精确指定输出尺寸
    avatar_w = inputs.get("_avatarWidth")
    avatar_h = inputs.get("_avatarHeight")
    dim_hint = f'输出图片必须精确保持 {avatar_w}x{avatar_h} 像素' if (avatar_w and avatar_h) else '输出图片必须与图片 A 的尺寸（宽度和高度像素数）完全相同'
    return "\n".join([
        '你是一个专业的虚拟试穿图片编辑工具。',
        '',
        '输入图片：',
        '- 图片 A：目标人物全身照，必须作为最终人物、姿态、背景和画幅的基准。',
        '- 图片 B：衣橱中的干净服装单品图，必须作为最终穿着服装的基准。',
        '',
        '直接编辑图片 A：把图片 A 人物身上的原上衣替换为图片 B 的目标服装。',
        '如果图片 B 是风衣/大衣/外套/夹克/长款上衣，即使前端品类是 top，也必须按外层服装处理。',
        '',
        '最终图必须满足：',
        f'1) 人物穿着图片 B 的目标服装（前端品类参考：{garment_category}，但以图片 B 的服装为准）。',
        '2) 图片 A 对应部位的原有服装不能继续作为最终可见的主体服装；目标服装必须覆盖或替换对应穿着区域。',
        '3) 对于风衣/大衣/外套：必须显示长款外套轮廓、翻领、门襟、纽扣、腰带、袖口和真实下摆长度。',
        '4) 保持图片 A 的人物身份、脸、发型、肤色、表情、身体姿态、手脚位置、裤子、鞋子、背景和光照。',
        f'5) {pose_context}',
        f'6) {dim_hint}；人物从头到脚完整可见。',
        f'7) 质量等级参考：{quality_level}。',
        '',
        '失败条件：如果输出看起来仍是图片 A 原有服装，或者只是轻微改变颜色/纹理，而没有穿上图片 B 的目标服装，则必须重做。',
        '',
        'Return exactly one edited photorealistic image. Replace the original visible garment in the target area with the target garment from image B. Do not return the unchanged person image.',
    ])


POSE_DESCRIPTIONS: dict[str, str] = {
    'hands_on_hips': '双手叉腰，手肘微曲向外，站直，肩膀放松',
    'neutral_stand': '双手自然垂立于身体两侧，站直，目视前方',
    'hands_behind_back': '双手背在身后，手腕交叠或平行，挺胸站直',
    'runway_walk': '模特走秀迈步：一只脚向前跨出(脚尖朝前)、膝盖轻微弯曲，另一只脚在后伸直支撑；双臂自然摆动或垂于身侧；肩部下沉，下巴微抬，目视前方，重心略前倾，有明显“走秀跨步”的动态感（非站立、非侧身走路）',
    'casual_sit': '坐姿：人物必须真实坐在椅子/凳子上（椅面/坐垫需要可见）；臀部落座，双腿自然弯曲（膝盖约90度），双脚踩地；上身放松直立或微前倾；双手自然放在大腿上或扶手上（严禁迈步/走路/站立）',
    'side_stand': '侧身站立：人物身体转向一侧约60-90度（可微转头看向镜头）；双脚稳定站立（不要迈步、不要走路姿态）；双手自然垂于身侧或轻放体侧',
}


def _pose_hard_rules(pose_id: str) -> list[str]:
    """对容易跑偏的姿态，补充更强的“硬约束”句子，减少模型把动作做成走路/侧走。"""
    pose_id = str(pose_id or "").strip()
    if pose_id == "casual_sit":
        return [
            "必须是坐姿：人物必须坐在椅子/凳子上（椅子可见），臀部落座，双腿弯曲，双脚踩地。",
            "严禁生成走路/迈步/站立/半蹲等非坐姿动作。",
        ]
    if pose_id == "side_stand":
        return [
            "必须是原地侧身站立（稳定站姿），严禁迈步/走路/跨步。",
        ]
    if pose_id == "runway_walk":
        return [
            "必须有明显跨步：一只脚向前跨出，另一只脚在后支撑；不是站立，也不是原地摆拍。",
        ]
    # 其他站姿类：默认禁走路，避免误跑偏为 runway_walk
    if pose_id in {"hands_on_hips", "neutral_stand", "hands_behind_back"}:
        return [
            "必须是原地站立姿势，严禁迈步/走路/跨步。",
        ]
    return []


def pose_render_prompt(*, inputs: dict[str, Any], constraints: dict[str, Any] | None) -> str:
    quality_level = (constraints or {}).get("qualityLevel") or "standard"
    pose_id = inputs.get("poseId") or '未指定'
    pose_desc = POSE_DESCRIPTIONS.get(pose_id, '请调整到目标姿态')
    pose_rules = _pose_hard_rules(str(pose_id))
    return "\n".join([
        '你是一名专业的写实人物图像编辑助手。',
        '',
        f'任务：基于我提供的人物照片，把人物切换到以下姿态：',
        f'   - 目标姿态：{pose_id}',
        '',
        '要求：',
        f'1) 根据以下描述调整人物身体、四肢到目标姿态：',
        f'   {pose_id}：{pose_desc}',
        *(["", "姿态硬性约束(必须遵守)："] + [f"- {r}" for r in pose_rules] if pose_rules else []),

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


def self_correction_prompt(*, task: str, inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    pose_id = inputs.get('poseId') or ''
    pose_desc = POSE_DESCRIPTIONS.get(str(pose_id)) if pose_id else ''
    pose_rules = _pose_hard_rules(str(pose_id)) if pose_id else []
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
            f'请仔细检查上一步生成的姿态切换图片，逐一核对以下项目：目标姿态是 {pose_id}: {pose_desc}',
            '',
            '- 姿态检查：人物动作是否已切换到目标姿态？',
            '  -> 如果人物仍保持原姿态未改变，请按目标姿态调整四肢和身体；',
            *(["  -> " + r for r in pose_rules] if pose_rules else []),
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
            f'请仔细检查上一步生成的虚拟试穿图片。人物图片 A 的当前姿态为 {pose_id}: {pose_desc}，必须严格保持该姿态不变。逐一核对以下项目：',
            '',
            '- 服装检查：目标服装是否已正确穿在人物身上(覆盖了原服装)？',
            '  -> 如果服装缺失或人物仍穿着原服装，请把目标服装正确穿上；',
            '  -> 图片 B 是衣橱中已经清理好的服装单品图，请直接以它作为目标服装参考；',
            '  -> 如果目标服装是外套/风衣/大衣/夹克，请作为外层服装穿上，必须明显覆盖躯干和手臂外侧；',
            '  -> 如果对应穿着区域仍是图片 A 原来的服装主体，请判定为失败并强制重做：移除/遮盖原服装主体，让目标服装成为最终可见服装；',
            '- 姿势检查：人物姿态、身体朝向、手势、头部角度是否与图片 A 完全一致？',
            '  -> 如果有任何变化(包括手脚位置、头部角度、身体朝向)，请还原为与图片 A 一模一样；',
            '- 画幅检查：输出图片的尺寸（宽高比）是否与图片 A 完全相同？',
            '  -> 如果宽高比改变了，请裁切/填充回与图片 A 完全相同的尺寸；',
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
