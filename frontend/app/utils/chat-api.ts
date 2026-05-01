/** ローカル FastAPI バックエンドが返すチャットメッセージ。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const BACKEND_URL = 'http://localhost:8000'

/** バックエンドの POST /api/chat を呼び、assistant メッセージを 1 件取得する（非ストリーム）。 */
export async function sendChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatMessage> {
  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`チャット API エラー: HTTP ${response.status} ${detail}`)
  }
  return response.json()
}
