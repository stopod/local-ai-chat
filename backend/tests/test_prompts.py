"""md ファイルからシステムプロンプトのプリセットを読み込む処理を検証する。"""
from pathlib import Path

from app.prompts import load_prompts


def _write(dir: Path, name: str, body: str) -> None:
    (dir / name).write_text(body, encoding="utf-8")


def test_見出し_と_本文を分離してプリセット化する(tmp_path: Path):
    _write(
        tmp_path,
        "kansai-ben.md",
        "# 関西弁アシスタント\n\nあなたは関西弁で答えるアシスタントです。\n",
    )

    prompts = load_prompts(tmp_path)

    assert len(prompts) == 1
    p = prompts[0]
    assert p.id == "kansai-ben"
    assert p.name == "関西弁アシスタント"
    assert p.content == "あなたは関西弁で答えるアシスタントです。"


def test_見出しが無ければファイル名を_name_にフォールバックする(tmp_path: Path):
    _write(tmp_path, "code-reviewer.md", "あなたはコードレビュアーです。\n")

    prompts = load_prompts(tmp_path)

    assert prompts[0].id == "code-reviewer"
    assert prompts[0].name == "code-reviewer"
    assert prompts[0].content == "あなたはコードレビュアーです。"


def test_md_以外の拡張子は無視する(tmp_path: Path):
    _write(tmp_path, "ignore.txt", "# テキスト\n本文\n")
    _write(tmp_path, "ok.md", "# OK\n本文\n")

    ids = [p.id for p in load_prompts(tmp_path)]

    assert ids == ["ok"]


def test_ファイル名昇順でソートされる(tmp_path: Path):
    _write(tmp_path, "z.md", "# Z\nzz\n")
    _write(tmp_path, "a.md", "# A\naa\n")
    _write(tmp_path, "m.md", "# M\nmm\n")

    ids = [p.id for p in load_prompts(tmp_path)]

    assert ids == ["a", "m", "z"]


def test_ディレクトリが存在しなくても空配列を返す(tmp_path: Path):
    missing = tmp_path / "no-such-dir"
    assert load_prompts(missing) == []


def test_空ディレクトリは空配列(tmp_path: Path):
    assert load_prompts(tmp_path) == []
