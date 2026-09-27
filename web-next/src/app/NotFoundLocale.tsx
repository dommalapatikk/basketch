'use client'

import { useEffect } from 'react'

import { localeFromPathname } from '@/i18n/locale-from-pathname'
import { routing } from '@/i18n/routing'

/**
 * Client island for `global-not-found.tsx`. That page must stay fully
 * static — no `headers()`, `cookies()` or `connection()` — because under
 * `cacheComponents` any of those would create a PPR hole in the 404
 * document, which is the exact bug class this fix removes (architect
 * cross-review § 2.3, amendment A1). So both locale blocks render on the
 * server, and this effect picks the visible one from the URL the browser
 * actually loaded, after the fact.
 *
 * Sets `<html lang>` and `data-locale`; the page's own `<style>` block shows
 * only the `[data-locale-block]` matching `data-locale` (German by default,
 * matching `routing.defaultLocale` under next-intl's `as-needed` prefix).
 *
 * Accepted cost, recorded rather than hidden: an English visitor may see a
 * brief German flash before this effect runs, and with JavaScript disabled
 * both language blocks stay visible. The page is `noindex`
 * (Next injects this automatically for any 404 response), so neither costs
 * anything in search.
 */
export function NotFoundLocale() {
  useEffect(() => {
    const locale = localeFromPathname(window.location.pathname, routing)
    document.documentElement.lang = locale
    document.documentElement.dataset.locale = locale
  }, [])
  return null
}
