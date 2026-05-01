/**
 * Markdown を HTML にレンダリングし、`DOMPurify` でサニタイズする。
 *
 * MVP ではコードブロックのシンタックスハイライトは入れない（背景色＋等幅フォントのみ）。
 * 必要になったら shiki などの ESM 互換ライブラリを後付けで導入する想定。
 */
import DOMPurify from 'dompurify'
import { marked } from 'marked'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

marked.use({
  renderer: {
    code(token) {
      const lang = (token.lang ?? '').trim()
      const className = lang ? `language-${escapeHtml(lang)}` : ''
      return `<pre><code class="${className}">${escapeHtml(token.text)}</code></pre>`
    },
  },
})

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(raw)
}
