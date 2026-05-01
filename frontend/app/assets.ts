import { createAssetServer } from 'remix/assets'

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  fileMap: {
    'app/*path': 'app/*path',
    'node_modules/*path': 'node_modules/*path',
  },
  allow: [
    'app/assets/**',
    'app/ui/chat-composer.tsx',
    'app/utils/chat-api.ts',
    'app/utils/conversation-repository.ts',
    'app/utils/indexeddb-repository.ts',
    'app/utils/markdown.ts',
    'node_modules/**',
  ],
  deny: ['app/**/*.server.*'],
  sourceMaps: process.env.NODE_ENV === 'development' ? 'external' : undefined,
  scripts: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
  },
})
