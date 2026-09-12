// live-sources — the composition root.
//
// Every adapter takes its I/O as an injected dependency, which is what makes
// them testable offline against fixtures. The consequence, unnoticed until
// 2026-09-10, is that NOTHING constructed them with real dependencies: the
// collection module was complete, tested, and never once executed in
// production. This file is the missing piece.
//
// It is the ONLY file that knows about both a retailer adapter and the network.
// Everything above it depends on the `OfferSource` port.
//
// All seven verified against live data 2026-09-10:
//   Denner  291 offers        Spar    17 pages / 2,047 words
//   Coop    980 offers        Aldi    40 pages / 5,718 words
//   Volg     25 offers        Lidl   224 products / 18 loyalty pages
//   Migros   24 pages, OCR at native resolution

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { OfferSource } from '../domain/offer-source'
import type { ValidityPeriod } from '../domain/validity-period'
import {
  catalogDataUrl,
  catalogPageUrl,
  createAldiFlyerSource,
  findPdfUrl,
} from './aldi/aldi-flyer-source'
import { createCoopAktionisSource, httpFetchPage as coopFetchPage } from './coop/coop-aktionis-source'
import { createDennerApiSource, httpFetchPage as dennerFetchPage } from './denner/denner-api-source'
import { createLidlFlyerSource, flyerUrl as lidlFlyerUrl } from './lidl/lidl-flyer-source'
import { type OcrPage, createMigrosFlyerSource, issuuDocUrl } from './migros/migros-flyer-source'
import { fetchFlyerImages, pageImageUrl as migrosPageImageUrl } from './migros/issuu-fetcher'
import { fetchFlyerPages, fetchJson, fetchPdfText } from './pdf/flyer-fetcher'
import {
  createSparFlyerSource,
  flyerPageUrl as sparPageUrl,
  flyerPdfUrl as sparPdfUrl,
} from './spar/spar-flyer-source'
import { createVolgHtmlSource, httpFetchPage as volgFetchPage } from './volg/volg-html-source'

const run = promisify(execFile)

/**
 * The network, as an injectable seam.
 *
 * Written after the fact, which is the point: the composition root was built
 * with every fetcher hardcoded, so it could not be tested without the internet.
 * Test-first would have forced this seam open before the file existed — the
 * design flaw and the missing tests are the same omission.
 */
export type Transport = {
  fetchJson: (url: string) => Promise<unknown>
  fetchPdfPages: typeof fetchFlyerPages
  fetchPdfText: typeof fetchPdfText
  fetchFlyerImages: typeof fetchFlyerImages
  ocr: (imageUrls: readonly string[], tiled: boolean) => Promise<OcrPage[]>
  dennerFetchPage: typeof dennerFetchPage
  coopFetchPage: typeof coopFetchPage
  volgFetchPage: typeof volgFetchPage
}

export const LIVE_TRANSPORT: Transport = {
  fetchJson,
  fetchPdfPages: fetchFlyerPages,
  fetchPdfText,
  fetchFlyerImages,
  ocr: ocrPages,
  dennerFetchPage,
  coopFetchPage,
  volgFetchPage,
}

export type LiveSourceOptions = {
  /** ISO week number and year the flyers are published under. */
  kw: number
  year: number
  /** Defaults to the real network. Overridden in tests. */
  transport?: Transport
  fallbackValidity?: ValidityPeriod | null
  /** Politeness gap between paged requests to one retailer. */
  pageDelayMs?: number
  /**
   * Trade 2.7x the OCR time for reference prices ("statt 9.-" instead of
   * "statt 9."). Measured: recovers NO additional sale prices. Off by default.
   */
  migrosTiledOcr?: boolean
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A source that cannot fetch reports it as a failure, never as zero offers. */
function unavailable(retailer: string, reason: string): never {
  throw new Error(`${retailer}: ${reason}`)
}

// ── Migros OCR ───────────────────────────────────────────────────────────────

const OCR_SCRIPT = fileURLToPath(new URL('./migros/ocr.py', import.meta.url))

/**
 * Runs the OCR subprocess over the flyer's page images.
 *
 * Python is used for exactly one thing — rapidocr-onnxruntime has no TypeScript
 * equivalent — and the boundary is a line-delimited JSON contract.
 */
async function ocrPages(imageUrls: readonly string[], tiled: boolean): Promise<OcrPage[]> {
  const python = process.env.MIGROS_OCR_PYTHON ?? 'python3'
  const args = [OCR_SCRIPT, ...(tiled ? ['--tiled'] : []), ...imageUrls]

  const { stdout } = await run(python, args, { maxBuffer: 128 * 1024 * 1024 })

  const pages: OcrPage[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { pageNumber: number; width: number; height: number; items?: unknown[]; error?: string }
      // One unreadable page must not lose the flyer.
      if (parsed.error || !parsed.items) continue
      pages.push({
        pageNumber: parsed.pageNumber,
        width: parsed.width,
        height: parsed.height,
        items: parsed.items as OcrPage['items'],
      })
    } catch {
      // A malformed line is a bug in the subprocess, not a reason to lose the rest.
    }
  }
  return pages
}

