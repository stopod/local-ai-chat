import { clientEntry, css, on, ref, type Handle, type SerializableProps } from 'remix/ui'

import { streamChat, type ChatMessage } from '../utils/chat-api.ts'
import type { Conversation, ConversationRepository } from '../utils/conversation-repository.ts'
import { createIndexedDbRepository } from '../utils/indexeddb-repository.ts'

interface ChatComposerProps extends SerializableProps {}

const DEFAULT_MODEL = 'qwen2.5:latest'

export const ChatComposer = clientEntry(
  '/assets/app/ui/chat-composer.tsx#ChatComposer',
  function ChatComposer(handle: Handle<ChatComposerProps>) {
    const repository: ConversationRepository = createIndexedDbRepository()

    let conversations: Conversation[] = []
    let currentConversationId: string | null = null
    let messages: ChatMessage[] = []
    let isLoading = false
    let errorMessage: string | null = null
    let textareaEl: HTMLTextAreaElement | null = null
    let abortController: AbortController | null = null

    // 初回 render の後に会話一覧をロードする（setup 中は handle.update() を呼べない）
    handle.queueTask(async (signal) => {
      try {
        const list = await repository.listConversations()
        if (signal.aborted) return
        conversations = list
      } catch (err) {
        if (signal.aborted) return
        errorMessage = `履歴の読み込みに失敗: ${err instanceof Error ? err.message : String(err)}`
      }
      await handle.update()
    })

    function startNewConversation() {
      if (isLoading) return
      currentConversationId = null
      messages = []
      errorMessage = null
      void handle.update()
      textareaEl?.focus()
    }

    async function selectConversation(id: string) {
      if (isLoading) return
      currentConversationId = id
      errorMessage = null
      try {
        const stored = await repository.listMessages(id)
        messages = stored.map((m) => ({ role: m.role, content: m.content }))
      } catch (err) {
        errorMessage = `履歴の読み込みに失敗: ${err instanceof Error ? err.message : String(err)}`
        messages = []
      }
      await handle.update()
    }

    async function deleteConversation(id: string) {
      if (isLoading) return
      try {
        await repository.deleteConversation(id)
        conversations = conversations.filter((c) => c.id !== id)
        if (currentConversationId === id) {
          currentConversationId = null
          messages = []
        }
      } catch (err) {
        errorMessage = `削除に失敗: ${err instanceof Error ? err.message : String(err)}`
      }
      await handle.update()
    }

    async function ensureConversation(firstUserText: string): Promise<string> {
      if (currentConversationId) return currentConversationId
      const title = firstUserText.slice(0, 30) || '新しいチャット'
      const created = await repository.createConversation({
        title,
        systemPrompt: '',
        model: DEFAULT_MODEL,
      })
      conversations = [created, ...conversations]
      currentConversationId = created.id
      return created.id
    }

    async function submit() {
      const text = (textareaEl?.value ?? '').trim()
      if (!text || isLoading) return

      const conversationId = await ensureConversation(text)

      const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
      messages = [...history, { role: 'assistant', content: '' }]
      if (textareaEl) textareaEl.value = ''
      isLoading = true
      errorMessage = null
      abortController = new AbortController()
      await handle.update()

      // user メッセージは即時保存
      try {
        await repository.appendMessage({ conversationId, role: 'user', content: text })
      } catch (err) {
        errorMessage = `保存に失敗: ${err instanceof Error ? err.message : String(err)}`
      }

      let aborted = false
      try {
        for await (const event of streamChat(history, abortController.signal)) {
          if (event.error) {
            errorMessage = event.error
            messages = history
            break
          }
          if (event.delta) {
            const last = messages[messages.length - 1]
            messages[messages.length - 1] = {
              ...last,
              content: last.content + event.delta,
            }
            await handle.update()
          }
          if (event.done) break
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          aborted = true
          const last = messages[messages.length - 1]
          if (last.role === 'assistant' && last.content === '') {
            messages = history
          }
        } else {
          errorMessage = err instanceof Error ? err.message : String(err)
          messages = history
        }
      } finally {
        isLoading = false
        abortController = null
      }

      // assistant 応答を保存（中身があれば、停止/エラーでも途中まで残す）
      const finalAssistant = messages[messages.length - 1]
      if (finalAssistant?.role === 'assistant' && finalAssistant.content) {
        try {
          await repository.appendMessage({
            conversationId,
            role: 'assistant',
            content: finalAssistant.content,
          })
        } catch (err) {
          errorMessage = `保存に失敗: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      // 会話一覧の updatedAt を反映するため再読込
      try {
        conversations = await repository.listConversations()
      } catch {
        // 失敗しても致命的ではないので無視
      }

      await handle.update()
      if (!aborted) textareaEl?.focus()
    }

    function cancel() {
      abortController?.abort()
    }

    return () => (
      <div mix={shellStyle}>
        <aside mix={sidebarStyle}>
          <button
            type="button"
            disabled={isLoading}
            mix={[newButtonStyle, on('click', () => startNewConversation())]}
          >
            ＋ 新しいチャット
          </button>
          <ul mix={listStyle}>
            {conversations.length === 0 ? (
              <li mix={emptyHintStyle}>履歴はまだありません</li>
            ) : (
              conversations.map((c) => {
                const active = c.id === currentConversationId
                return (
                  <li key={c.id} mix={active ? activeItemStyle : itemStyle}>
                    <button
                      type="button"
                      mix={[
                        itemTitleStyle,
                        on('click', () => void selectConversation(c.id)),
                      ]}
                      title={c.title}
                    >
                      {c.title || '(無題)'}
                    </button>
                    <button
                      type="button"
                      title="削除"
                      mix={[
                        deleteButtonStyle,
                        on('click', (event) => {
                          event.stopPropagation()
                          if (confirm(`「${c.title}」を削除しますか？`)) {
                            void deleteConversation(c.id)
                          }
                        }),
                      ]}
                    >
                      ✕
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </aside>

        <section mix={mainStyle}>
          <div mix={messagesStyle}>
            {messages.length === 0 ? (
              <p mix={hintStyle}>メッセージを入力してください。</p>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  mix={msg.role === 'user' ? userBubbleStyle : assistantBubbleStyle}
                >
                  <strong>{msg.role === 'user' ? 'あなた' : 'Qwen'}: </strong>
                  <span mix={contentStyle}>
                    {msg.content}
                    {isLoading && idx === messages.length - 1 && msg.role === 'assistant' ? (
                      <span mix={cursorStyle}>▍</span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
            {errorMessage && <p mix={errorStyle}>{errorMessage}</p>}
          </div>
          <div mix={composerStyle}>
            <textarea
              placeholder="メッセージを入力 (Ctrl+Enter で送信)"
              disabled={isLoading}
              mix={[
                textareaStyle,
                ref((node) => {
                  textareaEl = node as HTMLTextAreaElement
                }),
                on('keydown', (event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    void submit()
                  }
                }),
              ]}
            />
            <button
              type="button"
              mix={[
                buttonStyle,
                on('click', () => {
                  if (isLoading) cancel()
                  else void submit()
                }),
              ]}
            >
              {isLoading ? '停止' : '送信'}
            </button>
          </div>
        </section>
      </div>
    )
  },
)

const shellStyle = css({
  display: 'flex',
  height: 'calc(100vh - 80px)',
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '16px',
  gap: '16px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
})

const sidebarStyle = css({
  width: '240px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  borderRight: '1px solid #ddd',
  paddingRight: '12px',
})

const newButtonStyle = css({
  padding: '10px 12px',
  background: '#2196f3',
  color: 'white',
  border: 0,
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  '&:disabled': { background: '#aaa', cursor: 'not-allowed' },
})

const listStyle = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
})

const emptyHintStyle = css({
  color: '#888',
  fontSize: '13px',
  padding: '8px',
})

const itemStyle = css({
  display: 'flex',
  alignItems: 'center',
  borderRadius: '6px',
  '&:hover': { background: '#f0f0f0' },
})

const activeItemStyle = css({
  display: 'flex',
  alignItems: 'center',
  borderRadius: '6px',
  background: '#e3f2fd',
})

const itemTitleStyle = css({
  flex: 1,
  textAlign: 'left',
  background: 'transparent',
  border: 0,
  padding: '8px 10px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'inherit',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const deleteButtonStyle = css({
  padding: '4px 8px',
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  color: '#999',
  fontSize: '14px',
  borderRadius: '4px',
  '&:hover': { color: '#c00', background: '#fee' },
})

const mainStyle = css({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
})

const messagesStyle = css({
  flex: 1,
  overflowY: 'auto',
  padding: '12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  background: '#fafafa',
})

const userBubbleStyle = css({
  marginBottom: '12px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: '#e3f2fd',
})

const assistantBubbleStyle = css({
  marginBottom: '12px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: '#f0f0f0',
})

const contentStyle = css({
  whiteSpace: 'pre-wrap',
})

const cursorStyle = css({
  display: 'inline-block',
  marginLeft: '2px',
  color: '#666',
  animation: 'rmx-cursor-blink 1s steps(2) infinite',
  '@keyframes rmx-cursor-blink': {
    '50%': { opacity: 0 },
  },
})

const hintStyle = css({
  color: '#888',
  margin: 0,
})

const errorStyle = css({
  color: '#c00',
  margin: 0,
})

const composerStyle = css({
  display: 'flex',
  gap: '8px',
})

const textareaStyle = css({
  flex: 1,
  minHeight: '80px',
  padding: '8px',
  fontFamily: 'inherit',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  resize: 'vertical',
})

const buttonStyle = css({
  padding: '0 24px',
  background: '#2196f3',
  color: 'white',
  border: 0,
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  '&:disabled': {
    background: '#aaa',
    cursor: 'not-allowed',
  },
})
