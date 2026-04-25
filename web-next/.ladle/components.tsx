import type { GlobalProvider } from '@ladle/react'

import '../src/app/globals.css'

export const Provider: GlobalProvider = ({ children }) => (
  <div className="font-sans" style={{ background: 'var(--color-page)', minHeight: '100vh', padding: 24 }}>
    {children}
  </div>
)
