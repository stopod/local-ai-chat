"""Ollama `/api/chat` を呼ぶ純粋関数。

非ストリーム版 (`stream=False`) のみを提供する（Phase 1）。Phase 2 で同じファイルに
ストリーム版を追加する想定。
"""
import httpx

from .schemas import ChatMessage


async def chat_with_ollama(
    client: httpx.AsyncClient,
    ollama_url: str,
    model: str,
    messages: list[ChatMessage],
    options: dict | None = None,
    num_ctx: int | None = None,
    timeout: float = 600.0,
) -> ChatMessage:
    """Ollama にメッセージ列を投げ、assistant の応答を 1 件返す。"""
    merged_options: dict = {**(options or {})}
    if num_ctx is not None:
        merged_options["num_ctx"] = num_ctx

    payload: dict = {
        "model": model,
        "messages": [m.model_dump() for m in messages],
        "stream": False,
    }
    if merged_options:
        payload["options"] = merged_options

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
