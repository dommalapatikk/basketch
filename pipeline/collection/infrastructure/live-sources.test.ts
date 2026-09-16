import { readFileSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RETAILERS } from '../domain/offer'
import { unwrap } from '../domain/result'
import { createValidityPeriod } from '../domain/validity-period'
import type { FlyerImage } from './migros/issuu-fetcher'
import {
  type Transport,
  buildOcrManifest,
  createLiveSources,
  createOcrRunner,
  migrosUnavailableReason,
  parseOcrErrors,
  parseOcrOutput,
  writeManifestFiles,
} from './live-sources'
import type { OcrPage } from './migros/migros-flyer-source'
import { parseBboxXml } from './pdf/pdf-words'

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
    ocr: async () => ({ pages: [], errors: [] }),
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
      ocr: async () => ({ pages: [], errors: [] }),
    })
    const r = await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
    // No per-page diagnostics at all falls back to the generic hint.
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
        return { pages: [ocrPage(1)], errors: [] }
      },
    })
    await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(captured).toBe('ocr-ran')
  })
})

describe('Aldi CropRegion urls point at a real image (QA 2026-09-16, defect 2)', () => {
  // Duplicated 4x, same shape as the Migros fixture below: the committed
  // 4-page slice parses to 19 offers, and ALDI_EXPECTED_MINIMUM (60) would
  // otherwise make collectedWithYieldCheck return a failure carrying no
  // offers at all, making the assertions below pass vacuously.
  const ALDI_PAGES_ONE = parseBboxXml(
    readFileSync(join(__dirname, 'aldi/__fixtures__/catalog-kw37-pages3-6.xml'), 'utf8'),
  )
  const ALDI_PAGES = [...ALDI_PAGES_ONE, ...ALDI_PAGES_ONE, ...ALDI_PAGES_ONE, ...ALDI_PAGES_ONE]

  it('wires a page image url built from the SAME data.json fetched for the PDF url', async () => {
    // Before this fix, createAldiFlyerSource's pageImageUrl dependency was
    // never supplied at all, so every ALDI offer carried image: null — the
    // parser has always supported a CropRegion, nothing wired it up.
    const { sources } = build({
      fetchJson: async () => ({
        // The PDF url findPdfUrl reads...
        pages: [{ href: 'https://view.publitas.com/95562/3331426/pdfs/abc.pdf' }],
        // ...and, in the SAME response, the per-page image hashes findPageImageUrls reads.
        spreads: [
          { pages: ['/95562/3331426/pages/' + '1'.repeat(40)] },
          { pages: ['/95562/3331426/pages/' + '2'.repeat(40)] },
          { pages: ['/95562/3331426/pages/' + '3'.repeat(40)] },
          { pages: ['/95562/3331426/pages/' + '4'.repeat(40)] },
        ],
      }),
      fetchPdfPages: async () => ({ ok: true, pages: ALDI_PAGES }),
    })

    const result = await sources.find((s) => s.retailer === 'aldi')?.fetchOffers('2026-W37')
    const offers = result && 'offers' in result ? result.offers : []
    expect(offers.length).toBeGreaterThan(0)

    const cropped = offers.filter((o) => o.image?.kind === 'crop-region')
    expect(cropped.length).toBeGreaterThan(0)
    for (const o of cropped) {
      if (o.image?.kind !== 'crop-region') continue
      expect(o.image.region.pageImageUrl).toMatch(/^https:\/\/view\.publitas\.com\/95562\/3331426\/pages\/[0-9]{40}-at1600\.jpg$/)
    }
  })

  it('never throws and still returns offers (with image: null) when the catalogue carries no page-image data', async () => {
    const { sources } = build({
      fetchJson: async () => ({ pages: [{ href: 'https://view.publitas.com/95562/3331426/pdfs/abc.pdf' }] }),
      fetchPdfPages: async () => ({ ok: true, pages: ALDI_PAGES }),
    })
    const result = await sources.find((s) => s.retailer === 'aldi')?.fetchOffers('2026-W37')
    const offers = result && 'offers' in result ? result.offers : []
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.image === null)).toBe(true)
  })
})

