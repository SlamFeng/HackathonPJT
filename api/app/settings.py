from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    cors_origins: list[str] = ["http://localhost:3000"]

    storage_dir: str = "storage"
    data_dir: str = "data"

    nanobanana_api_key: str | None = None
    nanobanana_endpoint: str | None = None


settings = Settings()

