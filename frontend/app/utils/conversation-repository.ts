/**
 * 会話履歴の永続化を抽象化するリポジトリの「型」だけを定義する。
 *
 * 実装は `indexeddb-repository.ts` などの adapter ファイルに置く。
 * 将来 SQLite (WASM もしくはサーバー側) に差し替える場合は、この
 * インターフェースを満たす別実装を追加するだけで UI 側のコードは触らずに済む。
 */
import type { ChatMessage } from './chat-api.ts'

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  systemPrompt: string
  model: string
}

export interface Message {
  id: string
  conversationId: string
  role: ChatMessage['role']
  content: string
  createdAt: number
}

export type NewConversation = Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>
export type NewMessage = Omit<Message, 'id' | 'createdAt'>

export interface ConversationRepository {
  /** 会話一覧を新しい順で返す。 */
  listConversations(): Promise<Conversation[]>
  getConversation(id: string): Promise<Conversation | null>
  createConversation(input: NewConversation): Promise<Conversation>
  updateConversation(id: string, patch: Partial<NewConversation>): Promise<void>
  deleteConversation(id: string): Promise<void>

  /** 指定会話のメッセージを古い順で返す。 */
  listMessages(conversationId: string): Promise<Message[]>
  appendMessage(input: NewMessage): Promise<Message>
}
