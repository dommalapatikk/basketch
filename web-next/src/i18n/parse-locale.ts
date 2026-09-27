import { notFound } from 'next/navigation'

import type { Locale } from './locale-from-pathname'

type RoutingConfig = {
  locales: readonly string[]
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
 */
export function parseLocale(raw: string, routing: RoutingConfig): Locale {
  if (routing.locales.includes(raw)) {
    return raw as Locale
  }
  notFound()
}
