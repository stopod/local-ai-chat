import {
  clientEntry,
  css,
  on,
  ref,
  type Handle,
  type SerializableProps,
} from 'remix/ui'

import {
  getModels,
  getPrompts,
  streamChat,
  type ChatMessage,
  type ModelInfo,
  type PromptPreset,
} from '../utils/chat-api.ts'
import type { Conversation, ConversationRepository } from '../utils/conversation-repository.ts'
import { createIndexedDbRepository } from '../utils/indexeddb-repository.ts'
import { renderMarkdown } from '../utils/markdown.ts'

interface ChatComposerProps extends SerializableProps {}

const DEFAULT_MODEL = 'qwen2.5:latest'

export const ChatComposer = clientEntry(
  '/assets/app/ui/chat-composer.tsx#ChatComposer',
  function ChatComposer(handle: Handle<ChatComposerProps>) {
    const repository: ConversationRepository = createIndexedDbRepository()

    let conversations: Conversation[] = []
    let availableModels: ModelInfo[] = []
    let availablePrompts: PromptPreset[] = []
    let currentConversationId: string | null = null
    let messages: ChatMessage[] = []
    let isLoading = false
    let errorMessage: string | null = null
    let textareaEl: HTMLTextAreaElement | null = null
    let settingsTextareaEl: HTMLTextAreaElement | null = null
    let abortController: AbortController | null = null

    // 新規会話用の保留設定。会話を切り替えるたびに会話側へ移し替える
    let pendingSystemPrompt = ''
    let pendingModel = DEFAULT_MODEL

    // 設定パネル
    let settingsOpen = false
    let settingsDraft = ''
    /** プルダウンで選択中のプリセット ID。textarea を手で編集すると空になる */
    let selectedPresetId = ''

    // 初回 render の後に一覧をロード
    handle.queueTask(async (signal) => {
      try {
        const [convs, models, presets] = await Promise.all([
          repository.listConversations(),
          getModels(signal),
          getPrompts(signal),
        ])
        if (signal.aborted) return
        conversations = convs
        availableModels = models
        availablePrompts = presets
        if (models.length > 0 && !models.find((m) => m.name === pendingModel)) {
          pendingModel = models[0].name
        }
      } catch (err) {
        if (signal.aborted) return
        errorMessage = `初期化に失敗: ${err instanceof Error ? err.message : String(err)}`
      }
      await handle.update()
    })

    function getCurrentConversation(): Conversation | null {
      if (!currentConversationId) return null
      return conversations.find((c) => c.id === currentConversationId) ?? null
    }

    function getCurrentSystemPrompt(): string {
      return getCurrentConversation()?.systemPrompt ?? pendingSystemPrompt
    }

    function getCurrentModel(): string {
      return getCurrentConversation()?.model ?? pendingModel
    }

    function startNewConversation() {
      if (isLoading) return
      currentConversationId = null
      messages = []
      errorMessage = null
      settingsOpen = false
      void handle.update()
      textareaEl?.focus()
    }

    async function selectConversation(id: string) {
      if (isLoading) return
      currentConversationId = id
      errorMessage = null
      settingsOpen = false
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

    async function changeModel(newModel: string) {
      const conv = getCurrentConversation()
      if (conv) {
        try {
          await repository.updateConversation(conv.id, { model: newModel })
          conversations = conversations.map((c) =>
            c.id === conv.id ? { ...c, model: newModel } : c,
          )
        } catch (err) {
          errorMessage = `モデルの保存に失敗: ${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        pendingModel = newModel
      }
      await handle.update()
    }

    function openSettings() {
      settingsDraft = getCurrentSystemPrompt()
      // 現在のプロンプトと完全一致するプリセットがあれば、そのプルダウンを選択中にする
      const match = availablePrompts.find((p) => p.content === settingsDraft)
      selectedPresetId = match?.id ?? ''
      settingsOpen = true
      void handle.update()
    }

    function cancelSettings() {
      settingsOpen = false
      selectedPresetId = ''
      void handle.update()
    }

    function applyPreset(presetId: string) {
      if (!presetId) {
        selectedPresetId = ''
        settingsDraft = ''
        if (settingsTextareaEl) settingsTextareaEl.value = ''
        void handle.update()
        return
      }
      const preset = availablePrompts.find((p) => p.id === presetId)
      if (!preset) return
      selectedPresetId = presetId
      settingsDraft = preset.content
      if (settingsTextareaEl) settingsTextareaEl.value = preset.content
      void handle.update()
    }

    async function saveSettings() {
      const value = settingsDraft
      const conv = getCurrentConversation()
      if (conv) {
        try {
          await repository.updateConversation(conv.id, { systemPrompt: value })
          conversations = conversations.map((c) =>
            c.id === conv.id ? { ...c, systemPrompt: value } : c,
          )
        } catch (err) {
          errorMessage = `保存に失敗: ${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        pendingSystemPrompt = value
      }
      settingsOpen = false
      await handle.update()
    }

    async function ensureConversation(firstUserText: string): Promise<string> {
      if (currentConversationId) return currentConversationId
      const title = firstUserText.slice(0, 30) || '新しいチャット'
      const created = await repository.createConversation({
        title,
        systemPrompt: pendingSystemPrompt,
        model: pendingModel,
      })
      conversations = [created, ...conversations]
      currentConversationId = created.id
      return created.id
    }

    async function submit() {
      const text = (textareaEl?.value ?? '').trim()
      if (!text || isLoading) return

      const conversationId = await ensureConversation(text)
      const conversation = conversations.find((c) => c.id === conversationId)

      const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
      messages = [...history, { role: 'assistant', content: '' }]
      if (textareaEl) textareaEl.value = ''
      isLoading = true
      errorMessage = null
      abortController = new AbortController()
      await handle.update()

      try {
        await repository.appendMessage({ conversationId, role: 'user', content: text })
      } catch (err) {
        errorMessage = `保存に失敗: ${err instanceof Error ? err.message : String(err)}`
      }

      // Ollama に渡すメッセージ列を組み立て（system はここで先頭に挿入）
      const ollamaMessages: ChatMessage[] = []
      const systemPrompt = conversation?.systemPrompt ?? ''
      if (systemPrompt) {
        ollamaMessages.push({ role: 'system', content: systemPrompt })
      }
      ollamaMessages.push(...history)

      let aborted = false
      try {
        for await (const event of streamChat(ollamaMessages, abortController.signal, {
          model: conversation?.model ?? pendingModel,
        })) {
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

      try {
        conversations = await repository.listConversations()
      } catch {
        // 致命的ではないので無視
      }

      await handle.update()
      if (!aborted) textareaEl?.focus()
    }

    function cancel() {
      abortController?.abort()
    }

    return () => {
      const currentModel = getCurrentModel()
      const currentSystemPrompt = getCurrentSystemPrompt()
      // available models に現在値が無い場合（オフライン等）も選択肢として残す
      const modelOptions = availableModels.find((m) => m.name === currentModel)
        ? availableModels
        : [{ name: currentModel } as ModelInfo, ...availableModels]

      return (
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
            <header mix={headerStyle}>
              <label mix={modelLabelStyle}>
                モデル:
                <select
                  disabled={isLoading}
                  mix={[
                    modelSelectStyle,
                    on('change', (event) => {
                      const value = (event.currentTarget as HTMLSelectElement).value
                      void changeModel(value)
                    }),
                  ]}
                >
                  {modelOptions.map((m) => (
                    <option key={m.name} value={m.name} selected={m.name === currentModel}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={isLoading}
                title="システムプロンプトを編集"
                mix={[
                  iconButtonStyle,
                  on('click', () => (settingsOpen ? cancelSettings() : openSettings())),
                ]}
              >
                ⚙ {currentSystemPrompt ? '設定（あり）' : '設定'}
              </button>
            </header>

            {settingsOpen && (
              <div mix={settingsPanelStyle}>
                {availablePrompts.length > 0 && (
                  <label mix={settingsLabelStyle}>
                    プリセット:
                    <select
                      mix={[
                        presetSelectStyle,
                        on('change', (event) => {
                          applyPreset((event.currentTarget as HTMLSelectElement).value)
                        }),
                      ]}
                    >
                      <option value="" selected={selectedPresetId === ''}>
                        （選択してください / カスタム）
                      </option>
                      {availablePrompts.map((p) => (
                        <option key={p.id} value={p.id} selected={p.id === selectedPresetId}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label mix={settingsLabelStyle}>システムプロンプト</label>
                <textarea
                  mix={[
                    settingsTextareaStyle,
                    ref((node) => {
                      const el = node as HTMLTextAreaElement
                      settingsTextareaEl = el
                      el.value = settingsDraft
                      // 開いた瞬間にフォーカス
                      queueMicrotask(() => el.focus())
                    }),
                    on('input', (event) => {
                      settingsDraft = (event.currentTarget as HTMLTextAreaElement).value
                      // 手で編集したらプリセット選択は外す（最初の編集のみ再描画）
                      if (selectedPresetId !== '') {
                        selectedPresetId = ''
                        void handle.update()
                      }
                    }),
                  ]}
                  placeholder="例: あなたは関西弁で答えるアシスタントです。"
                />
                <div mix={settingsButtonsStyle}>
                  <button
                    type="button"
                    mix={[secondaryButtonStyle, on('click', () => cancelSettings())]}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    mix={[primaryButtonStyle, on('click', () => void saveSettings())]}
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

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
                      {msg.role === 'assistant' ? (
                        <MarkdownContent source={msg.content} />
                      ) : (
                        msg.content
                      )}
                      {isLoading &&
                      idx === messages.length - 1 &&
                      msg.role === 'assistant' ? (
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
                  primaryButtonStyle,
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
    }
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

const headerStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 12px',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '13px',
})

const modelLabelStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: 1,
})

const modelSelectStyle = css({
  padding: '4px 8px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '13px',
  fontFamily: 'inherit',
  background: 'white',
})

const iconButtonStyle = css({
  padding: '4px 12px',
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: 'inherit',
  '&:hover': { background: '#f0f0f0' },
  '&:disabled': { background: '#eee', cursor: 'not-allowed' },
})

const settingsPanelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  background: '#fffbe6',
  border: '1px solid #f0d870',
  borderRadius: '6px',
})

const settingsLabelStyle = css({
  fontSize: '13px',
  fontWeight: 600,
})

const presetSelectStyle = css({
  marginLeft: '8px',
  padding: '4px 8px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '13px',
  fontFamily: 'inherit',
  background: 'white',
})

const settingsTextareaStyle = css({
  minHeight: '80px',
  padding: '8px',
  fontFamily: 'inherit',
  fontSize: '13px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  resize: 'vertical',
})

const settingsButtonsStyle = css({
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
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

const primaryButtonStyle = css({
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

const secondaryButtonStyle = css({
  padding: '0 16px',
  background: 'white',
  color: '#333',
  border: '1px solid #ccc',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  '&:hover': { background: '#f0f0f0' },
})

const markdownStyle = css({
  '& p': { margin: '0 0 8px 0' },
  '& p:last-child': { margin: 0 },
  '& h1, & h2, & h3, & h4': { margin: '12px 0 8px 0', fontWeight: 600 },
  '& ul, & ol': { paddingLeft: '20px', margin: '0 0 8px 0' },
  '& li': { marginBottom: '2px' },
  '& code': {
    background: 'rgba(0,0,0,0.06)',
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: '90%',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '& pre': {
    background: '#f6f8fa',
    padding: '12px',
    borderRadius: '6px',
    overflow: 'auto',
    margin: '8px 0',
  },
  '& pre code': {
    background: 'transparent',
    padding: 0,
    fontSize: '13px',
  },
  '& a': { color: '#2196f3' },
  '& blockquote': {
    borderLeft: '3px solid #ccc',
    paddingLeft: '12px',
    color: '#555',
    margin: '8px 0',
  },
  '& table': {
    borderCollapse: 'collapse',
    margin: '8px 0',
  },
  '& th, & td': {
    border: '1px solid #ccc',
    padding: '4px 8px',
  },
})

/**
 * Markdown を innerHTML で描画する内部コンポーネント。
 * Remix 3 の JSX には dangerouslySetInnerHTML が無いため、ref で要素を捕捉して
 * queueTask で再 render 後に innerHTML を更新する。ストリーム中の delta 更新でも
 * 毎回 source が変わって再描画される想定。
 */
function MarkdownContent(handle: Handle<{ source: string }>) {
  let el: HTMLSpanElement | null = null

  return () => {
    const html = renderMarkdown(handle.props.source)
    handle.queueTask(() => {
      if (el && el.innerHTML !== html) {
        el.innerHTML = html
      }
    })
    return (
      <span
        mix={[
          markdownStyle,
          ref((node) => {
            el = node as HTMLSpanElement
            el.innerHTML = html
          }),
        ]}
      />
    )
  }
}
