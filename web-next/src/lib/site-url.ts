// Resolves the absolute origin used by sitemap.ts, robots.ts, manifest.ts and
// generateMetadata. Order of preference:
//
//   1. NEXT_PUBLIC_SITE_URL — explicit canonical, set in production env.
//   2. VERCEL_PROJECT_PRODUCTION_URL — auto-set by Vercel on every deployment;
//      the stable production hostname (e.g. basketch-redesign.vercel.app).
//   3. VERCEL_URL — the unique URL for *this* deployment; right for previews
//      where each commit gets its own subdomain.
//   4. localhost fallback — for `next dev`.
//
// This keeps OG images and sitemap entries correct on previews without the
// caller having to set any env var.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return `https://${prod}`
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}
