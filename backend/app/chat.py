"""Ollama `/api/chat` を呼ぶ純粋関数。

非ストリーム版とストリーム版の 2 種を提供する。HTTP クライアントは引数で受け取り、
テストでは MockTransport を差し込めるようにする。
"""
from collections.abc import AsyncIterator

import httpx

from .schemas import ChatMessage


def _build_payload(
    model: str,
    messages: list[ChatMessage],
    options: dict | None,
    num_ctx: int | None,
    stream: bool,
) -> dict:
    merged_options: dict = {**(options or {})}
    if num_ctx is not None:
        merged_options["num_ctx"] = num_ctx
    payload: dict = {
        "model": model,
        "messages": [m.model_dump() for m in messages],
        "stream": stream,
    }
    if merged_options:
        payload["options"] = merged_options
    return payload


async def chat_with_ollama(
    client: httpx.AsyncClient,
    ollama_url: str,
    model: str,
    messages: list[ChatMessage],
    options: dict | None = None,
    num_ctx: int | None = None,
    timeout: float = 600.0,
) -> ChatMessage:
    """Ollama にメッセージ列を投げ、assistant の応答を 1 件返す（非ストリーム）。"""
    payload = _build_payload(model, messages, options, num_ctx, stream=False)
    response = await client.post(
        f"{ollama_url}/api/chat",
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()
    return ChatMessage(
        role="assistant",
        content=data["message"]["content"],
    )


async def stream_chat_with_ollama(
    client: httpx.AsyncClient,
    ollama_url: str,
    model: str,
    messages: list[ChatMessage],
    options: dict | None = None,
    num_ctx: int | None = None,
    timeout: float = 600.0,
) -> AsyncIterator[bytes]:
    """Ollama を `stream=True` で叩き、NDJSON の各行を末尾改行つきの bytes で yield する。"""
    payload = _build_payload(model, messages, options, num_ctx, stream=True)
    async with client.stream(
        "POST",
        f"{ollama_url}/api/chat",
        json=payload,
        timeout=timeout,
    ) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if line:
                yield (line + "\n").encode("utf-8")
