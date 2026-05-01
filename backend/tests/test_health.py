"""Ollama 疎通確認 (health) のロジックを検証する。"""
import httpx
import pytest

from app.health import check_ollama


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_モデルが_pull_済みなら_default_model_pulled_は_True():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(
            200, json={"models": [{"name": "qwen2.5:latest"}, {"name": "gemma3:4b"}]}
        )

    async with _client(handler) as client:
        result = await check_ollama(client, "http://x", "qwen2.5:latest")

    assert result == {
        "ollama_up": True,
        "default_model": "qwen2.5:latest",
        "default_model_pulled": True,
    }


async def test_モデル一覧に既定モデルが無ければ_pulled_は_False():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "gemma3:4b"}]})

    async with _client(handler) as client:
        result = await check_ollama(client, "http://x", "qwen2.5:latest")

    assert result["ollama_up"] is True
    assert result["default_model_pulled"] is False


async def test_Ollama_接続失敗時は_ollama_up_が_False():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    async with _client(handler) as client:
        result = await check_ollama(client, "http://x", "qwen2.5:latest")

    assert result == {
        "ollama_up": False,
        "default_model": "qwen2.5:latest",
        "default_model_pulled": False,
    }


async def test_Ollama_が_500_を返したら_ollama_up_は_False():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal error")

    async with _client(handler) as client:
        result = await check_ollama(client, "http://x", "qwen2.5:latest")

    assert result["ollama_up"] is False
