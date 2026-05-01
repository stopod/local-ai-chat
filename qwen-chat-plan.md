# local-ai-chat 計画書（最終版）

本ドキュメントは、本プロジェクト（local-ai-chat）で構築するローカル Qwen チャットアプリの計画書である。隣の whisper-api プロジェクトで稼働している Ollama + Qwen2.5 をバックエンドとして共用する。

---

## 1. Context（背景・動機・スコープ）

**作るもの**: ローカルの Ollama + Qwen2.5 をバックエンドに、ブラウザで動く 1 対 1 チャットアプリ。

**前提**:
- whisper-api で Ollama (`qwen2.5:latest`, 4.7 GB) が既に常駐し再利用可能（参照: `c:\dev\whisper-api\ai-stack.md`）。
- バックエンド側のコード構成（FastAPI / httpx / pydantic-settings / uv）と CORS・lifespan の流儀は whisper-api からそのまま転用。
- フロントは whisper-api では vanilla TS だが、本プロジェクトでは **Remix 3 ベータ**（プレリリース・Preact フォーク採用）を採用して試す。
- 外部 API 不使用、認証なし、ローカル単独運用前提。

**MVP に含む機能**:
- マルチターン会話（ストリーム表示、停止可）
- システムプロンプトの UI 編集
- 会話履歴のブラウザ保存（IndexedDB / `idb`）
- モデル切替 UI（Ollama にインストール済みモデル一覧から選択）
- コンテキスト長の自動トリミング（古いメッセージを落とす）
- Markdown 描画 + サニタイズ（Preact 互換ライブラリで）

**MVP に含めない**:
- 認証・複数ユーザー
- 画像／ファイル添付
- RAG・ベクトル検索
- 音声入出力
- PWA 化（必要になったら後で）

---

## 2. アーキテクチャ

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

**重要な決定事項**:

| 項目 | 決定 | 理由 |
|---|---|---|
| Ollama API | `/api/chat` | messages 配列をそのまま渡せる、チャットテンプレートを Ollama 任せ |
| ストリーム形式 | NDJSON プロキシ | Ollama の NDJSON を透過。SSE 整形より実装が短い |
| バックエンドを挟む | 挟む | システムプロンプト隠蔽・将来の認証拡張・CORS 一元化 |
| フロント | Remix 3 ベータ | 学習・実験目的。React 不使用、Preact フォーク採用 |
| 永続化 | IndexedDB (`idb`) | whisper-api と同じライブラリ。サーバ DB は不要 |
| 認証 | なし | ローカル単独運用 |

---

## 3. ディレクトリ構成

```
local-ai-chat/
├─ backend/
│  ├─ pyproject.toml           # whisper-api と同じスタイル（uv）
│  ├─ .python-version          # 3.12
│  ├─ .env.example
│  └─ app/
│     ├─ main.py               # FastAPI エントリ・CORS・ルート
│     ├─ chat.py               # Ollama /api/chat ストリームのプロキシ
│     ├─ models.py             # Ollama /api/tags のラッパ
│     ├─ trim.py               # コンテキスト長の自動トリミング
│     ├─ schemas.py            # Pydantic モデル
│     └─ config.py             # pydantic-settings
├─ frontend/                    # `npx remix@next new frontend` で scaffold
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ server.ts                 # エントリ（remix/node-serve）
│  └─ app/
│     ├─ routes.ts              # ルート定義（型安全）
│     ├─ router.ts              # ルート→ハンドラの紐付け
│     ├─ assets.ts              # アセット配信の allow リスト
│     ├─ controllers/
│     │   └─ chat.tsx           # GET /chat ハンドラ（ChatPage を render）
│     ├─ ui/
│     │   ├─ chat-page.tsx      # サーバーサイド: Layout でラップ
│     │   ├─ chat-composer.tsx  # clientEntry: サイドバー＋メッセージ＋入力
│     │   └─ document.tsx, layout.tsx (scaffold 既存)
│     └─ utils/
│         ├─ chat-api.ts                # /api/chat の fetch ラッパ（streamChat）
│         ├─ conversation-repository.ts # 永続化の型のみ（実装非依存）
│         ├─ indexeddb-repository.ts    # ConversationRepository の IndexedDB 実装
│         └─ markdown.ts                # marked + DOMPurify（Phase 4）
├─ qwen-chat-plan.md           # 本ファイル
└─ README.md
```

