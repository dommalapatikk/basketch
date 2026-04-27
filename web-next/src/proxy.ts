import { NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// Next.js 16 renamed middleware.ts → proxy.ts. The next-intl helper is
// still exported from 'next-intl/middleware' (library-side name unchanged).
const intlMiddleware = createMiddleware(routing)

// `/card` is a locale-agnostic OG image route. If users hit `/en/card` or
// `/de/card`, rewrite to `/card` so the OG handler still serves the PNG
// instead of 404-ing through the locale router.
const LOCALE_CARD_RE = /^\/(de|en)\/card\/?$/

export default function proxy(request: NextRequest) {
  if (LOCALE_CARD_RE.test(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/card'
    return NextResponse.rewrite(url)
  }
  return intlMiddleware(request)
}

// `card` is excluded from intl wrapping; the rewrite above handles
// /<locale>/card explicitly so the OG handler still serves there.
export const config = {
  matcher: ['/((?!api|card|_next|_vercel|.*\\..*).*)'],
}
