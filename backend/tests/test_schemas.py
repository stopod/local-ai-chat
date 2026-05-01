"""チャット API のリクエスト・メッセージモデルを検証する。"""
import pytest
from pydantic import ValidationError

from app.schemas import ChatMessage, ChatRequest


def test_ChatMessage_は_role_と_content_を持つ():
    msg = ChatMessage(role="user", content="こんにちは")
    assert msg.role == "user"
    assert msg.content == "こんにちは"


def test_ChatMessage_の_role_は_3種に限定される():
    for valid in ("system", "user", "assistant"):
        ChatMessage(role=valid, content="x")  # 例外なし

    with pytest.raises(ValidationError):
        ChatMessage(role="unknown", content="x")  # type: ignore[arg-type]


def test_ChatRequest_の_messages_は_少なくとも_1_件必要():
    with pytest.raises(ValidationError):
        ChatRequest(messages=[])


def test_ChatRequest_は_messages_と_model_と_options_を受け取る():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="hi")],
        model="qwen2.5:latest",
        options={"temperature": 0.5},
    )
    assert req.messages[0].content == "hi"
    assert req.model == "qwen2.5:latest"
    assert req.options == {"temperature": 0.5}


def test_ChatRequest_の_model_と_options_は_省略可能():
    req = ChatRequest(messages=[ChatMessage(role="user", content="hi")])
    assert req.model is None
    assert req.options is None
