// OG tag data generator for each page.
// Used by Vercel Middleware to inject OG meta tags for crawlers (WhatsApp, social).

export interface OgTagData {
  title: string
  description: string
  url: string
  image?: string
  type: 'website' | 'article'
}

const BASE_URL = 'https://basketch.ch'
const SITE_NAME = 'basketch'
const DEFAULT_DESCRIPTION = 'Migros or Coop this week? Compare weekly deals side by side and find out who wins.'

/**
 * Generate OG tag data for a given route path.
 */
export function getOgTags(pathname: string): OgTagData {
  // Home page
  if (pathname === '/' || pathname === '') {
    return {
      title: `${SITE_NAME} — Migros or Coop this week?`,
      description: DEFAULT_DESCRIPTION,
      url: BASE_URL,
      type: 'website',
    }
  }

  // Deals page
  if (pathname === '/deals' || pathname.startsWith('/deals')) {
    return {
      title: `This Week's Deals — ${SITE_NAME}`,
      description: 'Browse all Migros and Coop weekly promotions side by side. Sorted by discount.',
      url: `${BASE_URL}/deals`,
      type: 'website',
    }
  }

  // Onboarding
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding')) {
    return {
      title: `Set Up Your List — ${SITE_NAME}`,
      description: 'Pick a starter pack and see which store has better deals on your favourites.',
      url: `${BASE_URL}/onboarding`,
      type: 'website',
    }
  }

  // Compare page (dynamic: /compare/:id)
  if (pathname.startsWith('/compare')) {
    return {
      title: `Your Comparison — ${SITE_NAME}`,
      description: 'See which store wins for your personal shopping list this week.',
      url: `${BASE_URL}${pathname}`,
      type: 'article',
    }
  }

  // About page
  if (pathname === '/about') {
    return {
      title: `About — ${SITE_NAME}`,
      description: 'How basketch works: we compare Migros and Coop weekly promotions so you don\'t have to.',
      url: `${BASE_URL}/about`,
      type: 'website',
    }
  }

  // Fallback for unknown routes
  return {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: `${BASE_URL}${pathname}`,
    type: 'website',
  }
}

/**
 * Generate HTML meta tag strings for injection by middleware.
 */
export function renderOgMetaTags(data: OgTagData): string {
  const tags = [
    `<meta property="og:title" content="${escapeHtml(data.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(data.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(data.url)}" />`,
    `<meta property="og:type" content="${data.type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(data.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(data.description)}" />`,
  ]

  if (data.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(data.image)}" />`)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(data.image)}" />`)
  }

  return tags.join('\n    ')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
