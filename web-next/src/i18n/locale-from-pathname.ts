import type { routing } from './routing'

export type Locale = (typeof routing)['locales'][number]

type RoutingConfig<L extends string> = {
  locales: readonly L[]
  defaultLocale: L
}

/**
 * Which locale block a fully-static page should show, derived from a
 * pathname alone (no request data). Used by `global-not-found.tsx`'s client
 * island — see docs/rca/2026-09-25-tech-lead-404-shows-500.md § "Final plan"
 * step 2, and the architect cross-review § 2.3 amendment A1: `global-not-found`
 * must stay fully static, so the locale is read from
 * `window.location.pathname` on the client, never from `headers()`.
 *
 * Pure and dependency-free — `routing` is passed in so this stays testable
 * without mocking `next-intl`, and there is still exactly one locale list.
 * Generic over the locale union so a test can pass a different routing shape
 * without fighting the app's own `Locale` type; real call sites pass the
 * app's `routing` object and get `Locale` back.
 *
 * `'/en'` or `'/en/...'` gives `'en'`. Everything else — the unprefixed root,
 * an unknown locale, a lowercase/case-mismatched prefix like `/EN`, or a
 * segment that merely starts with a locale code (`/english`) — gives
 * `routing.defaultLocale`, matching next-intl's `as-needed` default.
 */
export function localeFromPathname<L extends string>(
  pathname: string,
  routing: RoutingConfig<L>,
): L {
  const pathOnly = pathname.split('?')[0].split('#')[0]
  const [, firstSegment] = pathOnly.split('/')
  return routing.locales.includes(firstSegment as L) ? (firstSegment as L) : routing.defaultLocale
}
