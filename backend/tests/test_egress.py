"""WhitelistTransport が許可外ホストへの request を拒否することを検証する。"""
import httpx
import pytest

from app.egress import BlockedEgressError, WhitelistTransport


def _ok(_: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"ok": True})


async def test_許可ホストへの_request_は通過する():
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"localhost"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        res = await client.get("http://localhost:11434/api/tags")

    assert res.status_code == 200


async def test_未許可ホストは_BlockedEgressError_で拒否される():
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"localhost"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(BlockedEgressError):
            await client.get("http://evil.example.com/")


async def test_複数ホストを許可できる():
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"localhost", "127.0.0.1"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        res1 = await client.get("http://localhost:11434/")
        res2 = await client.get("http://127.0.0.1:8080/")

    assert res1.status_code == 200
    assert res2.status_code == 200


async def test_ホスト判定は大文字小文字を無視する():
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"LOCALHOST"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        res = await client.get("http://LocalHost:11434/")

    assert res.status_code == 200


async def test_拒否時の例外メッセージに該当ホストが含まれる():
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"localhost"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(BlockedEgressError) as excinfo:
            await client.get("http://evil.example.com/")

    assert "evil.example.com" in str(excinfo.value)


async def test_BlockedEgressError_は_RequestError_のサブクラス():
    """既存の except httpx.RequestError ハンドラで拾えることを保証する。"""
    base = httpx.MockTransport(_ok)
    transport = WhitelistTransport({"localhost"}, base=base)

    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(httpx.RequestError):
            await client.get("http://evil.example.com/")