// ── The seven ────────────────────────────────────────────────────────────────

export function createLiveSources(options: LiveSourceOptions): OfferSource[] {
  const { kw, year } = options
  const net = options.transport ?? LIVE_TRANSPORT
  const gap = options.pageDelayMs ?? 1_200
  const fallbackValidity = options.fallbackValidity ?? null

  return [
    // ── Denner: own JSON API, the only source publishing real categories ────
    createDennerApiSource({
      fetchPage: async (pageId, page) => {
        if (page > 1) await delay(gap)
        return net.dennerFetchPage(pageId, page)
      },
      fallbackValidity,
    }),

    // ── Coop: aktionis listing pages, everything on the card ────────────────
    createCoopAktionisSource({
      fetchPage: async (page) => {
        if (page > 1) await delay(gap)
        return net.coopFetchPage(page)
      },
    }),

    // ── Volg: own HTML, three sections with different validity windows ──────
    createVolgHtmlSource({ fetchPage: net.volgFetchPage }),

    // ── Spar: flyer PDF via a 302 to cdn.ipaper.io ──────────────────────────
    createSparFlyerSource({
      loadPages: async () => {
        const result = await net.fetchPdfPages(sparPdfUrl(year, kw))
        if (!result.ok) unavailable('spar', result.reason)
        return result.pages
      },
      fallbackValidity,
      pageImageUrl: () => sparPdfUrl(year, kw),
      flyerUrl: sparPageUrl(year, kw),
    }),

    // ── Aldi: Publitas catalogue JSON carries the PDF url ───────────────────
    createAldiFlyerSource({
      loadPages: async () => {
        const data = await net.fetchJson(catalogDataUrl(year, kw))
        const pdf = findPdfUrl(data)
        if (!pdf) unavailable('aldi', 'catalogue carried no PDF url')
        const result = await net.fetchPdfPages(pdf)
        if (!result.ok) unavailable('aldi', result.reason)
        return result.pages
      },
      fallbackValidity,
      flyerUrl: catalogPageUrl(year, kw),
    }),

    // ── Lidl: flyer JSON + PDF text for the Lidl Plus cross-check ───────────
    // The PDF is the ONLY signal that a price is a member price; the JSON
    // carries no loyalty field at all. Publishing one as a normal price is the
    // Art. 3(1)(e) UWG exposure this whole check exists to avoid.
    createLidlFlyerSource({
      fetchFlyer: () => net.fetchJson(lidlFlyerUrl(kw)),
      fetchPdfText: async () => {
        const flyer = (await net.fetchJson(lidlFlyerUrl(kw))) as { flyer?: { pdfUrl?: string }; pdfUrl?: string }
        const url = flyer?.flyer?.pdfUrl ?? flyer?.pdfUrl
        if (!url) unavailable('lidl', 'flyer JSON carried no pdfUrl — the loyalty check cannot run')
        const text = await net.fetchPdfText(url)
        if (!text.ok) unavailable('lidl', text.reason)
        return text.text
      },
    }),

    // ── Migros: Issuu page JPEGs + OCR ──────────────────────────────────────
    // Images are fetched transiently, OCR'd and discarded. Only
    // {pageImageUrl, x, y, w, h} is stored — Art. 2 Abs. 3bis URG protects Swiss
    // product photographs, so the picture is never reproduced on our infrastructure.
    createMigrosSource(options, net),
  ]
}

/**
 * Migros needs the Issuu revision id in TWO places — to download the page
 * images, and to build the `pageImageUrl` each CropRegion points at. The
 * revision is only known after the document is fetched, so it is captured in a
 * closure during `loadPages` and read back by `pageImageUrl`.
 *
 * Getting this wrong is silent: an empty revision yields
 * `https://image.isu.pub//jpg/page_5.jpg`, every crop 404s in the visitor's
 * browser, and the pipeline reports a clean run.
 */
function createMigrosSource(options: LiveSourceOptions, net: Transport): OfferSource {
  const { kw, year } = options
  let revision: string | null = null

  return createMigrosFlyerSource({
    loadPages: async () => {
      const images = await net.fetchFlyerImages(issuuDocUrl(kw, year))
      if (!images.ok) unavailable('migros', images.reason)

      revision = images.location.revision

      const pages = await net.ocr(
        images.images.map((i) => i.url),
        options.migrosTiledOcr ?? false,
      )
      if (pages.length === 0) unavailable('migros', 'OCR produced no pages — is rapidocr-onnxruntime installed?')
      return pages
    },
    fallbackValidity: options.fallbackValidity ?? null,
    flyerUrl: issuuDocUrl(kw, year),
    pageImageUrl: (pageNumber) => {
      // Only ever called after loadPages, for pages that produced offers.
      if (!revision) {
        throw new Error('migros: pageImageUrl called before the Issuu revision was resolved')
      }
      return migrosPageImageUrl(revision, pageNumber)
    },
  })
}
