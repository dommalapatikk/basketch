import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// Next.js 16 renamed middleware.ts → proxy.ts. The next-intl helper is
// still exported from 'next-intl/middleware' (library-side name unchanged).
export default createMiddleware(routing)

// `card` is a locale-agnostic OG image route — must be excluded so the
// next-intl middleware doesn't try to wrap it with /[locale]/card.
export const config = {
  matcher: ['/((?!api|card|_next|_vercel|.*\\..*).*)'],
}
