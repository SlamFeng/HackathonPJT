from __future__ import annotations

from .settings import settings

# 运行时可被管理员动态覆盖的配置（进程内内存态，改完即时对新任务生效）。
# 解析优先级：管理员在设置页改的值（DB 持久化 -> 启动时载入这里） > .env/环境变量默认值。
# 这样团队无需每次改 .env + 重启，也保留 .env 作为初始默认。
_api_key_override: str | None = None
_model_override: str | None = None

# 垂立调试链路（demo lane）：开关打开后，仅 poseId=neutral_stand 的试穿走一条
# 与生产完全隔离的单遍链路，可独立调它的提示词与模型，方便给客户 demo 冲质量上限。
_demo_lane_enabled: bool = False
_demo_lane_model: str | None = None   # 该链路单独使用的模型；空=用当前默认模型
_demo_lane_prompt: str | None = None  # 该链路单独使用的提示词；空=用代码内置 demo 提示词

DEFAULT_MODEL = "gemini-3.1-flash-image-preview"

# 设置页下拉的预设模型（管理员也可自填其它模型名做对比）
AVAILABLE_MODELS = [
    "gemini-3.1-flash-image-preview",
    "gemini-3.1-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-3-pro-image",
    "gemini-2.5-flash-image",
]


def get_api_key() -> str | None:
    return _api_key_override or settings.nanobanana_api_key


def get_model() -> str:
    return _model_override or settings.nanobanana_model or DEFAULT_MODEL


def has_api_key() -> bool:
    return bool(get_api_key())


def key_source() -> str:
    if _api_key_override:
        return "runtime"  # 管理员在设置页配置
    if settings.nanobanana_api_key:
        return "env"  # 来自 .env / 环境变量
    return "none"


def masked_api_key() -> str | None:
    key = get_api_key()
    if not key:
        return None
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}…{key[-4:]}"


def set_api_key(value: str | None) -> None:
    global _api_key_override
    _api_key_override = value or None


def set_model(value: str | None) -> None:
    global _model_override
    _model_override = value or None


# ===== 垂立调试链路（demo lane）=====
def demo_lane_enabled() -> bool:
    return _demo_lane_enabled


def get_demo_lane_model() -> str | None:
    return _demo_lane_model


def get_demo_lane_prompt() -> str | None:
    return _demo_lane_prompt


def set_demo_lane_enabled(value: bool) -> None:
    global _demo_lane_enabled
    _demo_lane_enabled = bool(value)


def set_demo_lane_model(value: str | None) -> None:
    global _demo_lane_model
    _demo_lane_model = value or None


def set_demo_lane_prompt(value: str | None) -> None:
    global _demo_lane_prompt
    _demo_lane_prompt = value or None
