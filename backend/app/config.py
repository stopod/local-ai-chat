"""アプリ全体の設定。

`CHAT_` プレフィックスの環境変数または `.env` から読み込む。
テストでは `Settings(_env_file=None, ...)` を使うと `.env` の影響を排除できる。
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CHAT_")

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:latest"
    ollama_timeout_seconds: float = 600.0
    system_prompt: str = ""
    num_ctx: int = 8192
    max_history_chars: int = 24000
    prompts_dir: Path = _BACKEND_ROOT / "prompts"


@lru_cache
def get_settings() -> Settings:
    """`.env` と環境変数を読み込んだ Settings を返す。"""
    return Settings()


CORS_ORIGINS: list[str] = [
    "http://localhost:44100",
    "http://127.0.0.1:44100",
]
