import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site-url'

const SITE_URL = siteUrl()

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /list?items=... is per-user shareable state — nothing to index.
        // /api is server-only.
        disallow: ['/list', '/api/', '/_next/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
