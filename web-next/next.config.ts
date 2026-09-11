import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    // ⚠️ A RETAILER WHOSE HOST IS NOT LISTED RENDERS NOTHING. next/image
    // refuses any host absent from this list, silently — the card shows an
    // empty box and nothing reports an error. On 2026-09-11 all 107 Denner
    // deals had valid images at denner.imgix.net, which was not listed, so
    // every Denner card was blank on the live site while the data was perfect.
    //
    // src/lib/image-hosts.test.ts pins this list against the hosts actually
    // present in production data. Add a retailer, add its host, or the test
    // fails instead of the site.
    //
    // Flyer crops are deliberately NOT here: they render through a plain <img>
    // because optimising them would serve a derived copy of a protected
    // photograph from our own domain (Art. 2 Abs. 3bis URG).
    remotePatterns: [
      // Denner's own CDN — the one retailer we reach through a direct API.
      { protocol: 'https', hostname: 'denner.imgix.net' },
      { protocol: 'https', hostname: 'storage.cpstatic.ch' },
      { protocol: 'https', hostname: 'image.migros.ch' },
      { protocol: 'https', hostname: 'image.coop.ch' },
      { protocol: 'https', hostname: 'aktionis.ch' },
    ],
  },
}

export default withNextIntl(nextConfig)
