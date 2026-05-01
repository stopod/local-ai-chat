# local-ai-chat

ローカルの [Ollama](https://ollama.com/) (Qwen2.5) をバックエンドに、ブラウザで動く 1 対 1 のチャットアプリ。外部 API は一切使わず、PC 単独で完結する。

## 概要

ChatGPT のような対話 UI を **完全ローカル** で動かしたい人向けの最小実装。会話はブラウザの IndexedDB に保存され、サーバー側に履歴は残らない。

- 推論は手元の PC（GPU/CPU）で完結 — 機密情報をクラウドに送りたくない用途に向く
- 既に Ollama を入れていれば、その資産（モデル）をそのまま流用できる
- バックエンドの実装はシンプル（FastAPI + httpx ストリームプロキシ）で、改造しやすい
- フロントエンドは **Remix 3 ベータ**（プレリリース、Preact フォーク）を採用。フレームワークの実験的な利用も兼ねる

## 主な機能

- ✅ マルチターン会話（システムプロンプト・user・assistant の履歴を保持）
- ✅ トークン逐次表示（NDJSON ストリーム、ChatGPT 風の流れる UX）
- ✅ 生成停止ボタン（フロント・バックエンド両側で接続を閉じる）
- ✅ 会話の永続化（IndexedDB）と サイドバーでの履歴管理（新規 / 読込 / 削除）
- ✅ システムプロンプトの UI 編集（会話単位）
- ✅ モデル切替 UI（Ollama にインストール済みモデルから選択）
- ✅ コンテキスト長の自動トリミング（長い会話で古い発話を切り捨て）
- ✅ Markdown 描画 + サニタイズ（XSS 対策）
- ⏸ コードシンタックスハイライト — Phase 4 で `highlight.js` を試したが Remix 3 のアセットサーバーが ESM only で非互換、MVP では一旦見送り

## アーキテクチャ

```
[Remix 3 (Preact, :44100)]
    │ fetch /api/chat   (POST, NDJSON streaming response)
    │ fetch /api/models (GET)
    │ fetch /api/health (GET)
    ▼
[FastAPI (:8000)]
    │ httpx.AsyncClient stream
    ▼
[Ollama (:11434)]
    │ POST /api/chat (stream=true, NDJSON)
    │ GET  /api/tags (モデル一覧)
    ▼
Qwen2.5:latest 等
```

バックエンド (FastAPI) を挟む理由:

- システムプロンプトをサーバ側で扱える（将来の拡張性）
- CORS と API 整形を 1 箇所に集約
- コンテキストの自動トリミングをサーバ側で実施

会話履歴はクライアント側 IndexedDB に保存。サーバーには永続化しない（ローカル単独運用前提）。将来 SQLite に差し替えやすいよう Repository パターンで抽象化済み。

## 技術スタック

### バックエンド

| 用途 | 採用 |
|---|---|
| ランタイム | Python 3.12（[uv](https://docs.astral.sh/uv/) 管理） |
| Web フレームワーク | [FastAPI](https://fastapi.tiangolo.com/) |
| HTTP クライアント | [httpx](https://www.python-httpx.org/)（`AsyncClient.stream` で Ollama に並走） |
| 設定 | [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) |
| サーバー | [uvicorn](https://www.uvicorn.org/) |
| テスト | [pytest](https://docs.pytest.org/) + pytest-asyncio（35 件） |

### フロントエンド

| 用途 | 採用 |
|---|---|
| ランタイム | Node.js **>= 24.3.0**（Remix 3 の要件） |
| フレームワーク | [Remix 3 ベータ](https://remix.run/blog/remix-3-beta-preview)（Preact フォーク内蔵、Fetch API ベース） |
| 言語 | TypeScript |
| dev サーバー | [tsx](https://tsx.is/) watch |
| 永続化 | [idb](https://github.com/jakearchibald/idb)（IndexedDB ラッパ） |
| Markdown | [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) |
| スタイル | Remix 3 の `css()` ミックスイン |

### LLM ランタイム

| 用途 | 採用 |
|---|---|
| ランタイム | [Ollama](https://ollama.com/) |
| 既定モデル | Qwen2.5:latest（7B、Q4_K_M、約 4.7 GB） |
| 切替モデル | `ollama pull` で取得した任意のモデル（UI から選択） |

## プロジェクト構成

```
local-ai-chat/
├─ backend/                 # FastAPI バックエンド
│  ├─ app/
│  │   ├─ main.py            # ルーティング・CORS・依存注入
│  │   ├─ chat.py            # Ollama /api/chat の純粋関数
│  │   ├─ health.py          # 疎通確認
│  │   ├─ trim.py            # コンテキスト自動トリミング
│  │   ├─ schemas.py         # Pydantic モデル
│  │   └─ config.py          # pydantic-settings
│  ├─ tests/                 # pytest（35 件）
│  ├─ pyproject.toml
│  └─ .env.example
├─ frontend/                # Remix 3 フロントエンド
│  ├─ app/
│  │   ├─ routes.ts / router.ts
│  │   ├─ controllers/chat.tsx           # GET /chat
│  │   ├─ ui/chat-page.tsx               # SSR Layout
│  │   ├─ ui/chat-composer.tsx           # clientEntry: チャット UI
│  │   └─ utils/
│  │       ├─ chat-api.ts                # /api/* fetch ラッパ + streamChat
│  │       ├─ conversation-repository.ts # 永続化の型のみ
│  │       ├─ indexeddb-repository.ts    # IndexedDB 実装
│  │       └─ markdown.ts                # marked + DOMPurify
│  ├─ server.ts              # Remix 3 エントリ
│  └─ package.json
├─ docs/
│  └─ setup.md              # セットアップ手順とトラブルシューティング
├─ qwen-chat-plan.md        # 設計判断・MVP スコープ・代替案
├─ CLAUDE.md                # 開発方針（関数型・TDD・日本語・機能単位 commit）
└─ README.md                # このファイル
```

## はじめかた

詳細なセットアップは [docs/setup.md](docs/setup.md) を参照。要約すると:

```powershell
# 前提: Ollama, Volta, uv が入っていること
ollama pull qwen2.5
volta install node@24

# バックエンド
cd backend
uv sync
uv run uvicorn app.main:app --port 8000

# フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev   # http://localhost:44100/chat
```

## 開発

### テスト

```powershell
# バックエンド: pytest 35 件
cd backend && uv run pytest

# フロントエンド: 型チェック
cd frontend && npm run typecheck
```

### 設計ドキュメント

- [qwen-chat-plan.md](qwen-chat-plan.md) — このプロジェクトで採った設計判断、代替案、リスクと対処
- [CLAUDE.md](CLAUDE.md) — 開発方針（関数型・TDD・日本語・機能単位 commit）

## 制約・注意

- **ローカル単独運用前提**。認証なし、CORS は `localhost` のみ許可。インターネット公開向けにはそのまま使えない。
- **Remix 3 はベータ版**。GA は 2026 年早期予定。本番採用は要検討。
- **Whisper 等の他 GPU 推論と同時稼働すると VRAM 不足になりうる**（Qwen 2.5:latest は 4.7 GB 程度）。同 PC で他の重いモデルを並行動作させない運用を想定。

## ライセンス

このリポジトリで自分が書いたコードは [MIT License](LICENSE) で公開しています。商用利用・改変・再配布・販売すべて自由、著作権表示とライセンス文だけ残せば OK。本ソフトウェアに対する一切の保証はありません（`AS IS`）。

依存ライブラリや scaffold 由来のファイルなど、サードパーティの著作権・ライセンスについては [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に整理しています。

## Acknowledgments

このプロジェクトは以下の OSS / 公開モデルなしには成立しません。各プロジェクトの開発者・コミュニティに感謝します。

- **[Remix 3](https://remix.run/)** by Shopify — Preact フォーク内蔵の Web フレームワーク。フロント全体の土台
- **[FastAPI](https://fastapi.tiangolo.com/)** — バックエンドの土台
- **[httpx](https://www.python-httpx.org/)** — Ollama への async ストリーム接続
- **[Ollama](https://ollama.com/)** — ローカル LLM 実行ランタイム
- **[Qwen2.5](https://github.com/QwenLM/Qwen2.5)** by Alibaba Cloud — 推論モデル
- **[idb](https://github.com/jakearchibald/idb)** by Jake Archibald — IndexedDB ラッパ
- **[marked](https://marked.js.org/)** / **[DOMPurify](https://github.com/cure53/DOMPurify)** — Markdown 描画と XSS 対策

## Qwen の利用にあたって

このリポジトリは Qwen のモデル本体を含まず、Ollama 経由でユーザーが取得する前提です。**Qwen のライセンスはモデルサイズや時期によって変わる場合があるため**、商用利用や再配布を検討する場合は [Qwen 公式リポジトリ](https://github.com/QwenLM/Qwen2.5) で最新のライセンスを確認してください。本リポジトリ自体の MIT ライセンスは、Qwen の利用条件をユーザーに対して上書き・保証するものではありません。