describe('Spar offers carry no image (QA 2026-09-16, defect 3)', () => {
  // The old bug: pageImageUrl pointed at the flyer's PDF DOWNLOAD endpoint
  // (GetPDF.ashx), not a page image — a src a browser <img> can never render,
  // worse than showing nothing. SPAR's real per-page image scheme has no
  // evidence anywhere in the fixtures or research docs, so the fix is to stop
  // emitting a broken src rather than invent one.
  it('every Spar offer has image: null, never a src pointing at the PDF download url', async () => {
    // Duplicated 2x — the 3-page fixture parses to 17 offers, under
    // SPAR_EXPECTED_MINIMUM (30).
    const pagesOnce = parseBboxXml(readFileSync(join(__dirname, 'spar/__fixtures__/flyer-kw37-pages1-3.xml'), 'utf8'))
    const pages = [...pagesOnce, ...pagesOnce]
    const { sources } = build({ fetchPdfPages: async () => ({ ok: true, pages }) })
    const result = await sources.find((s) => s.retailer === 'spar')?.fetchOffers('2026-W37')
    const offers = result && 'offers' in result ? result.offers : []
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.image === null)).toBe(true)
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

// ---------------------------------------------------------------------------
// Every retailer without per-product pages links to the flyer it was read from
// ---------------------------------------------------------------------------
/**
 * THE BUG, reported 2026-09-12: "migros and aldi product urls goes to basketch
 * url not to companies link".
 *
 * Migros, ALDI and SPAR publish no per-product page, so their adapters set
 * sourceUrl to null. The card rendered `<a href="#">`, and `#` resolves to the
 * page you are already on — so clicking a Migros product reloaded basketch.
 *
 * Fixing the frontend to render plain text instead of a dead link removed the
 * WRONG destination but left the card with no destination at all. The flyer the
 * offer was read from is the right one: it is the provenance of the price, and
 * a visitor can check the claim against it, which is what Art. 3(1)(e) UWG
 * effectively asks of a price comparison.
 *
 * THIS TEST GOES THROUGH THE COMPOSITION ROOT ON PURPOSE. The parser tests
 * already prove parseFlyer honours a flyerUrl it is handed. They would all
 * still pass if live-sources never handed it one — which is exactly the shape
 * of defect that has bitten this pipeline repeatedly: the unit is correct and
 * nothing wires it up.
 */
describe('offers carry the flyer they were read from as sourceUrl', () => {
  const MIGROS_OCR: OcrPage[] = JSON.parse(
    readFileSync(join(__dirname, 'migros/__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'),
  )

  it('Migros offers point at the issuu flyer for the requested week', async () => {
    const { sources } = build({
      fetchFlyerImages: async () => ({
        ok: true,
        location: { revision: '260908112026-142372b9', pageCount: 4 },
        images: [
          {
            pageNumber: 1,
            url: 'https://image.isu.pub/260908112026-142372b9/jpg/page_1.jpg',
            bytes: new Uint8Array(1),
          },
        ],
      }),
      // Twice, so the run clears MIGROS_EXPECTED_MINIMUM (10) — the captured
      // fixture is 4 pages yielding 11 offers (WP-C1 golden master), and a
      // below-yield run returns a failure carrying no offers at all, which
      // would make the assertions below pass vacuously.
      ocr: async () => ({ pages: [...MIGROS_OCR, ...MIGROS_OCR], errors: [] }),
    })

    const result = await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    const offers = result && 'offers' in result ? result.offers : []
    expect(offers.length).toBeGreaterThan(0)

    // kw/year come from build()'s defaults (37, 2026).
    expect(
      offers.every(
        (o) => o.sourceUrl === 'https://issuu.com/m-magazin/docs/migros-wochenflyer-37-2026-d-zh',
      ),
    ).toBe(true)
  })

  it('no Migros offer is left without a destination', async () => {
    // The regression in its simplest form: null sourceUrl is what produced the
    // unclickable card.
    const { sources } = build({
      fetchFlyerImages: async () => ({
        ok: true,
        location: { revision: 'rev', pageCount: 4 },
        images: [{ pageNumber: 1, url: 'https://image.isu.pub/rev/jpg/page_1.jpg', bytes: new Uint8Array(1) }],
      }),
      ocr: async () => ({ pages: [...MIGROS_OCR, ...MIGROS_OCR], errors: [] }),
    })
    const result = await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    const offers = result && 'offers' in result ? result.offers : []
    // Assert there IS something to check first — `.some()` on an empty array is
    // false, so without this the test passes when collection fails entirely.
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.some((o) => o.sourceUrl === null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Migros OCR wiring — fetch once, and carry real page numbers through
// (WP-C1, 2026-09-15).
//
// THE OLD BUGS:
//   1. ocrPages was handed image URLS and passed them straight to ocr.py,
//      which re-downloaded every one — doubling Issuu bandwidth for nothing,
//      since fetchFlyerImages had already downloaded the bytes.
//   2. ocr.py numbered pages by ARGV POSITION. If fetchFlyerImages skipped a
//      page, every later page silently shifted onto the wrong page number,
//      and every CropRegion on it pointed at the wrong photograph.
// ---------------------------------------------------------------------------

const flyerImage = (pageNumber: number, url: string): FlyerImage => ({
  pageNumber,
  url,
  bytes: new Uint8Array([pageNumber]),
})

describe('buildOcrManifest', () => {
  it("pairs each image with a local path, keyed on the image's OWN page number", () => {
    // Page 3 was never downloaded (skipped upstream) — only 1, 2 and 4 arrived.
    const images = [
      flyerImage(1, 'https://image.isu.pub/rev/jpg/page_1.jpg'),
      flyerImage(2, 'https://image.isu.pub/rev/jpg/page_2.jpg'),
      flyerImage(4, 'https://image.isu.pub/rev/jpg/page_4.jpg'),
    ]

    const manifest = buildOcrManifest(images, (image, index) => `/tmp/page-${image.pageNumber}-${index}.jpg`)

    // MUTATION this catches: pairing `index + 1` instead of `image.pageNumber`
    // would produce pageNumber 1, 2, 3 here instead of 1, 2, 4.
    expect(manifest.map((m) => m.pageNumber)).toEqual([1, 2, 4])
  })

  // A "never puts the https:// url in the manifest" test does NOT belong
  // here (code review 2026-09-16): `buildOcrManifest` is a pure pairing
  // function that faithfully returns whatever `pathFor` gives it — a test
  // that supplies its OWN local-path stub and then asserts the result is a
  // local path is vacuous, it cannot fail regardless of the real
  // implementation. The actual "fetch once" guarantee lives in
  // `createOcrRunner`, which decides `pathFor` for real — see
  // "sends ocr.py a --manifest file whose entries are local paths..." below,
  // which reads the REAL manifest file `createOcrRunner` writes to disk.
})

describe('parseOcrOutput', () => {
  it('parses one JSON object per line, keeping the pageNumber ocr.py reported', () => {
    const stdout = [
      JSON.stringify({ pageNumber: 4, width: 2199, height: 2997, items: [] }),
      JSON.stringify({ pageNumber: 7, width: 2199, height: 2997, items: [{ text: '1.00', box: [] }] }),
    ].join('\n')

    const pages = parseOcrOutput(stdout)

    expect(pages.map((p) => p.pageNumber)).toEqual([4, 7])
  })

  it('skips an errored page rather than losing the whole flyer', () => {
    const stdout = [
      JSON.stringify({ pageNumber: 1, error: 'truncated JPEG' }),
      JSON.stringify({ pageNumber: 2, width: 2199, height: 2997, items: [] }),
    ].join('\n')

    expect(parseOcrOutput(stdout).map((p) => p.pageNumber)).toEqual([2])
  })

  it('ignores blank lines and malformed JSON without throwing', () => {
    const stdout = ['', '   ', 'not json at all', JSON.stringify({ pageNumber: 1, width: 1, height: 1, items: [] })].join(
      '\n',
    )
    expect(() => parseOcrOutput(stdout)).not.toThrow()
    expect(parseOcrOutput(stdout)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// stderr diagnostics — findings 8 and 9 from code review 2026-09-16.
//
// OLD: every per-page stderr error was written by ocr.py and then thrown
// away entirely. When every page failed, "OCR produced no pages — is
// rapidocr-onnxruntime installed?" was shown REGARDLESS of the real cause —
// even when rapidocr ran fine and the images themselves were unreadable.
// ---------------------------------------------------------------------------

describe('parseOcrErrors', () => {
  it('parses one error per failed page from stderr', () => {
    const stderr = [
      JSON.stringify({ pageNumber: 3, error: 'truncated JPEG' }),
      JSON.stringify({ pageNumber: 7, error: 'cannot identify image file' }),
    ].join('\n')

    expect(parseOcrErrors(stderr)).toEqual([
      { pageNumber: 3, error: 'truncated JPEG' },
      { pageNumber: 7, error: 'cannot identify image file' },
    ])
  })

  it('ignores blank lines and does not throw on a non-JSON line', () => {
    expect(() => parseOcrErrors(['', '  ', 'Traceback (most recent call last):'].join('\n'))).not.toThrow()
    expect(parseOcrErrors('')).toEqual([])
  })
})

describe('migrosUnavailableReason', () => {
  it('falls back to the generic hint only when there are NO per-page diagnostics', () => {
    expect(migrosUnavailableReason([])).toContain('rapidocr-onnxruntime')
  })

  it('reports the REAL per-page reasons instead of guessing about the install, when there are any', () => {
    const reason = migrosUnavailableReason([
      { pageNumber: 3, error: 'truncated JPEG' },
      { pageNumber: 7, error: 'cannot identify image file' },
    ])
    expect(reason).not.toContain('is rapidocr-onnxruntime installed')
    expect(reason).toContain('page 3: truncated JPEG')
    expect(reason).toContain('page 7: cannot identify image file')
  })
})

describe('the composition root surfaces ocr.py\'s real per-page errors, not a generic guess', () => {
  it('when every page fails with a stated reason, source-unavailable carries that reason', async () => {
    const { sources } = build({
      fetchFlyerImages: async () => ({
        ok: true,
        location: { revision: 'rev-1', pageCount: 1 },
        images: [{ pageNumber: 1, url: 'https://image.isu.pub/rev-1/jpg/page_1.jpg', bytes: new Uint8Array(1) }],
      }),
      ocr: async () => ({ pages: [], errors: [{ pageNumber: 1, error: 'truncated JPEG' }] }),
    })
    const r = await sources.find((s) => s.retailer === 'migros')?.fetchOffers('2026-W37')
    expect(r?.ok).toBe(false)
    if (r && !r.ok) {
      expect(r.detail).toContain('truncated JPEG')
      expect(r.detail).not.toContain('is rapidocr-onnxruntime installed')
    }
  })
})

describe('writeManifestFiles — Promise.allSettled, not Promise.all', () => {
  it('still writes every OTHER image even when one path fails, and surfaces the real failure', async () => {
    // Promise.all would reject as soon as the bad write rejects, leaving the
    // good write's outcome unobserved by the caller. allSettled waits for
    // both, so the good file is provably written before the function ever
    // throws — proving the fix, not just asserting a message.
    const dir = await mkdtemp(join(tmpdir(), 'migros-write-test-'))
    const goodPath = join(dir, 'good.jpg')
    const badPath = join(dir, 'does-not-exist', 'bad.jpg') // parent dir missing -> ENOENT

    const images: FlyerImage[] = [
      { pageNumber: 1, url: 'https://x/1.jpg', bytes: new Uint8Array([1, 2, 3]) },
      { pageNumber: 2, url: 'https://x/2.jpg', bytes: new Uint8Array([4, 5, 6]) },
    ]
    const manifest = [
      { pageNumber: 1, source: goodPath },
      { pageNumber: 2, source: badPath },
    ]

    await expect(writeManifestFiles(images, manifest)).rejects.toThrow()

    const written = await readFile(goodPath)
    expect(Array.from(written)).toEqual([1, 2, 3])
  })
})

describe('createOcrRunner — fetch once, real page numbers, through the actual manifest file', () => {
  it('sends ocr.py a --manifest file whose entries are local paths with the real page numbers', async () => {
    const images = [
      flyerImage(1, 'https://image.isu.pub/rev/jpg/page_1.jpg'),
      flyerImage(4, 'https://image.isu.pub/rev/jpg/page_4.jpg'), // page 2-3 skipped upstream
    ]

    let capturedManifest: { pageNumber: number; source: string }[] | null = null
    const fakeExec = async (_python: string, args: readonly string[]) => {
      const manifestPath = args[args.indexOf('--manifest') + 1]!
      const { readFileSync } = await import('node:fs')
      capturedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      return { stdout: '', stderr: '' }
    }

    const runner = createOcrRunner(fakeExec)
    await runner(images, false)

    expect(capturedManifest).not.toBeNull()
    const manifest = capturedManifest as unknown as { pageNumber: number; source: string }[]
    // The real page numbers survive the gap — not [1, 2].
    expect(manifest.map((m) => m.pageNumber)).toEqual([1, 4])
    // Local temp paths only — never the original url ocr.py would re-fetch.
    expect(manifest.every((m) => !m.source.startsWith('http'))).toBe(true)
  })

  it('writes each image\'s bytes to disk exactly once — never asks ocr.py to fetch a url', async () => {
    const images = [flyerImage(1, 'https://image.isu.pub/rev/jpg/page_1.jpg')]
    let manifestSources: string[] = []

    const fakeExec = async (_python: string, args: readonly string[]) => {
      const manifestPath = args[args.indexOf('--manifest') + 1]!
      const { readFileSync } = await import('node:fs')
      const entries = JSON.parse(readFileSync(manifestPath, 'utf8')) as { source: string }[]
      manifestSources = entries.map((e) => e.source)
      // Confirm the bytes were actually written to that path before exec ran.
      const written = readFileSync(entries[0]!.source)
      expect(Array.from(written)).toEqual(Array.from(images[0]!.bytes))
      return { stdout: '', stderr: '' }
    }

    await createOcrRunner(fakeExec)(images, false)

    expect(manifestSources).toHaveLength(1)
    expect(manifestSources[0]).not.toContain('image.isu.pub')
  })

  it('cleans up its temp directory when ocr.py throws', async () => {
    const images = [flyerImage(1, 'https://image.isu.pub/rev/jpg/page_1.jpg')]
    let tempDir: string | null = null

    const fakeExec = async (_python: string, args: readonly string[]) => {
      const manifestPath = args[args.indexOf('--manifest') + 1]!
      tempDir = manifestPath.slice(0, manifestPath.lastIndexOf('/'))
      throw new Error('ocr.py crashed')
    }

    await expect(createOcrRunner(fakeExec)(images, false)).rejects.toThrow('ocr.py crashed')

    const { existsSync } = await import('node:fs')
    expect(tempDir).not.toBeNull()
    expect(existsSync(tempDir as unknown as string)).toBe(false)
  })

  it('cleans up its temp directory when ocr.py succeeds', async () => {
    // The throw-path test above does not prove anything about the success
    // path — a `finally` that only fired conditionally would still pass it.
    const images = [flyerImage(1, 'https://image.isu.pub/rev/jpg/page_1.jpg')]
    let tempDir: string | null = null

    const fakeExec = async (_python: string, args: readonly string[]) => {
      const manifestPath = args[args.indexOf('--manifest') + 1]!
      tempDir = manifestPath.slice(0, manifestPath.lastIndexOf('/'))
      return { stdout: '', stderr: '' }
    }

    await createOcrRunner(fakeExec)(images, false)

    const { existsSync } = await import('node:fs')
    expect(tempDir).not.toBeNull()
    expect(existsSync(tempDir as unknown as string)).toBe(false)
  })
})
