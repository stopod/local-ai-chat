# セットアップ手順

local-ai-chat をローカル PC で初めて動かすための手順をまとめる。

## 1. 前提

| 項目 | 必要なもの |
|---|---|
| OS | Windows 11 を想定（macOS / Linux でも動くはずだが未検証） |
| GPU | 任意。Ollama が CUDA を使えれば応答が速くなる |
| ディスク | Qwen2.5:latest で約 4.7 GB、`node_modules` で 200 MB 程度 |

## 2. 必要なツール

| ツール | バージョン | 入れ方 |
|---|---|---|
| [Ollama](https://ollama.com/) | 最新 | 公式インストーラ。Windows ならサインイン時に自動起動 |
| [Volta](https://volta.sh/) | 最新 | `winget install Volta.Volta` |
| Node.js | **>= 24.3.0** | `volta install node@24` |
| [uv](https://docs.astral.sh/uv/) | 最新 | `winget install astral-sh.uv` |
| Python | 3.12 | `uv` が `.python-version` を読んで自動取得 |
| Git | 任意 | バージョン管理用 |

> **注意**: Remix 3 ベータは Node 24 必須。Node 22 では `EBADENGINE` 警告が出て dev server がクラッシュすることがあるため、必ず 24 を入れる。

## 3. Ollama に Qwen2.5 を入れる

```powershell
ollama pull qwen2.5
ollama list  # qwen2.5:latest が表示されることを確認
```

別モデル（gemma3:4b 等）も入れておくと、フロントの「モデル切替」プルダウンから選択できる。

## 4. リポジトリの取得

```powershell
git clone <repository-url> c:\dev\local-ai-chat
cd c:\dev\local-ai-chat
```

> リモートが未設定の場合は、本ディレクトリ自体を起点とする。

## 5. バックエンドのセットアップ

```powershell
cd c:\dev\local-ai-chat\backend
uv sync           # 仮想環境作成、依存インストール
uv run pytest     # 全テストが緑になることを確認（35 件）
```

`.env` をカスタマイズしたい場合は雛形をコピー：

```powershell
copy .env.example .env
# 必要に応じて CHAT_OLLAMA_MODEL や CHAT_NUM_CTX を編集
```

利用可能な環境変数は [backend/.env.example](../backend/.env.example) を参照。

## 6. フロントエンドのセットアップ

```powershell
cd c:\dev\local-ai-chat\frontend
npm install
npm run typecheck  # 型エラーが無いことを確認
```

## 7. 起動

ターミナルを 2 つ開いて、それぞれで以下を実行する。

**バックエンド（ポート 8000）**:
```powershell
cd c:\dev\local-ai-chat\backend
uv run uvicorn app.main:app --port 8000
```

**フロントエンド（ポート 44100）**:
```powershell
cd c:\dev\local-ai-chat\frontend
npm run dev
```

## 8. 動作確認

1. ブラウザで http://localhost:44100/chat を開く
2. ヘッダーに「モデル: qwen2.5:latest」が表示されている
3. メッセージを入力して送信 → トークンが逐次表示される
4. サイドバーに会話タイトルが追加される
5. リロードしても会話履歴が残る

API を直接確認したい場合：
```powershell
# health
curl http://localhost:8000/api/health
# => {"ollama_up":true,"default_model":"qwen2.5:latest","default_model_pulled":true}

# モデル一覧
curl http://localhost:8000/api/models

# チャット（NDJSON ストリーム）
curl -N -X POST http://localhost:8000/api/chat `
  -H "Content-Type: application/json" `
  -d '{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'
```

## 9. 開発時のコマンド

| 何をしたいか | コマンド | 場所 |
|---|---|---|
| バックエンドのテスト | `uv run pytest` | `backend/` |
| バックエンドのテストを 1 ファイル | `uv run pytest tests/test_chat.py -v` | `backend/` |
| フロントの型チェック | `npm run typecheck` | `frontend/` |
| フロントの dev server | `npm run dev` | `frontend/` |
| フロントの本番ビルド | （未整備、tsx 直接実行） | `frontend/` |

## 10. トラブルシューティング

### `ollama_up: false` と返る
- `ollama list` で起動を確認。停止していれば `ollama serve` で起動するか、Ollama を再起動。

### ブラウザで送信ボタンを押しても何も起きない
- DevTools の Console / Network を確認。
- frontend dev server のログ（`npm run dev` 実行中ターミナル）に `AssetServerCompilationError` などが出ていないか確認。
- Backend のログに 5xx が出ていないか確認。

### `EBADENGINE` 警告が出てクラッシュする
- Node 24 が入っているか `node --version` で確認。Volta なら `volta install node@24`。

### `scheduleUpdate not implemented`
- Remix 3 のコンポーネントの setup フェーズで `handle.update()` を呼ぶと出る。`handle.queueTask` を使う。

### asset (`/assets/app/...`) が 404 / 500
- 新規追加した clientEntry や utility は [frontend/app/assets.ts](../frontend/app/assets.ts) の `allow` リストに個別追加が必要。
- 取り込んだライブラリが CommonJS だと `COMMONJS_NOT_SUPPORTED` で全 asset が止まる。ESM 互換のものに置換する。

### VRAM が足りない
- 同 PC の whisper-api を停止する、または Qwen をより小さなモデル（`gemma3:4b` など）に切り替える。

## 11. システムプロンプトのプリセットを追加・編集する

[backend/prompts/](../backend/prompts/) に `*.md` ファイルを置くと、フロントの設定パネルに自動でプルダウン選択肢として現れる。フォーマットは最小限:

```markdown
# 表示名

ここからシステムプロンプト本文。
複数行 OK。
```

- ファイル名（拡張子なし）が内部 ID（例: `kansai-ben.md` → `kansai-ben`）
- 1 行目の `# 見出し` がプルダウンの表示名。無い場合はファイル名がフォールバック
- ファイル名の昇順で並ぶ
- **再起動不要**: バックエンドはリクエスト毎にディレクトリを読み直すので、md を保存したらブラウザの設定パネルを開き直すだけで反映される
- 別ディレクトリに置きたい場合は `.env` で `CHAT_PROMPTS_DIR=...` を指定

サンプルとして `kansai-ben.md` / `code-reviewer.md` / `english-translator.md` の 3 つが同梱されている。

## 12. 関連ドキュメント

- [計画書](qwen-chat-plan.md) — プロジェクトの設計判断・MVP スコープ・代替案
- [CLAUDE.md](../CLAUDE.md) — 開発方針（関数型・TDD・日本語・機能単位 commit）
