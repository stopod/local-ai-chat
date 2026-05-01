"""`backend/prompts/*.md` からシステムプロンプトのプリセットを読み込む。

形式は最小限:
- 1 行目が `# <表示名>` ならそれを `name` に、残りを `content` にする
- 1 行目が `#` で始まらなければ、ファイル名（拡張子なし）を `name` に、ファイル全体を `content` にする
- 末尾の改行は trim する
"""
import logging
from pathlib import Path

from .schemas import PromptPreset

logger = logging.getLogger(__name__)


def _parse(path: Path) -> PromptPreset:
    text = path.read_text(encoding="utf-8").strip("﻿")
    lines = text.splitlines()

    if lines and lines[0].lstrip().startswith("#"):
        name = lines[0].lstrip("#").strip() or path.stem
        # 見出しの直後に空行が 1 行ある場合はそれも捨てる（よくある書き方）
        rest = lines[1:]
        if rest and rest[0].strip() == "":
            rest = rest[1:]
        content = "\n".join(rest).strip()
    else:
        name = path.stem
        content = text.strip()

    return PromptPreset(id=path.stem, name=name, content=content)


def load_prompts(directory: Path) -> list[PromptPreset]:
    if not directory.exists() or not directory.is_dir():
        return []

    prompts: list[PromptPreset] = []
    for path in sorted(directory.glob("*.md")):
        try:
            prompts.append(_parse(path))
        except OSError as exc:
            logger.warning("Failed to read prompt file %s: %s", path, exc)
    return prompts
