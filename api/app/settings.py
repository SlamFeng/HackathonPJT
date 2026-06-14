from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # 逗号分隔的允许来源（见 cors_origin_list）。用 str 避免 pydantic 对 list 强制 JSON 解析。
    cors_origins: str = "http://localhost:3000"

    storage_dir: str = "storage"
    data_dir: str = "data"

    nanobanana_api_key: str | None = None
    nanobanana_endpoint: str | None = None
    # NanoBanana（Gemini 原生图像能力）默认模型：Gemini 3.1 Flash Image Preview
    nanobanana_model: str = "gemini-3.1-flash-image-preview"

    # ===== Phase 1：数据库与鉴权 =====
    # 本地/容器默认指向 compose 内的 db 服务；本机直跑可用 localhost
    database_url: str = "postgresql+asyncpg://ailurus:ailurus@localhost:5432/ailurus"

    session_secret: str = "dev-insecure-secret-change-me"
    session_cookie_name: str = "ailurus_session"
    session_ttl_hours: int = 24 * 30
    # 生产（HTTPS）应设为 true
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # 首次启动自动创建的管理员（留空则不创建）
    admin_email: str | None = None
    admin_password: str | None = None

    # ===== Phase 3：后台任务 worker =====
    # 默认在 API 进程内跑 worker（本地零配置）。Docker 拆分部署时把 API 设为 false，
    # 另起一个独立 worker 进程（python worker.py）。
    worker_in_process: bool = True
    worker_concurrency: int = 2
    worker_poll_interval_sec: float = 1.0

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins
        if isinstance(raw, str):
            return [o.strip() for o in raw.split(",") if o.strip()]
        return raw


settings = Settings()