---

## 4. Backend 設計（FastAPI）

### 依存（pyproject.toml）
- `fastapi>=0.115`
- `httpx>=0.28`
- `pydantic-settings>=2.5`
- `uvicorn[standard]>=0.30`
- Python 3.12、uv 管理

whisper-api の `c:\dev\whisper-api\backend\pyproject.toml` と同じ流儀。faster-whisper や CUDA ランタイムは不要。

### config.py
流儀は `c:\dev\whisper-api\backend\app\config.py` を踏襲。

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CHAT_")
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:latest"
    ollama_timeout_seconds: float = 600.0   # whisper-api と揃える
    system_prompt: str = ""                  # 既定は空。フロントから override
    num_ctx: int = 8192                      # Ollama 既定 2048 では会話が浅い、Qwen2.5 は 32K まで
    max_history_chars: int = 24000           # トリミング閾値（簡易、文字数ベース）

CORS_ORIGINS = ["http://localhost:44100", "http://127.0.0.1:44100"]
```

### エンドポイント

#### `POST /api/chat`

**リクエスト**:
```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "model": "qwen2.5:latest",
  "options": {"temperature": 0.7}
}
```

**レスポンス**: `application/x-ndjson`（Ollama の NDJSON をほぼ透過）
```
{"message":{"role":"assistant","content":"こ"},"done":false}
{"message":{"role":"assistant","content":"ん"},"done":false}
...
{"done":true,"total_duration":...,"eval_count":...}
```

**実装ポイント**（chat.py）:
- `httpx.AsyncClient(timeout=settings.ollama_timeout_seconds)` で Ollama に接続。
- `client.stream("POST", f"{ollama_url}/api/chat", json=payload)` で `aiter_lines()` を取得し、`StreamingResponse` で透過。
- **キャンセル処理**: 各 yield の前に `await request.is_disconnected()` をチェックし、True なら `httpx` のレスポンスを `aclose()` してループを抜ける。
- **エラー処理**: Ollama への接続失敗は `{"error": "..."}` を 1 行 NDJSON で返してから close。
- **コンテキスト**: 受け取った messages に対して `trim.py::trim_messages` を呼び出して長さを制限してから Ollama に渡す。

#### `GET /api/health`
Ollama に `GET /api/tags` を 5 秒タイムアウトで叩き、`{"ollama_up": bool, "default_model": str, "default_model_pulled": bool}` を返す。

#### `GET /api/models`
Ollama の `GET /api/tags` の結果をフロントが扱いやすい形に整形して返す。
`{"models": [{"name": "qwen2.5:latest", "size": ..., "modified_at": ...}]}`

### trim.py（簡易コンテキストトリミング）
- system メッセージは常に保持。
- 末尾（最新）から順に文字数を加算し、`max_history_chars` を超えたらそこより古いものを切り捨てる。
- トークン単位ではなくチャー単位（MVP では十分、tokenizer 依存を持ち込まない判断）。

---

## 5. Frontend 設計（Remix 3 ベータ）

### 重要な前提
- **Remix 3 は 2026 早期に v1 GA 予定のベータ版**。React 排除、Preact フォーク採用、Fetch API ベース、ビルド最小化。
- scaffold: `npx remix@next new frontend --app-name "local-ai-chat"` で生成。Node ≥ 24.3.0 必須（Volta などで導入）。
- Preact エコシステムを使う必要があるため、当初想定の **react-markdown は使えない**。代替として `marked` + `DOMPurify`（vanilla JS、フレームワーク非依存）を採用。

### 主要ライブラリ

| 用途 | ライブラリ | 注記 |
|---|---|---|
| フレームワーク | Remix 3 (`remix@next`) | Preact フォーク内蔵 |
| IndexedDB | `idb` | whisper-api でも採用 |
| Markdown | `marked` | vanilla JS、ESM、Preact 非依存 |
| サニタイズ | `dompurify` | XSS 対策必須、ESM |
| コードハイライト | （MVP では不採用） | `highlight.js` を試したが CJS 専用で Remix 3 のアセットサーバー（ESM only）で `COMMONJS_NOT_SUPPORTED` エラー。後で必要なら `shiki` などの ESM 互換ライブラリに乗り換え |
| スタイル | vanilla CSS（または CSS Modules） | Tailwind は導入しない（学習コスト・ベータ版の動作不確実） |
| ランタイム | Node ≥ 24.3.0 | Remix 3 ベータの requires-engine。Volta で導入 |

### ストリーム受信（lib/stream.ts）

```ts
export async function* parseNdjson(response: Response, signal: AbortSignal) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) { reader.cancel(); return; }
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
}
```

- 文字化け対策: `TextDecoder({ stream: true })` で UTF-8 マルチバイトの境界を自動処理。
- 停止: `AbortController.signal` を渡し、ボタン押下で `abort()`、フロント側ループで `reader.cancel()`。バックエンドは `is_disconnected()` で検知してから Ollama 接続を閉じる（両側で対応）。

### 永続化（Repository パターン）

ストレージ実装を後から差し替えられるよう、型と実装を分離する。

- `utils/conversation-repository.ts`: `ConversationRepository` インターフェースと `Conversation` / `Message` 型のみ
- `utils/indexeddb-repository.ts`: `idb` を使った具体実装（ファクトリ関数 `createIndexedDbRepository()`）

**IndexedDB スキーマ**:
- DB 名: `local-ai-chat`、version 1
- objectStore `conversations`: key `id`、`{id, title, createdAt, updatedAt, systemPrompt, model}`、index `byUpdatedAt`
- objectStore `messages`: key `id`、`{id, conversationId, role, content, createdAt}`、index `byConversation`
- 削除はトランザクションで会話と関連メッセージを一括削除
- マイグレーション: `idb` の `upgrade(db, oldVersion)` で version 分岐。MVP は version 1 のみ。

**将来の差し替え**: SQLite (WASM もしくはサーバー側 FastAPI 経由) に切り替える場合は `ConversationRepository` を満たす別実装を作って差し替えるだけ。UI 側は触らない。

### Markdown 描画（utils/markdown.ts）

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.use({
  renderer: {
    code(token) {
      const lang = (token.lang ?? '').trim()
      const className = lang ? `language-${lang}` : ''
      return `<pre><code class="${className}">${escapeHtml(token.text)}</code></pre>`
    },
  },
})

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src, { async: false }) as string)
}
```

