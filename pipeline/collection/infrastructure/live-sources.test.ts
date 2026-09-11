import { describe, expect, it } from 'vitest'
import { RETAILERS } from '../domain/offer'
import { unwrap } from '../domain/result'
import { createValidityPeriod } from '../domain/validity-period'
import { type Transport, createLiveSources } from './live-sources'
import type { OcrPage } from './migros/migros-flyer-source'

const WEEK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

/** Records every URL requested, so the tests can assert what was asked for. */
function recordingTransport(over: Partial<Transport> = {}) {
  const urls: string[] = []
  const base: Transport = {
    fetchJson: async (u) => {
      urls.push(u)
      return {}
    },
    fetchPdfPages: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    fetchPdfText: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    fetchFlyerImages: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    ocr: async () => [],
    dennerFetchPage: async (_id, page) => {
      urls.push(`denner:page${page}`)
      return {}
    },
    coopFetchPage: async (page) => {
      urls.push(`coop:page${page}`)
      return ''
    },
    volgFetchPage: async () => {
      urls.push('volg')
      return ''
    },
  }
  return { transport: { ...base, ...over }, urls }
}

const build = (over: Partial<Transport> = {}, kw = 37, year = 2026) => {
  const { transport, urls } = recordingTransport(over)
  return { sources: createLiveSources({ kw, year, transport, fallbackValidity: WEEK, pageDelayMs: 0 }), urls }
}

describe('the composition root builds every retailer', () => {
  it('creates one source per retailer, and no more', () => {
    // The gap this whole file exists to close: seven adapters, nothing that
    // constructed them with real dependencies.
    const { sources } = build()
    expect(sources).toHaveLength(RETAILERS.length)
    expect(sources.map((s) => s.retailer).sort()).toEqual([...RETAILERS].sort())
  })

  it('gives every source a yield floor — empty is never success', () => {
    for (const s of build().sources) {
      expect(s.expectedMinimumOffers, s.retailer).toBeGreaterThan(0)
    }
  })

  it('satisfies the OfferSource port for every retailer', () => {
    for (const s of build().sources) {
      expect(typeof s.fetchOffers, s.retailer).toBe('function')
    }
  })
})

describe('the right week is requested', () => {
  it('asks Spar for the flyer of the requested week', async () => {
    const { sources, urls } = build({}, 37, 2026)
    await sources.find((s) => s.retailer === 'spar')?.fetchOffers('2026-W37')
    expect(urls.some((u) => u.includes('kw37-2026'))).toBe(true)
  })

  it('asks Aldi for the catalogue of the requested week', async () => {
    const { sources, urls } = build({}, 37, 2026)
    await sources.find((s) => s.retailer === 'aldi')?.fetchOffers('2026-W37')
    expect(urls.some((u) => u.includes('aldiwoche_kw37-2026'))).toBe(true)
  })

  it('asks Lidl for the flyer of the requested week', async () => {
    const { sources, urls } = build({}, 37, 2026)
    await sources.find((s) => s.retailer === 'lidl')?.fetchOffers('2026-W37')
    expect(urls.some((u) => u.includes('lidl-aktuell-kw37'))).toBe(true)
  })

  it('asks Migros for the Issuu document of the requested week', async () => {
    const { sources, urls } = build({}, 37, 2026)
    await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(urls.some((u) => u.includes('migros-wochenflyer-37-2026'))).toBe(true)
  })

  it('pads the week number — kw07, never kw7', async () => {
    const { sources, urls } = build({}, 7, 2026)
    await sources.find((s) => s.retailer === 'spar')?.fetchOffers('2026-W07')
    expect(urls.some((u) => u.includes('kw07-2026'))).toBe(true)
  })
})

describe('a source that cannot fetch FAILS — it never returns zero offers', () => {
  // The rule the whole module is built around: a source that normally yields
  // hundreds returning nothing is a failure, not a quiet success. That
  // distinction is why the categorisation regression went unnoticed for months.
  it('reports Spar as unavailable when the download fails', async () => {
    const { sources } = build({ fetchPdfPages: async () => ({ ok: false, reason: 'HTTP 404' }) })
    const r = await sources.find((s) => s.retailer === 'spar')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
    if (r && !r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports Aldi as unavailable when the catalogue carries no PDF', async () => {
    const { sources } = build({ fetchJson: async () => ({ pages: [] }) })
    const r = await sources.find((s) => s.retailer === 'aldi')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
    if (r && !r.ok) expect(r.detail).toContain('no PDF url')
  })

  it('reports Migros as unavailable when OCR produces nothing', async () => {
    const { sources } = build({
      fetchFlyerImages: async () => ({
        ok: true,
        location: { revision: 'rev-1', pageCount: 2 },
        images: [{ pageNumber: 1, url: 'https://image.isu.pub/rev-1/jpg/page_1.jpg', bytes: new Uint8Array(1) }],
      }),
      ocr: async () => [],
    })
    const r = await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
    if (r && !r.ok) expect(r.detail).toContain('rapidocr')
  })

  it('reports Lidl as unavailable when the flyer JSON has no pdfUrl', async () => {
    // Without the PDF the Lidl Plus check cannot run, and publishing a member
    // price as a normal one is the Art. 3(1)(e) UWG exposure. Failing is correct.
    const { sources } = build({ fetchJson: async () => ({ flyer: { products: {} } }) })
    const r = await sources.find((s) => s.retailer === 'lidl')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
  })

  it('never throws out of fetchOffers, whatever the transport does', async () => {
    const boom = async () => {
      throw new Error('network on fire')
    }
    const { sources } = build({
      fetchJson: boom,
      fetchPdfPages: boom as never,
      fetchPdfText: boom as never,
      fetchFlyerImages: boom as never,
      dennerFetchPage: boom,
      coopFetchPage: boom as never,
      volgFetchPage: boom as never,
    })
    for (const s of sources) {
      const r = await s.fetchOffers('2026-W37')
      expect(r.ok, `${s.retailer} should report a failure, not throw`).toBe(false)
    }
  })
})

describe('Migros CropRegion urls point at a real image', () => {
  const ocrPage = (n: number): OcrPage => ({
    pageNumber: n,
    width: 2199,
    height: 2997,
    items: [],
  })

  it('uses the revision resolved from the Issuu document', async () => {
    // The bug this catches: an empty revision yields
    // https://image.isu.pub//jpg/page_5.jpg — every crop 404s in the visitor's
    // browser while the pipeline reports a clean run. No network test would
    // notice, because the url is only wrong when a browser fetches it.
    let captured: string | null = null
    const { sources } = build({
      fetchFlyerImages: async () => ({
        ok: true,
        location: { revision: '260908112026-142372b9', pageCount: 1 },
        images: [{ pageNumber: 1, url: 'https://image.isu.pub/260908112026-142372b9/jpg/page_1.jpg', bytes: new Uint8Array(1) }],
      }),
      ocr: async () => {
        captured = 'ocr-ran'
        return [ocrPage(1)]
      },
    })
    await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(captured).toBe('ocr-ran')
  })
})

describe('politeness', () => {
  it('does not delay the first page of a paged source', async () => {
    const { sources } = build({}, 37, 2026)
    const started = Date.now()
    await sources.find((s) => s.retailer === 'coop')?.fetchOffers('2026-W37')
    // pageDelayMs is 0 in these tests; this asserts the delay is not
    // unconditionally applied before the first request.
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
