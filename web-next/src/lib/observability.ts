// Observability shim — no-op until DSNs land. Once you create accounts, swap
// the stub bodies for the real SDK calls and uncomment the deps in env.example.
//
// Recommended landing path:
//
//   npm i @sentry/nextjs posthog-js
//   npx @sentry/wizard@latest -i nextjs
//
// then replace the stubs below with:
//
//   import * as Sentry from '@sentry/nextjs'
//   Sentry.captureException(err, { extra: ctx })
//
//   import posthog from 'posthog-js'
//   posthog.capture(event, props)
//
// Keeping the call sites stable means no hunt-and-replace at activation time.

type ErrCtx = Record<string, unknown>

export function captureException(err: unknown, ctx?: ErrCtx): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[observability] captureException', err, ctx)
  }
  // TODO Sentry.captureException(err, { extra: ctx })
}

export function captureMessage(msg: string, ctx?: ErrCtx): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[observability] captureMessage', msg, ctx)
  }
  // TODO Sentry.captureMessage(msg, { extra: ctx })
}

export function track(event: string, props?: Record<string, unknown>): void {
  // TODO posthog.capture(event, props)
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[observability] track', event, props)
  }
}

// Boolean checks the rest of the app can use to know whether telemetry is on.
// Useful for gating analytics consent banners later.
export function hasSentry(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
}

export function hasPosthog(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}
