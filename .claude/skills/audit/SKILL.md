---
name: audit
description: |
  push 前のセキュリティ・プライバシー監査。リポジトリ全体に対して機密情報の漏洩、
  個人情報、内部ネットワーク情報、外部 URL の意図せぬ混入、egress allowlist の崩れ、
  追跡してはいけないファイルの混入、git author email、既存テストの状態を一括確認する。
  ユーザーが「監査して」「push 前にチェック」「漏れてないか確認」「audit」と言った時、
  または明示的に /audit を呼んだ時に発動する。
disable-model-invocation: false
allowed-tools: Bash(git *) Bash(uv *) Bash(npm *) Grep Glob Read
---

# pre-push 監査スキル

このスキルは local-ai-chat を GitHub にプッシュする前に走らせる前提の監査チェックリスト。1 章ごとに実行・判定し、最後に総合レポートを出す。

## 出力ルール

- 各項目について **✅ OK** / **⚠ 注意（要判断）** / **❌ NG** のいずれかを明示
- 注意・NG があれば、**該当ファイル・行・対処方針** を具体的に書く
- すべてのチェックが終わったら、最後に「push して OK か」を 1 行で結論

## 1. 機密情報パターン

リポジトリ全体を `Grep` で以下のパターンを探索する。

- 強い決定打: `(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xoxb-|xoxp-)`
- 秘密鍵: `(BEGIN RSA|BEGIN PRIVATE|BEGIN OPENSSH)`
- 弱いシグナル（要文脈判定）: `(password|secret|api[_-]?key|access[_-]?token|bearer|client[_-]?secret)`（case insensitive）

ヒットがある場合は **必ず文脈を確認**する。Remix scaffold の `frontend/.agents/skills/remix/references/auth-and-sessions.md` 等は **サンプルコード** なので無視してよいが、`backend/` や `frontend/app/` 配下にヒットがあれば実値の混入を疑う。

## 2. PII（個人特定情報）

- メールアドレス: `(@gmail|@icloud|@outlook|@yahoo|@hotmail|@japan-systems)`（case insensitive）
- ローカル絶対パス: `(C:\\\\Users|C:/Users|/Users/)` — `docs/setup.md` の例示文中の `C:\dev\local-ai-chat` は OK だが、ユーザー名（例: `stopo`）が含まれているなら ⚠
- 既知のユーザー名: `git config user.name` の出力をリポジトリ全体で grep し、ドキュメントやコードに紛れていないか確認

## 3. 内部ネットワーク

- プライベート IP: `(192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.)`
- 内部ホスト名: `\.local|\.internal|\.corp` （正規表現）

`package-lock.json` 内の `node@>=10.12.0` のようなバージョン番号にヒットしうるので、**ホスト/IP として解釈できるか** で判定する。

## 4. 外部 URL の意図せぬ混入

このアプリは「外部に出ない」ことを設計の核としている。それが守れているか確認する。

- backend で `httpx` を使う箇所をすべて検出（`Grep "httpx" type=py`）。各 URL が `settings.ollama_url` 由来になっているかチェック。直書きされた `http://...`（localhost / 127.0.0.1 以外）があれば ⚠
- frontend で `fetch(` を使う箇所をすべて検出（`Grep "fetch\\(" type=ts`）。すべて `BACKEND_URL`（`http://localhost:8000`）由来になっているか
- それ以外で `https?://` リテラルを `Grep` し、ドキュメント・依存ライブラリ参照以外で外部 URL が出てこないこと

## 5. egress allowlist の状態

`backend/app/egress.py` の `WhitelistTransport`、`backend/app/main.py` の `_allowed_egress_hosts`、`backend/app/config.py` の `egress_allowlist` を `Read` で確認:

- `egress_allowlist` のデフォルトは空配列のまま
- `_allowed_egress_hosts` が `settings.ollama_url` のホストを自動許可しているだけ（追加で外部ホストを足していない）
- `WhitelistTransport` のロジックが書き換えられていない

## 6. .gitignore と追跡漏れ

`Bash(git ls-files)` で全追跡ファイルを取得し、以下が含まれていないことを確認:

- `.env`（`.env.example` は OK）
- `.venv/` 配下
- `node_modules/` 配下
- `__pycache__/`、`.pytest_cache/`、`.mypy_cache/`
- `*.log`

`git status` で未追跡ファイルも確認し、意図しない一時ファイルが残っていないか見る。

## 7. 大きいバイナリ

`Bash(git ls-files -z | xargs -0 -I {} ls -la "{}" 2>/dev/null | awk '$5 > 1048576 {print $5, $9}')` 相当で 1MB 超のファイルを検出。`package-lock.json`（〜110KB）と `uv.lock`（〜100KB）程度は OK。GB 級が出たら ❌。

## 8. git author email

`Bash(git log --format='%ae' | sort -u)` で全コミットの author email を取得。

- すべて `noreply` ドメイン（`*@users.noreply.github.com` か `noreply@anthropic.com`）になっているか
- 個人の本物のメアドが残っていれば ⚠（公開時にバレる）

## 9. 既存テストとビルドの確認

- `Bash(cd backend && uv run pytest -q)` で全テスト緑（現状 49 件想定）
- `Bash(cd frontend && npm run typecheck)` で型エラーなし

テストが赤い、または型エラーがある状態で push するのは ❌。

## 10. 総合レポート

各項目をテーブルでまとめ、最後に以下のいずれかを述べる:

- **✅ push して問題なし** — すべての項目で OK
- **⚠ 確認のうえ判断** — 注意項目があるが、コンテキスト次第（具体的な懸念点を列挙）
- **❌ push 前に修正が必要** — NG 項目あり（修正コマンドの例も提示）
