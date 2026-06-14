from __future__ import annotations

from pydantic import BaseModel


class SettingsOut(BaseModel):
    hasApiKey: bool
    apiKeyMasked: str | None
    keySource: str  # runtime | env | none
    model: str
    availableModels: list[str]


class SettingsUpdate(BaseModel):
    # 用 model_fields_set 区分「未传该字段」与「传了 null/空字符串（=清除）」
    apiKey: str | None = None
    model: str | None = None


class ConfigStatusOut(BaseModel):
    hasApiKey: bool
    model: str
