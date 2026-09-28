import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * SF-6, docs/reviews/2026-09-28-review-stale-expired-deals.md: `ImageResponse`
 * (next/og) sets a default `cache-control: public, immutable, no-transform,
 * max-age=31536000` — a full YEAR — when a route doesn't override it
 * (node_modules/next/dist/compiled/@vercel/og/index.node.js). `/card` never
 * did, so any browser or proxy that honours that header keeps one day's
 * verdict image for a year, under a URL that never changes (no `d=` — see
 * the ADR ruling on why not). This pins an explicit, short override instead.
 *
 * `getWeeklySnapshot` and `next/og`'s `ImageResponse` are mocked so this test
 * exercises only the header the route itself sets — not Supabase, the
 * `'use cache'` runtime, or real PNG rendering (which needs the real
 * Next/Vercel Edge runtime and fetches real font files over the network).
 */

vi.mock('@/server/data/snapshot', () => ({
  getWeeklySnapshot: vi.fn().mockResolvedValue({
    updatedAt: '2026-09-27T06:00:00Z',
    totalDeals: 3,
    region: 'all',
    locale: 'de',
    stores: [{ store: 'coop', dealCount: 3 }],
    categories: [],
    deals: [],
    today: '2026-09-27',
  }),
}))

const imageResponseOptions: Array<{ headers?: Record<string, string> }> = []

vi.mock('next/og', () => ({
  ImageResponse: vi.fn().mockImplementation(function ImageResponse(
    _element: unknown,
    options: unknown,
  ) {
    imageResponseOptions.push(options as { headers?: Record<string, string> })
    return { status: 200 }
  }),
}))

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) }))

afterEach(() => {
  imageResponseOptions.length = 0
  vi.clearAllMocks()
})

describe('GET /card', () => {
  it("sets an explicit short Cache-Control, overriding ImageResponse's 1-year default", async () => {
    const { GET } = await import('./route')

    await GET(new Request('http://localhost/card?locale=de'))

    const options = imageResponseOptions.at(-1)
    expect(options?.headers?.['cache-control']).toBeTruthy()
    expect(options?.headers?.['cache-control']).not.toContain('immutable')
    expect(options?.headers?.['cache-control']).not.toMatch(/max-age=31536000/)
    expect(options?.headers?.['cache-control']).toMatch(/max-age=0/)
    expect(options?.headers?.['cache-control']).toMatch(/s-maxage=\d+/)
  })
})
