/**
 * `ConversationRepository` の IndexedDB 実装。
 *
 * - DB 名と version を引数で受け取る純粋なファクトリ関数として提供する
 * - スキーマ変更が必要になったら version を上げて upgrade 内で分岐する
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type {
  Conversation,
  ConversationRepository,
  Message,
  NewConversation,
  NewMessage,
} from './conversation-repository.ts'

interface Schema extends DBSchema {
  conversations: {
    key: string
    value: Conversation
    indexes: { byUpdatedAt: number }
  }
  messages: {
    key: string
    value: Message
    indexes: { byConversation: string }
  }
}

const DEFAULT_DB_NAME = 'local-ai-chat'
const DEFAULT_DB_VERSION = 1

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createIndexedDbRepository(
  dbName: string = DEFAULT_DB_NAME,
  version: number = DEFAULT_DB_VERSION,
): ConversationRepository {
  let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

  function getDb(): Promise<IDBPDatabase<Schema>> {
    if (!dbPromise) {
      dbPromise = openDB<Schema>(dbName, version, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            const conversations = db.createObjectStore('conversations', { keyPath: 'id' })
            conversations.createIndex('byUpdatedAt', 'updatedAt')
            const messages = db.createObjectStore('messages', { keyPath: 'id' })
            messages.createIndex('byConversation', 'conversationId')
          }
        },
      })
    }
    return dbPromise
  }

  return {
    async listConversations() {
      const db = await getDb()
      const all = await db.getAllFromIndex('conversations', 'byUpdatedAt')
      return all.reverse()
    },

    async getConversation(id) {
      const db = await getDb()
      return (await db.get('conversations', id)) ?? null
    },

    async createConversation(input) {
      const now = Date.now()
      const conversation: Conversation = {
        ...input,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      }
      const db = await getDb()
      await db.put('conversations', conversation)
      return conversation
    },

    async updateConversation(id, patch) {
      const db = await getDb()
      const tx = db.transaction('conversations', 'readwrite')
      const current = await tx.store.get(id)
      if (!current) {
        await tx.done
        return
      }
      await tx.store.put({ ...current, ...patch, updatedAt: Date.now() })
      await tx.done
    },

    async deleteConversation(id) {
      const db = await getDb()
      const tx = db.transaction(['conversations', 'messages'], 'readwrite')
      await tx.objectStore('conversations').delete(id)
      const messageKeys = await tx
        .objectStore('messages')
        .index('byConversation')
        .getAllKeys(id)
      for (const key of messageKeys) {
        await tx.objectStore('messages').delete(key)
      }
      await tx.done
    },

    async listMessages(conversationId) {
      const db = await getDb()
      const list = await db.getAllFromIndex('messages', 'byConversation', conversationId)
      return list.sort((a, b) => a.createdAt - b.createdAt)
    },

    async appendMessage(input) {
      const message: Message = {
        ...input,
        id: generateId(),
        createdAt: Date.now(),
      }
      const db = await getDb()
      const tx = db.transaction(['messages', 'conversations'], 'readwrite')
      await tx.objectStore('messages').put(message)
      const conversation = await tx.objectStore('conversations').get(input.conversationId)
      if (conversation) {
        await tx
          .objectStore('conversations')
          .put({ ...conversation, updatedAt: message.createdAt })
      }
      await tx.done
      return message
    },
  }
}
