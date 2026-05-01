"""FastAPI エントリポイント。

ルーティング・CORS・依存性提供のみ担う。ビジネスロジックは個別モジュールに分離。
"""
import json
from collections.abc import AsyncIterator

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .chat import stream_chat_with_ollama
from .config import CORS_ORIGINS, Settings, get_settings
from .health import check_ollama
from .schemas import ChatRequest

app = FastAPI(title="local-ai-chat", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_http_client() -> AsyncIterator[httpx.AsyncClient]:
    """リクエストごとに使い捨ての AsyncClient を提供する。テストでは override される。"""
    async with httpx.AsyncClient() as client:
        yield client


@app.get("/api/health")
async def health(
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> dict:
    return await check_ollama(client, settings.ollama_url, settings.ollama_model)


def _error_line(message: str) -> bytes:
    return (json.dumps({"error": message}) + "\n").encode("utf-8")


@app.post("/api/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """Ollama の NDJSON ストリームを透過して返す。

    - クライアント切断を毎行ループで検知し、Ollama 接続を素早く閉じる。
    - 接続失敗・5xx は HTTP 200 のままストリームの最後に `{"error":"..."}` を 1 行挟む。
    """

    async def generate() -> AsyncIterator[bytes]:
        try:
            async for line in stream_chat_with_ollama(
                client,
                ollama_url=settings.ollama_url,
                model=body.model or settings.ollama_model,
                messages=body.messages,
                options=body.options,
                num_ctx=settings.num_ctx,
                timeout=settings.ollama_timeout_seconds,
            ):
                if await request.is_disconnected():
                    break
                yield line
        except httpx.HTTPStatusError as e:
            yield _error_line(f"Ollama returned {e.response.status_code}")
        except httpx.RequestError as e:
            yield _error_line(f"Cannot reach Ollama: {e!s}")

    return StreamingResponse(generate(), media_type="application/x-ndjson")