**innerHTML 挿入の流儀**: Remix 3 の JSX には `dangerouslySetInnerHTML` が無い。内部コンポーネント `MarkdownContent` を作り、`ref` で要素を捕捉して `handle.queueTask` で再 render 後に `el.innerHTML = ...` を実行する（chat-composer.tsx の `MarkdownContent` を参照）。ストリーム中も delta が更新されるたびに毎 render で書き換わる。

---

## 6. 開発フェーズ

| Phase | 内容 | 完了条件 | 工数目安 |
|---|---|---|---|
| 0 | プロジェクト初期化 | `backend/` を `uv init` 風に作り、`frontend/` は `npx remix@next new` で scaffold。両方が空のページ／health ping を返す | 半日 |
| 1 | チャット最短ループ（非ストリーム） | フロントから `POST /api/chat`（messages 1 つ）→ バックエンドが Ollama に渡し全文返却 → 表示 | 半日 |
| 2 | NDJSON ストリーム化 | バックエンドの透過プロキシ + フロントの逐次描画 + 停止ボタン（両側で接続 close 検証） | 半日〜1 日 |
| 3 | 永続化と履歴 | IndexedDB スキーマ、サイドバー、新規チャット／読込／削除 | 1 日 |
| 4 | 仕上げ | システムプロンプト編集 UI、Markdown + sanitize、`/api/models` でモデル切替 UI、コンテキストトリミング | 1 日 |
| Remix 3 学習バッファ | ベータ版のドキュメント不足・API 変更への対応 | 必要に応じて | +0.5〜1 日 |

