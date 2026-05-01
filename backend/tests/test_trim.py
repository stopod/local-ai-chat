"""簡易コンテキストトリミングを検証する。"""
from app.schemas import ChatMessage
from app.trim import trim_messages


def _msg(role: str, content: str) -> ChatMessage:
    return ChatMessage(role=role, content=content)  # type: ignore[arg-type]


def test_max_chars_未満なら全件返す():
    msgs = [_msg("user", "a" * 10), _msg("assistant", "b" * 10)]
    assert trim_messages(msgs, max_chars=100) == msgs


def test_system_メッセージは常に保持される():
    msgs = [
        _msg("system", "be brief"),
        _msg("user", "a" * 100),
        _msg("assistant", "b" * 100),
        _msg("user", "latest"),
    ]
    result = trim_messages(msgs, max_chars=20)

    assert result[0].role == "system"
    assert result[0].content == "be brief"
    # 最新のメッセージは残る
    assert result[-1].content == "latest"


def test_古いメッセージから順に切り捨てられる():
    msgs = [
        _msg("user", "old1"),
        _msg("assistant", "old2"),
        _msg("user", "fresh"),
    ]
    # 5 文字に絞ると最後の "fresh" だけ残る
    result = trim_messages(msgs, max_chars=5)

    assert result == [_msg("user", "fresh")]


def test_最後の_1_件はサイズ超過でも残す():
    msgs = [_msg("user", "x" * 1000)]
    result = trim_messages(msgs, max_chars=10)

    assert result == msgs


def test_max_chars_が_0_以下なら何もしない():
    msgs = [_msg("user", "a"), _msg("assistant", "b")]
    assert trim_messages(msgs, max_chars=0) == msgs
    assert trim_messages(msgs, max_chars=-1) == msgs


def test_複数の_system_メッセージも全部保持():
    msgs = [
        _msg("system", "rule1"),
        _msg("user", "x" * 100),
        _msg("system", "rule2"),
        _msg("user", "latest"),
    ]
    result = trim_messages(msgs, max_chars=10)

    system_contents = [m.content for m in result if m.role == "system"]
    assert system_contents == ["rule1", "rule2"]
