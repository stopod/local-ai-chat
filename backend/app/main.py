"""FastAPI エントリポイント。

ルーティング・CORS・依存性提供のみ担う。ビジネスロジックは個別モジュールに分離。
"""
from collections.abc import AsyncIterator

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, Settings, get_settings
from .health import check_ollama

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
