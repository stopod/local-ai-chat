import { ChatComposer } from './chat-composer.tsx'
import { Layout } from './layout.tsx'

export function ChatPage() {
  return () => (
    <Layout title="Chat">
      <ChatComposer />
    </Layout>
  )
}
