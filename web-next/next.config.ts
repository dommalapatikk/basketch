import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    // ⚠️ A RETAILER WHOSE HOST IS NOT LISTED RENDERS NOTHING. next/image
    // refuses any host absent from this list, silently — the card shows an
    // empty box and nothing reports an error.
    //
    // TWO INCIDENTS, SAME SHAPE:
    //   2026-09-11 — all 107 Denner deals had valid images at
    //   denner.imgix.net, which was not listed, so every Denner card was
    //   blank while the data was perfect.
    //   2026-09-16 (QA) — LIDL (imgproxy-retcat.assets.schwarz, 74 deals) and
    //   Volg (www.volg.ch, 16 deals) were live in production and STILL
    //   absent, because src/lib/image-hosts.test.ts's own required-hosts list
    //   didn't know either retailer existed either — the guard built for the
    //   first incident didn't catch its own repeat.
    //
    // src/lib/image-hosts.test.ts now derives its required-hosts list from
    // the SAME committed fixtures each retailer adapter's own test parses —
    // real captured data, not a second hand-typed list next to this one that
    // can drift from it exactly the way this one drifted from production.
    // Add a retailer, add its fixture, or the test fails instead of the site.
    //
    // Flyer crops are deliberately NOT here: they render through a plain <img>
    // because optimising them would serve a derived copy of a protected
    // photograph from our own domain (Art. 2 Abs. 3bis URG).
    remotePatterns: [
      // Denner's own CDN — the one retailer we reach through a direct API.
      { protocol: 'https', hostname: 'denner.imgix.net' },
      // Coop, via the aktionis.ch listing pages we read (CLAUDE.md §2 — this
      // is the current collector, not stale legacy data).
      { protocol: 'https', hostname: 'storage.cpstatic.ch' },
      // LIDL's flyer JSON `product.image` field — Schwarz Group's own imgproxy.
      { protocol: 'https', hostname: 'imgproxy-retcat.assets.schwarz' },
      // Volg's own site, own product photos.
      { protocol: 'https', hostname: 'www.volg.ch' },
      { protocol: 'https', hostname: 'aktionis.ch' },
    ],
  },
}

export default withNextIntl(nextConfig)
