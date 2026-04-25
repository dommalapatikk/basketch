import type { MetadataRoute } from 'next'

import { routing } from '@/i18n/routing'
import { siteUrl } from '@/lib/site-url'

const SITE_URL = siteUrl()

const STATIC_ROUTES = ['/', '/deals'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = []

  for (const path of STATIC_ROUTES) {
    for (const locale of routing.locales) {
      // localePrefix: 'as-needed' — default locale (de) is served at /, others at /<locale>/.
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      const url = `${SITE_URL}${prefix}${path === '/' ? '' : path}` || SITE_URL
      entries.push({
        url: url || `${SITE_URL}/`,
        lastModified: now,
        changeFrequency: path === '/' ? 'daily' : 'hourly',
        priority: path === '/' ? 1 : 0.8,
      })
    }
  }

  return entries
}
