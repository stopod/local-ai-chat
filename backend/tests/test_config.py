"""Settings の既定値と環境変数からの上書きを検証する。"""
from app.config import Settings, get_settings


def _make_settings(**overrides) -> Settings:
    """`.env` の影響を受けない Settings を生成する。"""
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


def test_既定値が計画書通り():
    s = _make_settings()
    assert s.ollama_url == "http://localhost:11434"
    assert s.ollama_model == "qwen2.5:latest"
    assert s.ollama_timeout_seconds == 600.0
    assert s.system_prompt == ""
    assert s.num_ctx == 8192
    assert s.max_history_chars == 24000


def test_環境変数から上書きできる(monkeypatch):
    monkeypatch.setenv("CHAT_OLLAMA_MODEL", "qwen2.5:14b")
    monkeypatch.setenv("CHAT_NUM_CTX", "16384")
    s = _make_settings()
    assert s.ollama_model == "qwen2.5:14b"
    assert s.num_ctx == 16384


def test_get_settings_は同じインスタンスを返す():
    a = get_settings()
    b = get_settings()
    assert a is b


def test_CORS_ORIGINS_に_Remix3_既定ポートが含まれる():
    from app.config import CORS_ORIGINS

    assert "http://localhost:44100" in CORS_ORIGINS
    assert "http://127.0.0.1:44100" in CORS_ORIGINS
