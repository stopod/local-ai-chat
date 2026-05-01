import { clientEntry, css, on, ref, type Handle, type SerializableProps } from 'remix/ui'

import { sendChat, type ChatMessage } from '../utils/chat-api.ts'

interface ChatComposerProps extends SerializableProps {}

export const ChatComposer = clientEntry(
  '/assets/app/ui/chat-composer.tsx#ChatComposer',
  function ChatComposer(handle: Handle<ChatComposerProps>) {
    let messages: ChatMessage[] = []
    let isLoading = false
    let errorMessage: string | null = null
    let textareaEl: HTMLTextAreaElement | null = null

    async function submit() {
      const text = (textareaEl?.value ?? '').trim()
      if (!text || isLoading) return
      messages = [...messages, { role: 'user', content: text }]
      if (textareaEl) textareaEl.value = ''
      isLoading = true
      errorMessage = null
      await handle.update()
      try {
        const reply = await sendChat(messages)
        messages = [...messages, reply]
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
      } finally {
        isLoading = false
        await handle.update()
        textareaEl?.focus()
      }
    }

    return () => (
      <div mix={containerStyle}>
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
                <span mix={contentStyle}>{msg.content}</span>
              </div>
            ))
          )}
          {isLoading && <p mix={hintStyle}>送信中…</p>}
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
            disabled={isLoading}
            mix={[buttonStyle, on('click', () => void submit())]}
          >
            {isLoading ? '送信中…' : '送信'}
          </button>
        </div>
      </div>
    )
  },
)

const containerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(100vh - 80px)',
  maxWidth: '900px',
  margin: '0 auto',
  padding: '16px',
  gap: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
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