**合計: 実働 4〜5 日**（whisper-api の知見が活きる backend は早い、Remix 3 が時間ドライバ）。

---

## 7. リスクと対処

| リスク | 対処 |
|---|---|
| **Remix 3 ベータの破壊的変更・ドキュメント不足** | バージョンを `package.json` で固定。詰まったら GitHub Discussions / 公式ブログを参照。最悪、Phase 1 段階で React + Vite に切り替え可能なよう backend は完全分離 |
| Preact エコシステムで欲しいライブラリが見当たらない | フレームワーク非依存（vanilla JS）の `marked` / `dompurify` / `highlight.js` を中心に選定（採用済み） |
| VRAM 競合（whisper-api と同時稼働で OOM） | 両者は同じ Ollama インスタンスを使うので Qwen は二重ロードされない。ただし whisper-api の Whisper モデル（large-v3, GPU 常駐）は別途 VRAM を占有する。同時に重い処理を走らせない運用を README に明記 |
| キャンセル時に Ollama が走り続ける | フロント `AbortController` + バックエンド `request.is_disconnected()` ループ内チェック + `httpx` レスポンス `aclose()` の 2 段で閉じる |
| 文字化け（UTF-8 マルチバイト切断） | フロントの `TextDecoder({ stream: true })` がバイト境界を自動処理。バックエンドは Ollama の NDJSON を行単位で透過するだけなので破断しない |
| 会話が長くなって Ollama がコンテキスト切捨て | バックエンドの `trim.py` で簡易トリミング（`CHAT_MAX_HISTORY_CHARS`）。MVP は文字数ベース、後で tokenizer 化検討 |
| Ollama 起動忘れ | フロント起動時に `/api/health` を叩き、`ollama_up: false` なら案内バナーを表示 |
| Markdown XSS | `DOMPurify.sanitize` を必ず通す（`lib/markdown.ts` の単一経路に限定） |
| ディスク占有（IndexedDB） | MVP は手動削除のみ。将来的にストレージ警告 UI |

---

## 8. 環境変数（backend/.env.example）

| 変数 | 既定値 | 用途 |
|---|---|---|
| `CHAT_OLLAMA_URL` | `http://localhost:11434` | Ollama エンドポイント |
| `CHAT_OLLAMA_MODEL` | `qwen2.5:latest` | 既定モデル |
| `CHAT_OLLAMA_TIMEOUT_SECONDS` | `600` | 1 リクエストの最大時間 |
| `CHAT_NUM_CTX` | `8192` | Ollama に渡す num_ctx |
| `CHAT_MAX_HISTORY_CHARS` | `24000` | トリミング閾値 |
| `CHAT_SYSTEM_PROMPT` | `""` | 初期システムプロンプト |

---

## 9. 起動手順

```powershell
# Ollama 起動確認
ollama list   # qwen2.5:latest があること

# Backend
cd c:\dev\local-ai-chat\backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend（別ターミナル）
cd c:\dev\local-ai-chat\frontend
npm install
npm run dev   # http://localhost:44100
```

---

## 10. 検証方法（end-to-end）

