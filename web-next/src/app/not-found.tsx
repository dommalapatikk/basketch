import Link from 'next/link'

// Top-level 404 — rendered for any URL the App Router can't match.
// Plain anchors (not next-intl Link) because this file lives outside [locale]
// and shouldn't depend on the i18n context.
export default function RootNotFound() {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          padding: '64px 24px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#0B0B0F',
          background: '#F6F6F3',
          minHeight: '100vh',
        }}
      >
        <main style={{ maxWidth: 560, marginInline: 'auto' }}>
          <p
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#6B6B75',
            }}
          >
            404
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 600, marginTop: 16 }}>Seite nicht gefunden</h1>
          <p style={{ marginTop: 16, color: '#1F1F25', lineHeight: 1.6 }}>
            Diese Seite gibt es nicht (oder nicht mehr). Geh zurück zu den Aktionen dieser Woche.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/deals"
              style={{
                padding: '12px 20px',
                borderRadius: 10,
                background: '#2E4CDE',
                color: '#FFFFFF',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Aktionen ansehen
            </Link>
            <Link
              href="/"
              style={{
                padding: '12px 20px',
                borderRadius: 10,
                background: '#FFFFFF',
                color: '#0B0B0F',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid #D8D7D1',
              }}
            >
              Zur Startseite
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
