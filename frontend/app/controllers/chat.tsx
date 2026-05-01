import type { BuildAction } from 'remix/fetch-router'

import type { routes } from '../routes.ts'
import { ChatPage } from '../ui/chat-page.tsx'
import { render } from '../utils/render.tsx'

export const chat: BuildAction<'GET', typeof routes.chat> = {
  handler({ request }) {
    return render(<ChatPage />, request)
  },
}
