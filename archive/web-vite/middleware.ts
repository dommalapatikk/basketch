// Vercel Middleware -- runs on every request before the SPA.
// Detects crawler user agents and returns minimal HTML with OG tags.
// Regular users pass through to the React SPA unchanged.
//
// Architecture: ADR-003 (technical-architecture-v2.md, Section 9.2)
// OG tag data: shared config in src/lib/og-tags.ts

import { next } from '@vercel/functions'

const CRAWLER_USER_AGENTS = [
  'WhatsApp',
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'Googlebot',
  'bingbot',
]

// Static OG tag definitions per route.
// Must stay in sync with og-tags.ts (shared config).
const OG_TAGS: Record<string, { title: string, description: string }> = {
  '/': {
    title: 'basketch — Migros or Coop this week?',
    description: 'Compare weekly deals side by side and find out who wins.',
  },
  '/deals': {
    title: 'This Week\'s Deals — basketch',
    description: 'Browse all Migros and Coop weekly promotions side by side. Sorted by discount.',
  },
  '/onboarding': {
    title: 'Set Up Your List — basketch',
    description: 'Pick a starter pack and see which store has better deals on your favourites.',
  },
  '/about': {
    title: 'About — basketch',
    description: 'How basketch works: we compare Migros and Coop weekly promotions so you don\'t have to.',
  },
}

// Default for /compare/:id and unknown paths
const DEFAULT_OG = {
  title: 'Your Comparison — basketch',
  description: 'See which store wins for your personal shopping list this week.',
}

export default function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent') || ''
  const isCrawler = CRAWLER_USER_AGENTS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase()),
  )

  if (!isCrawler) {
    // Not a crawler -- pass through to the SPA
    return next()
  }

  // Skip static assets -- crawlers requesting .js, .css, images should pass through
  const url = new URL(request.url)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|webp|avif|json|xml|txt)$/)) {
    return next()
  }

  const path = url.pathname
  const og = OG_TAGS[path] || DEFAULT_OG
  const imageUrl = `${url.origin}/og-image.png`

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta property="og:title" content="${escapeHtml(og.title)}" />
  <meta property="og:description" content="${escapeHtml(og.description)}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:url" content="${url.href}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="basketch" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(og.title)}" />
  <meta name="twitter:description" content="${escapeHtml(og.description)}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta name="theme-color" content="#1d4ed8" />
  <title>${escapeHtml(og.title)}</title>
</head>
<body></body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|assets/).*)'],
}
