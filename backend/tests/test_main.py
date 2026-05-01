"""FastAPI アプリのエンドポイントを TestClient で検証する。"""
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_http_client


@pytest.fixture
def client_with_fake_ollama():
    """指定したハンドラで Ollama を模した HTTP クライアントを差し込む TestClient を返すファクトリ。"""

    def _build(handler):
        async def _override() -> AsyncIterator[httpx.AsyncClient]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
                yield c

        app.dependency_overrides[get_http_client] = _override
        return TestClient(app)

    yield _build
    app.dependency_overrides.clear()


def test_health_は_Ollama_起動時に_200_を返す(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "qwen2.5:latest"}]})

    client = client_with_fake_ollama(handler)
    res = client.get("/api/health")

    assert res.status_code == 200
    body = res.json()
    assert body["ollama_up"] is True
    assert body["default_model"] == "qwen2.5:latest"
    assert body["default_model_pulled"] is True


def test_health_は_Ollama_停止時にも_200_でフラグを返す(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    client = client_with_fake_ollama(handler)
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json()["ollama_up"] is False


def test_chat_は_assistant_応答を_JSON_で返す(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/chat":
            return httpx.Response(
                200,
                json={"message": {"role": "assistant", "content": "こんにちは"}},
            )
        raise AssertionError(f"unexpected path {request.url}")

    client = client_with_fake_ollama(handler)
    res = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}
    )

    assert res.status_code == 200
    assert res.json() == {"role": "assistant", "content": "こんにちは"}


def test_chat_は_messages_空だと_422_を返す(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Ollama に届いてはならない")

    client = client_with_fake_ollama(handler)
    res = client.post("/api/chat", json={"messages": []})

    assert res.status_code == 422


def test_chat_は_Ollama_接続失敗で_503(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    client = client_with_fake_ollama(handler)
    res = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}
    )

    assert res.status_code == 503


def test_chat_は_Ollama_の_5xx_を_502_に変換する(client_with_fake_ollama):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = client_with_fake_ollama(handler)
    res = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}
    )

    assert res.status_code == 502
