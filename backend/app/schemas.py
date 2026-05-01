"""チャット API のリクエスト・レスポンスを表す Pydantic モデル。"""
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None
    options: dict | None = None


class PromptPreset(BaseModel):
    """`backend/prompts/*.md` から読み出したシステムプロンプトのプリセット 1 件。"""

    id: str
    name: str
    content: str
