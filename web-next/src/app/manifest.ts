import type { MetadataRoute } from 'next'

// PWA manifest. Lets users add basketch to their home screen — a measured
// retention bump on a weekly-cadence product. Icons are placeholders until
// we ship a real artwork pass; pointing at /favicon.ico keeps Lighthouse
// from flagging "no icons" while not over-claiming PWA polish.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'basketch — Schweizer Wochenangebote im Vergleich',
    short_name: 'basketch',
    description:
      'Migros, Coop, LIDL, Denner, SPAR, Volg, ALDI — die besten Aktionen dieser Woche, Seite an Seite.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F6F3',
    theme_color: '#0B0B0F',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
