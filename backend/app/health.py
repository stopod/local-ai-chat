"""Ollama サーバーへの疎通確認。

Ollama の `/api/tags` を叩き、起動状態と既定モデルが pull 済みかを判定する。
HTTP クライアントは引数で受け取るため、テストでは MockTransport を差し込める。
"""
import httpx


async def check_ollama(
    client: httpx.AsyncClient,
    ollama_url: str,
    default_model: str,
    timeout: float = 5.0,
) -> dict:
    try:
        response = await client.get(f"{ollama_url}/api/tags", timeout=timeout)
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError):
        return {
            "ollama_up": False,
            "default_model": default_model,
            "default_model_pulled": False,
        }

    models = [m.get("name") for m in response.json().get("models", [])]
    return {
        "ollama_up": True,
        "default_model": default_model,
        "default_model_pulled": default_model in models,
    }
