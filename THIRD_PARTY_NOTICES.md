# Third-Party Notices

local-ai-chat は以下の OSS と公開モデルの上に成り立っています。各依存の著作権はそれぞれの権利者に帰属し、リポジトリでの利用は各ライセンスの条件に従います。

## バックエンド依存（Python）

| パッケージ | ライセンス | 公式 |
|---|---|---|
| FastAPI | MIT | https://fastapi.tiangolo.com/ |
| Pydantic / pydantic-settings | MIT | https://docs.pydantic.dev/ |
| httpx | BSD-3-Clause | https://www.python-httpx.org/ |
| uvicorn | BSD-3-Clause | https://www.uvicorn.org/ |
| pytest | MIT | https://docs.pytest.org/ |
| pytest-asyncio | Apache-2.0 | https://github.com/pytest-dev/pytest-asyncio |

完全な依存ツリーは [backend/uv.lock](backend/uv.lock) を参照。`cd backend && uv pip list` でも一覧取得可能。

## フロントエンド依存（Node.js）

| パッケージ | ライセンス | 公式 |
|---|---|---|
| Remix 3 (`remix`, `@remix-run/*`) | MIT | https://remix.run/ |
| TypeScript | Apache-2.0 | https://www.typescriptlang.org/ |
| tsx | MIT | https://tsx.is/ |
| idb | ISC | https://github.com/jakearchibald/idb |
| marked | MIT | https://marked.js.org/ |
| DOMPurify | MPL-2.0 OR Apache-2.0（デュアル） | https://github.com/cure53/DOMPurify |

完全な依存ツリーは [frontend/package-lock.json](frontend/package-lock.json) を参照。`cd frontend && npm list --all` でも一覧取得可能。

## scaffold 由来の同梱ファイル

以下のファイルは `npx remix@next new` が生成した Remix 3 のテンプレート / AI エージェント向け公式ガイドです。著作権は Remix 開発元（Shopify Inc.）に帰属し、Remix 3 自体が MIT でリリースされているため MIT 互換で再配布されています。

```
frontend/AGENTS.md
frontend/.agents/skills/remix/SKILL.md
frontend/.agents/skills/remix/references/*.md
frontend/app/ui/document.tsx
frontend/app/ui/layout.tsx          (ナビを削除する小さな改変あり)
frontend/app/utils/render.tsx
frontend/app/assets/entry.ts
frontend/app/assets.ts（雛形、allow リストを編集）
frontend/server.ts
frontend/tsconfig.json（雛形）
```

scaffold が生成した `controllers/auth.tsx` / `ui/scaffold-home-page.tsx` / `ui/prompt-button.tsx` は本アプリでは使わないため削除しています。`controllers/home.tsx` は `/chat` へのリダイレクトに書き換えており、実質オリジナル扱いです（下記「自分で書いたコード」に含む）。

## LLM ランタイムとモデル（リポジトリには含まれない）

実行時にユーザーが各自で取得する必要があります。

| 名称 | ライセンス | 備考 |
|---|---|---|
| [Ollama](https://ollama.com/) | MIT | ランタイム本体（別途インストール） |
| [Qwen2.5](https://github.com/QwenLM/Qwen2.5) by Alibaba Cloud | サイズによって異なる（7B など多くは Apache 2.0、72B は Qwen License） | モデルサイズや時期によりライセンスが異なる可能性。利用前に Qwen 公式リポジトリで最新のライセンスを確認してください |

## 自分で書いたコード

以下は本リポジトリのために新規作成された著作物で、[LICENSE](LICENSE)（MIT）に従います。

```
backend/app/main.py / chat.py / health.py / trim.py / config.py / schemas.py / egress.py / prompts.py
backend/prompts/*.md
backend/tests/*.py
frontend/app/controllers/chat.tsx
frontend/app/controllers/home.tsx (`/` から `/chat` へのリダイレクト)
frontend/app/ui/chat-page.tsx / chat-composer.tsx
frontend/app/utils/chat-api.ts
frontend/app/utils/conversation-repository.ts
frontend/app/utils/indexeddb-repository.ts
frontend/app/utils/markdown.ts
README.md / docs/qwen-chat-plan.md / docs/setup.md / CLAUDE.md / .gitignore
```
