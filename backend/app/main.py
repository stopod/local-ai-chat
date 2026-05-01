"""FastAPI エントリポイント。

ルーティング・CORS・依存性提供のみ担う。ビジネスロジックは個別モジュールに分離。
"""
import json
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .chat import stream_chat_with_ollama
from .config import CORS_ORIGINS, Settings, get_settings
from .egress import WhitelistTransport
from .health import check_ollama
from .prompts import load_prompts
from .schemas import ChatRequest
from .trim import trim_messages

app = FastAPI(title="local-ai-chat", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _allowed_egress_hosts(settings: Settings) -> set[str]:
    """設定から egress 許可ホスト集合を作る。

    Ollama URL のホストは自動で含める。`egress_allowlist` で追加可能。
    """
    hosts = {h.lower() for h in settings.egress_allowlist}
    parsed = urlparse(settings.ollama_url)
    if parsed.hostname:
        hosts.add(parsed.hostname.lower())
    return hosts


async def get_http_client() -> AsyncIterator[httpx.AsyncClient]:
    """リクエストごとに使い捨ての AsyncClient を提供する。

    `WhitelistTransport` でラップしているので、設定で許可されたホスト
    （既定では Ollama の localhost のみ）以外への request は
    `BlockedEgressError` で拒否される。テストでは dependency override で差し替えられる。
    """
    settings = get_settings()
    transport = WhitelistTransport(_allowed_egress_hosts(settings))
    async with httpx.AsyncClient(transport=transport) as client:
        yield client


@app.get("/api/health")
async def health(
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> dict:
    return await check_ollama(client, settings.ollama_url, settings.ollama_model)


@app.get("/api/models")
async def models(
    client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Ollama にインストール済みのモデル一覧を返す（フロントの切替 UI 用）。"""
    try:
        response = await client.get(f"{settings.ollama_url}/api/tags", timeout=5.0)
        response.raise_for_status()
        data = response.json()
        return {"models": data.get("models", [])}
    except (httpx.RequestError, httpx.HTTPStatusError):
        return {"models": []}


@app.get("/api/prompts")
async def prompts(
    settings: Settings = Depends(get_settings),
) -> dict:
    """`prompts_dir` 内の md ファイルから読み出したプリセット一覧を返す。

    リクエスト毎にディレクトリを読み直すので、md を編集すれば再起動なしで反映される。
    """
    return {"prompts": [p.model_dump() for p in load_prompts(settings.prompts_dir)]}


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

    trimmed = trim_messages(body.messages, settings.max_history_chars)

    async def generate() -> AsyncIterator[bytes]:
        try:
            async for line in stream_chat_with_ollama(
                client,
                ollama_url=settings.ollama_url,
                model=body.model or settings.ollama_model,
                messages=trimmed,
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
