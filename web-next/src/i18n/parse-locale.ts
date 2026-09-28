import { notFound } from 'next/navigation'

type RoutingConfig<L extends string> = {
  locales: readonly L[]
}

/**
 * Parse, don't validate (RCA fix, final plan step 3). Every `[locale]` entry
 * point — the layout (body and `generateMetadata`), and every `page.tsx`
 * under it — must call this instead of trusting the raw route param.
 *
 * The root cause of the `/foo.bar` 500 (RCA "New evidence" section) was an
 * unvalidated `string` reaching an `Intl` call downstream
 * (`VerdictHero` → `snapshot.totalDeals.toLocaleString(locale)`-shaped code).
 * Parsing once, here, and typing every downstream prop as `Locale` (not
 * `string`) makes that bug class a type error at every call site that skips
 * this function.
 *
 * Throws Next's `notFound()` — the same `NEXT_HTTP_ERROR_FALLBACK;404` error
 * a page would throw itself — for anything that isn't a known locale, so the
 * segment renders a real 404 instead of crashing on the value further down.
 *
 * Generic over the locale union, like `localeFromPathname` (code review
 * 2026-09-27 NIT 1) — the old hardcoded `Locale` return type was a "lying
 * type" for any routing shape other than the app's own `{de, en}`. Real call
 * sites pass the app's `routing` object and get `Locale` back automatically.
 */
export function parseLocale<L extends string>(raw: string, routing: RoutingConfig<L>): L {
  if (routing.locales.includes(raw as L)) {
    return raw as L
  }
  notFound()
}
