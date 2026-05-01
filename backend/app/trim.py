"""会話履歴の簡易トリミング。

`system` メッセージは順序を保ったまま全部残し、それ以外は末尾（最新）から
累積文字数が `max_chars` を超えたところより古いものを切り捨てる。
ただし末尾の 1 件は超過していても必ず残す（最新の発話を捨てると会話が壊れるため）。

トークン単位ではなく文字数で近似。日本語混じりだと過剰に保守的（残す側に倒れる）になる傾向。
"""
from .schemas import ChatMessage


def trim_messages(messages: list[ChatMessage], max_chars: int) -> list[ChatMessage]:
    if max_chars <= 0:
        return list(messages)

    system_with_index = [
        (i, m) for i, m in enumerate(messages) if m.role == "system"
    ]
    rest = [m for m in messages if m.role != "system"]

    kept_rest_reversed: list[ChatMessage] = []
    total = 0
    for msg in reversed(rest):
        total += len(msg.content)
        if total > max_chars and kept_rest_reversed:
            break
        kept_rest_reversed.append(msg)
    kept_rest = list(reversed(kept_rest_reversed))

    return [m for _, m in system_with_index] + kept_rest
