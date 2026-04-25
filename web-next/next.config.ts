import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.cpstatic.ch' },
      { protocol: 'https', hostname: 'image.migros.ch' },
      { protocol: 'https', hostname: 'image.coop.ch' },
      { protocol: 'https', hostname: 'aktionis.ch' },
    ],
  },
}

export default withNextIntl(nextConfig)
