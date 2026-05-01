import type { BuildAction } from 'remix/fetch-router'

import { routes } from '../routes.ts'

/** ルート（`/`）にアクセスされたら `/chat` へリダイレクトする。 */
export const home: BuildAction<'GET', typeof routes.home> = {
  handler() {
    return new Response(null, {
      status: 302,
      headers: { Location: routes.chat.href() },
    })
  },
}
