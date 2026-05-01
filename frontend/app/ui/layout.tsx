import type { RemixNode } from 'remix/ui'

import { Document } from './document.tsx'

export interface LayoutProps {
  children?: RemixNode
  title?: string
}

export function Layout() {
  return ({ title, children }: LayoutProps) => (
    <Document title={title}>
      <main>{children}</main>
    </Document>
  )
}
