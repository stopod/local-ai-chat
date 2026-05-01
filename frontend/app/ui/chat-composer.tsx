import { clientEntry, css, on, ref, type Handle, type SerializableProps } from 'remix/ui'

import { streamChat, type ChatMessage } from '../utils/chat-api.ts'

interface ChatComposerProps extends SerializableProps {}

export const ChatComposer = clientEntry(
  '/assets/app/ui/chat-composer.tsx#ChatComposer',
  function ChatComposer(handle: Handle<ChatComposerProps>) {
    let messages: ChatMessage[] = []
    let isLoading = false
    let errorMessage: string | null = null
    let textareaEl: HTMLTextAreaElement | null = null
    let abortController: AbortController | null = null

    async function submit() {
      const text = (textareaEl?.value ?? '').trim()
      if (!text || isLoading) return
      const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
      messages = [...history, { role: 'assistant', content: '' }]
      if (textareaEl) textareaEl.value = ''
      isLoading = true
      errorMessage = null
      abortController = new AbortController()
      await handle.update()

      try {
        for await (const event of streamChat(history, abortController.signal)) {
          if (event.error) {
            errorMessage = event.error
            // 空の assistant プレースホルダを取り除く
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
          // ユーザーが停止ボタンを押した。空のままなら除去、内容があればそのまま残す
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
        await handle.update()
        textareaEl?.focus()
      }
    }

    function cancel() {
      abortController?.abort()
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
