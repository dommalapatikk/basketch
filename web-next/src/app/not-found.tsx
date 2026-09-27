import Link from 'next/link'

import { NotFoundLocale } from './NotFoundLocale'

// Root-level not-found boundary (D2, docs/rca/2026-09-25-tech-lead-404-shows-500.md
// § "Final plan" step 7). `global-not-found.tsx` now owns every genuinely
// unmatched URL (Next routes those before any layout renders — see
// next.config.ts's `experimental.globalNotFound`). This file only remains
// reachable for a `notFound()` thrown BY `[locale]/layout.tsx` itself — e.g.
// `/foo.bar`, a dotted single segment the next-intl proxy matcher skips,
// which reaches `[locale]/layout.tsx` with an invalid `locale` param that
// `parseLocale` rejects. A layout's own thrown `notFound()` bubbles to the
// PARENT segment's boundary, not to the localized `[locale]/not-found.tsx`
// sibling, so this root-level, locale-agnostic fallback is still needed.
//
// Renders a fragment, not its own <html>/<body>: there is no root
// app/layout.tsx, so Next already supplies that shell. The previous version
// rendered its own <html>/<body> INSIDE that shell, producing invalid nested
// markup (RCA § "Secondary defect"). Plain <Link> (not next-intl's) because
// this file lives outside [locale] and has no i18n context to read.
export default function RootNotFound() {
  return (
    <>
      {/* Sets <html lang>, which this fragment can't do itself — there is no
          root layout to own that attribute. Content here is always
          hardcoded German (this boundary is unreachable via a valid 'en'
          path — see the file comment), and localeFromPathname resolves any
          path that CAN reach it to the default locale, so this always
          agrees with the visible text. */}
      <NotFoundLocale />
      <main
        style={{
          margin: 0,
          padding: '64px 24px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#0B0B0F',
          background: '#F6F6F3',
          minHeight: '100vh',
          maxWidth: 560,
          marginInline: 'auto',
          boxSizing: 'border-box',
        }}
      >
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
    </>
  )
}
