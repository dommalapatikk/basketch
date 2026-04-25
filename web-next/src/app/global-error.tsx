'use client'

// Top-level error boundary — replaces the root layout when an uncaught error
// bubbles past every other boundary. Per Next 16, must declare its own <html>
// and <body>. Stays text-only so it works even if globals.css fails to load.

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          padding: '64px 24px',
          fontFamily: 'system-ui, sans-serif',
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
            500
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 600, marginTop: 16 }}>Something went wrong</h1>
          <p style={{ marginTop: 16, color: '#1F1F25', lineHeight: 1.6 }}>
            We&rsquo;ve logged the error. Try again in a moment.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: 12,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                color: '#6B6B75',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '12px 20px',
              border: 0,
              borderRadius: 10,
              background: '#2E4CDE',
              color: '#FFFFFF',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