1. **health**: `curl http://localhost:8000/api/health` が `{"ollama_up": true, "default_model_pulled": true}` を返す。
2. **non-stream chat**（Phase 1 完了時）: フロントから「こんにちは」と送信、Qwen が応答する。
3. **stream chat**（Phase 2 完了時）:
   - 長文プロンプト（例: 「日本の歴史を 1000 字で」）で 1 トークンずつ画面更新を目視確認。
   - 出力中に停止ボタン → フロントは即停止、バックエンドのログで Ollama への接続が close されたことを確認。
   - DevTools Network タブで `application/x-ndjson` のチャンク受信を確認。
4. **永続化**（Phase 3 完了時）:
   - 会話を 2 つ作成 → ブラウザリロード → サイドバーに 2 件表示、クリックで復元。
   - 削除 → IndexedDB（DevTools Application タブ）から消えていることを確認。
5. **仕上げ**（Phase 4 完了時）:
   - モデル切替プルダウンに `qwen2.5:latest` が表示。
   - システムプロンプトを「あなたは関西弁で答える」に変更 → 関西弁で応答。
   - 200 メッセージ程度の会話を作って `CHAT_MAX_HISTORY_CHARS` のトリミングが効くことをログで確認。
   - コードブロックを含む応答で `<pre><code class="hljs ...">` がハイライトされ、`<script>` タグを含む入力をしてもサニタイズされることを確認。

---

## 11. 主要ファイル（編集対象）

**Backend**:
- [backend/pyproject.toml](backend/pyproject.toml) — 新規
- [backend/app/main.py](backend/app/main.py) — FastAPI エントリ
- [backend/app/chat.py](backend/app/chat.py) — ストリーミングプロキシ（核）
- [backend/app/config.py](backend/app/config.py) — pydantic-settings
- [backend/app/trim.py](backend/app/trim.py) — コンテキストトリミング

**Frontend**:
- [frontend/app/routes.ts](frontend/app/routes.ts) / [frontend/app/router.ts](frontend/app/router.ts)
- [frontend/app/controllers/chat.tsx](frontend/app/controllers/chat.tsx)
- [frontend/app/ui/chat-page.tsx](frontend/app/ui/chat-page.tsx) — サーバーサイド Layout
- [frontend/app/ui/chat-composer.tsx](frontend/app/ui/chat-composer.tsx) — clientEntry（サイドバー＋チャット）
- [frontend/app/utils/chat-api.ts](frontend/app/utils/chat-api.ts) — NDJSON streamChat（核）
- [frontend/app/utils/conversation-repository.ts](frontend/app/utils/conversation-repository.ts) — Repository 型
- [frontend/app/utils/indexeddb-repository.ts](frontend/app/utils/indexeddb-repository.ts) — IndexedDB 実装
- [frontend/app/utils/markdown.ts](frontend/app/utils/markdown.ts) — marked + DOMPurify（Phase 4 で追加）

---

## 12. 既存資産（whisper-api からの流用ポイント）

- `c:\dev\whisper-api\backend\app\config.py`: pydantic-settings の使い方、`CORS_ORIGINS` の形
- `c:\dev\whisper-api\backend\app\main.py`: `lifespan` + `CORSMiddleware` の組み立て
- `c:\dev\whisper-api\backend\app\summarize.py`: httpx で Ollama を呼ぶ基本形（ただし `stream=False` なので、本プロジェクトでは `AsyncClient` + `stream()` に書き換え）
- `c:\dev\whisper-api\backend\pyproject.toml`: uv + Python 3.12 + FastAPI の依存セット

---

## 13. 将来拡張（参考）

- Whisper を組み込んで「音声でチャット」（whisper-api の資産そのまま流用可）
- RAG: ローカルファイルをベクトル化して検索付きチャット
- ツール呼び出し（Qwen2.5 は function calling 対応）
- PWA 化（Remix 3 で `vite-plugin-pwa` 相当を導入）
- コンテキストトリミングを文字数ベースから tokenizer ベースへ
