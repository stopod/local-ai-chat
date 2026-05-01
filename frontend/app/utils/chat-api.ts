/** ローカル FastAPI バックエンドが返すチャットメッセージ。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** ストリームから 1 行ずつ届くイベント。 */
export interface ChatStreamEvent {
  /** assistant が出した追加のトークン文字列（空のこともある） */
  delta: string
  /** 最終行に true */
  done: boolean
  /** Ollama 側でエラーが発生した場合のメッセージ */
  error?: string
}

const BACKEND_URL = 'http://localhost:8000'

export interface StreamChatOptions {
  model?: string
}

export interface ModelInfo {
  name: string
  size?: number
  modified_at?: string
}

/**
 * バックエンドの POST /api/chat を呼び、NDJSON を 1 行ずつ ChatStreamEvent として yield する。
 *
 * - signal で AbortController による途中停止に対応
 * - TextDecoder({ stream: true }) で UTF-8 マルチバイト境界を安全に処理
 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
  options?: StreamChatOptions,
): AsyncGenerator<ChatStreamEvent> {
  const body: { messages: ChatMessage[]; model?: string } = { messages }
  if (options?.model) body.model = options.model
  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`チャット API エラー: HTTP ${response.status} ${detail}`)
  }
  if (!response.body) {
    throw new Error('レスポンスボディが空です')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line) yield parseLine(line)
        nl = buffer.indexOf('\n')
      }
    }
    const tail = buffer.trim()
    if (tail) yield parseLine(tail)
  } finally {
    reader.cancel().catch(() => {})
  }
}

function parseLine(line: string): ChatStreamEvent {
  const obj = JSON.parse(line) as {
    message?: { content?: string }
    done?: boolean
    error?: string
  }
  return {
    delta: obj.message?.content ?? '',
    done: obj.done ?? false,
    error: obj.error,
  }
}

/** Ollama にインストール済みのモデル一覧を返す。失敗時は空配列。 */
export async function getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/models`, { signal })
    if (!response.ok) return []
    const data = (await response.json()) as { models?: ModelInfo[] }
    return data.models ?? []
  } catch {
    return []
  }
}
