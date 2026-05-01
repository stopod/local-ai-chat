"""Ollama /api/chat を呼ぶ純粋関数（非ストリーム / ストリーム）を検証する。"""
import json

import httpx
import pytest

from app.chat import chat_with_ollama, stream_chat_with_ollama
from app.schemas import ChatMessage


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_assistant_メッセージを取り出せる():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "qwen2.5:latest",
                "message": {"role": "assistant", "content": "こんにちは"},
                "done": True,
            },
        )

    async with _client(handler) as client:
        result = await chat_with_ollama(
            client,
            ollama_url="http://x",
            model="qwen2.5:latest",
            messages=[ChatMessage(role="user", content="hi")],
        )

    assert result == ChatMessage(role="assistant", content="こんにちは")


async def test_payload_に_model_と_stream_False_と_messages_が入る():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200, json={"message": {"role": "assistant", "content": "ok"}}
        )

    async with _client(handler) as client:
        await chat_with_ollama(
            client,
            ollama_url="http://x",
            model="qwen2.5:latest",
            messages=[
                ChatMessage(role="system", content="be brief"),
                ChatMessage(role="user", content="hi"),
            ],
        )

    assert captured["url"] == "http://x/api/chat"
    body = captured["body"]
    assert body["model"] == "qwen2.5:latest"
    assert body["stream"] is False
    assert body["messages"] == [
        {"role": "system", "content": "be brief"},
        {"role": "user", "content": "hi"},
    ]


async def test_options_と_num_ctx_が_payload_options_にマージされる():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200, json={"message": {"role": "assistant", "content": "ok"}}
        )

    async with _client(handler) as client:
        await chat_with_ollama(
            client,
            ollama_url="http://x",
            model="qwen2.5:latest",
            messages=[ChatMessage(role="user", content="hi")],
            options={"temperature": 0.5},
            num_ctx=4096,
        )

    assert captured["body"]["options"] == {"temperature": 0.5, "num_ctx": 4096}


async def test_options_を_渡さなくても_num_ctx_だけ送れる():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200, json={"message": {"role": "assistant", "content": "ok"}}
        )

    async with _client(handler) as client:
        await chat_with_ollama(
            client,
            ollama_url="http://x",
            model="qwen2.5:latest",
            messages=[ChatMessage(role="user", content="hi")],
            num_ctx=8192,
        )

    assert captured["body"]["options"] == {"num_ctx": 8192}


async def test_HTTP_エラーは_例外を伝播する():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async with _client(handler) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await chat_with_ollama(
                client,
                ollama_url="http://x",
                model="qwen2.5:latest",
                messages=[ChatMessage(role="user", content="hi")],
            )


# --- ストリーム版 ---


async def test_stream_chat_は_payload_に_stream_True_を入れる():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, content=b'{"done":true}\n')

    async with _client(handler) as client:
        async for _ in stream_chat_with_ollama(
            client,
            ollama_url="http://x",
            model="qwen2.5:latest",
            messages=[ChatMessage(role="user", content="hi")],
        ):
            pass

    assert captured["body"]["stream"] is True


async def test_stream_chat_は_NDJSON_の各行を_bytes_で_yield_する():
    chunks = (
        b'{"message":{"role":"assistant","content":"\xe3\x81\x93"},"done":false}\n'
        b'{"message":{"role":"assistant","content":"\xe3\x82\x93"},"done":false}\n'
        b'{"done":true,"total_duration":1234}\n'
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=chunks)

    async with _client(handler) as client:
        results = [
            line
            async for line in stream_chat_with_ollama(
                client,
                ollama_url="http://x",
                model="qwen2.5:latest",
                messages=[ChatMessage(role="user", content="hi")],
            )
        ]

    assert len(results) == 3
    assert all(line.endswith(b"\n") for line in results)
    parsed = [json.loads(line) for line in results]
    assert parsed[0]["message"]["content"] == "こ"
    assert parsed[2]["done"] is True


async def test_stream_chat_は_HTTP_エラー時に例外を伝播する():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async with _client(handler) as client:
        with pytest.raises(httpx.HTTPStatusError):
            async for _ in stream_chat_with_ollama(
                client,
                ollama_url="http://x",
                model="qwen2.5:latest",
                messages=[ChatMessage(role="user", content="hi")],
            ):
                pass
