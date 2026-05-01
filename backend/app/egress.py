"""HTTP egress を許可ホストに限定する transport。

LLM への入力に意図せぬ外部 URL が混入したり、コード変更で外部 fetch が
追加された場合でも、ここで定義した allowlist 外のホストは拒否される。

設計の基本方針:
- ローカル単独運用前提。Ollama を含む localhost への通信のみ許可
- 「外部に出ない」をコードレベルで保証する多層防御の一段目
- 完全な遮断が必要なら OS ファイアウォールも併用する（README 参照）
"""
from collections.abc import Iterable

import httpx


class BlockedEgressError(httpx.RequestError):
    """allowlist 外のホストへの request を拒否したときの例外。

    `httpx.RequestError` を継承しているので、既存の `except httpx.RequestError`
    ハンドラ（`/api/chat` のエラー処理など）で自然に捕捉できる。
    """

    def __init__(self, host: str | None, request: httpx.Request) -> None:
        super().__init__(
            f"Blocked egress to disallowed host: {host or '<no host>'}",
            request=request,
        )


class WhitelistTransport(httpx.AsyncBaseTransport):
    """`allowed_hosts` 以外への request を拒否する transport。

    base transport（既定で実 HTTP の `AsyncHTTPTransport`）を内包し、
    ホスト判定だけを pre-process する。テストでは `httpx.MockTransport` を
    `base` として渡せばそのまま組み合わせられる。
    """

    def __init__(
        self,
        allowed_hosts: Iterable[str],
        *,
        base: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._allowed = {h.lower() for h in allowed_hosts}
        self._base = base or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        host = (request.url.host or "").lower()
        if host not in self._allowed:
            raise BlockedEgressError(host or None, request)
        return await self._base.handle_async_request(request)

    async def aclose(self) -> None:
        await self._base.aclose()
