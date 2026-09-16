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
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { OfferSource } from '../domain/offer-source'
import type { ValidityPeriod } from '../domain/validity-period'
import {
  catalogDataUrl,
  catalogPageUrl,
  createAldiFlyerSource,
  findPageImageUrls,
  findPdfUrl,
} from './aldi/aldi-flyer-source'
import { createCoopAktionisSource, httpFetchPage as coopFetchPage } from './coop/coop-aktionis-source'
import { createDennerApiSource, httpFetchPage as dennerFetchPage } from './denner/denner-api-source'
import { createLidlFlyerSource, flyerUrl as lidlFlyerUrl } from './lidl/lidl-flyer-source'
import { type OcrPage, createMigrosFlyerSource, issuuDocUrl } from './migros/migros-flyer-source'
import { type FlyerImage, fetchFlyerImages, pageImageUrl as migrosPageImageUrl } from './migros/issuu-fetcher'
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
  /**
   * Takes the ALREADY-DOWNLOADED page images (real page numbers, real bytes —
   * see the "fetch once" note on ocrPages below), never a list of URLs to
   * fetch again. `errors` carries ocr.py's own per-page stderr diagnostics
   * (code review 2026-09-16) — previously discarded even when every page
   * failed, leaving only a generic "is rapidocr installed?" guess.
   */
  ocr: (images: readonly FlyerImage[], tiled: boolean) => Promise<{ pages: OcrPage[]; errors: readonly OcrPageError[] }>
  dennerFetchPage: typeof dennerFetchPage
  coopFetchPage: typeof coopFetchPage
  volgFetchPage: typeof volgFetchPage
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

/**
 * Builds the "no pages" diagnostic from ocr.py's own stderr, when it has
 * one. The generic "is rapidocr-onnxruntime installed?" guess is kept as a
 * fallback ONLY for a total failure with no per-page diagnostics at all
 * (rapidocr really did fail to import, or the manifest was empty) — code
 * review 2026-09-16: that guess was shown even when rapidocr ran fine and
 * every page individually failed for a real, stated reason.
 */
export function migrosUnavailableReason(errors: readonly { pageNumber: number; error: string }[]): string {
  if (errors.length === 0) return 'OCR produced no pages — is rapidocr-onnxruntime installed?'
  const detail = errors.map((e) => `page ${e.pageNumber}: ${e.error}`).join('; ')
  return `OCR produced no pages — every page failed: ${detail}`
}

// ── Migros OCR ───────────────────────────────────────────────────────────────
//
// FETCH ONCE (WP-C1, 2026-09-15). fetchFlyerImages already downloaded every
// page's bytes — that download IS "one fetch per store per week". The OLD
// code handed ocr.py the ORIGINAL https:// urls, and ocr.py's load_image()
// re-fetched every one of them, doubling Issuu bandwidth for nothing: the
// bytes it needed were already sitting in `images[i].bytes`.
//
// This also carries REAL page numbers through. ocr.py numbered pages by their
// position in argv; if fetchFlyerImages skipped a page (a 404, say), the
// surviving images shift down one slot and every later CropRegion silently
// points at the WRONG page's photograph. Passing the manifest's own
// pageNumber for each temp file, instead of relying on array position, is
// what the manifest contract exists to fix — see build_manifest in ocr.py.

const OCR_SCRIPT = fileURLToPath(new URL('./migros/ocr.py', import.meta.url))

/** One page written to a temp file, ready for ocr.py's --manifest argument. */
export type OcrManifestEntry = { readonly pageNumber: number; readonly source: string }

/**
 * Pairs each downloaded image with a local file path, preserving the image's
 * OWN page number — never the array index. Pure: the disk write is the
 * caller's job (`pathFor`), so this is unit-testable without touching a
 * filesystem.
 */
export function buildOcrManifest(
  images: readonly FlyerImage[],
  pathFor: (image: FlyerImage, index: number) => string,
): OcrManifestEntry[] {
  return images.map((image, index) => ({ pageNumber: image.pageNumber, source: pathFor(image, index) }))
}

type OcrLineResult = { pageNumber: number; width: number; height: number; items?: unknown[]; error?: string }

/** One page ocr.py could not read, with its own diagnostic (from stderr). */
export type OcrPageError = { readonly pageNumber: number; readonly error: string }

/** Parses ocr.py's line-delimited JSON stdout into OcrPage[]. Pure. */
export function parseOcrOutput(stdout: string): OcrPage[] {
  const pages: OcrPage[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as OcrLineResult
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

/**
 * Parses ocr.py's line-delimited JSON STDERR into per-page errors. Pure.
 *
 * Code review 2026-09-16: this was previously never read at all — a page
 * that failed left no trace beyond `process_entries`' own stderr write, and
 * "OCR produced no pages" always blamed a missing rapidocr install, even
 * when rapidocr ran fine and every page individually errored (a corrupt
 * download, an unreadable JPEG).
 */
export function parseOcrErrors(stderr: string): OcrPageError[] {
  const errors: OcrPageError[] = []
  for (const line of stderr.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as OcrLineResult
      if (parsed.error) errors.push({ pageNumber: parsed.pageNumber, error: parsed.error })
    } catch {
      // A non-JSON stderr line (a python traceback, say) is not a per-page
      // error we can attribute to one page — logged, not parsed.
      console.warn(`[migros] ocr.py stderr (unparsed): ${line}`)
    }
  }
  return errors
}

type ExecPython = (
  python: string,
  args: readonly string[],
  opts: { maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>

/**
 * Writes every image's bytes to its manifest path. `Promise.allSettled`, not
 * `Promise.all` (code review 2026-09-16): `Promise.all` rejects as soon as
 * ONE write fails while the others are still in flight, and the caller's
 * `finally` then removes the temp directory concurrently with writes still
 * running — a second, unrelated ENOENT/EBUSY can mask the real first error.
 * Waiting for every write to settle first, then surfacing the FIRST failure,
 * keeps the error message honest and the cleanup race-free.
 */
export async function writeManifestFiles(images: readonly FlyerImage[], manifest: readonly OcrManifestEntry[]): Promise<void> {
  const results = await Promise.allSettled(images.map((image, index) => writeFile(manifest[index]!.source, image.bytes)))
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
}

/**
 * Builds the OCR runner. `exec` is injected so tests can assert what would
 * have been sent to the subprocess (the manifest file's own content — real
 * page numbers, local paths, never the original urls) without spawning
 * python or touching the network.
 */
export function createOcrRunner(
  exec: ExecPython,
): (images: readonly FlyerImage[], tiled: boolean) => Promise<{ pages: OcrPage[]; errors: readonly OcrPageError[] }> {
  return async (images, tiled) => {
    const python = process.env.MIGROS_OCR_PYTHON ?? 'python3'
    const dir = await mkdtemp(join(tmpdir(), 'migros-ocr-'))
    try {
      const manifest = buildOcrManifest(images, (image, index) => join(dir, `page-${image.pageNumber}-${index}.jpg`))
      await writeManifestFiles(images, manifest)

      const manifestPath = join(dir, 'manifest.json')
      await writeFile(manifestPath, JSON.stringify(manifest))

      const args = [OCR_SCRIPT, ...(tiled ? ['--tiled'] : []), '--manifest', manifestPath]
      const { stdout, stderr } = await exec(python, args, { maxBuffer: 128 * 1024 * 1024 })
      const errors = parseOcrErrors(stderr)
      for (const e of errors) {
        // Structured, one line per failed page — not the page's full OCR
        // payload, and never silently discarded on an otherwise-successful run.
        console.warn(`[migros] page ${e.pageNumber} unreadable: ${e.error}`)
      }
      return { pages: parseOcrOutput(stdout), errors }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

const ocrPages = createOcrRunner(run)

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
    // NO pageImageUrl. QA 2026-09-16 (defect 3): this used to be
    // `() => sparPdfUrl(year, kw)` — the flyer's PDF DOWNLOAD endpoint, not a
    // page image, so all 76 live SPAR crops pointed at a 404 `GetPDF.ashx` a
    // browser `<img>` cannot render even when it resolves. SPAR's real
    // per-page image scheme is genuinely unknown: the iPaper Enrichments JSON
    // that would carry it returned 403 to every probe in
    // docs/research-raw-2026-09-07/report12_line398.md, "contents unknown" —
    // not evidence to build a URL from. Omitting pageImageUrl leaves `image`
    // null (an honest empty card) instead of a src that always fails.
    createSparFlyerSource({
      loadPages: async () => {
        const result = await net.fetchPdfPages(sparPdfUrl(year, kw))
        if (!result.ok) unavailable('spar', result.reason)
        return result.pages
      },
      fallbackValidity,
      flyerUrl: sparPageUrl(year, kw),
    }),

    // ── Aldi: Publitas catalogue JSON carries the PDF url AND, per page, the
    // hash path of that page's own image (findPageImageUrls) — both read from
    // the SAME data.json fetched once below, never a second request.
    //
    // QA 2026-09-16 (defect 2): this dependency was never supplied at all, so
    // every one of 127 live ALDI offers carried `image: null` despite the
    // parser fully supporting a CropRegion. See findPageImageUrls' own header
    // for the Publitas doc citation the url shape comes from.
    createAldiSource(options, net),

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

      // The already-downloaded images go through, real page numbers and all —
      // never re-derived from a url list. See the "FETCH ONCE" note above.
      const { pages, errors } = await net.ocr(images.images, options.migrosTiledOcr ?? false)
      if (pages.length === 0) unavailable('migros', migrosUnavailableReason(errors))
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

/**
 * ALDI's data.json carries BOTH the PDF url and every page's own image hash
 * path — one fetch, two uses. The map is built once the response is in hand
 * and read back by `pageImageUrl`, the same "capture during loadPages, read
 * back later" shape `createMigrosSource` uses for its revision id.
 *
 * A page with no entry in the map (an unmatched hash, or Publitas having
 * changed shape) gets `''` back, not a thrown error or an invented url — see
 * `cropRegionFromPoints`: an empty pageImageUrl fails its own `isHttpUrl`
 * check, so that offer degrades to `image: null`, exactly like before this
 * fix, rather than one broken page taking the whole retailer down.
 */
function createAldiSource(options: LiveSourceOptions, net: Transport): OfferSource {
  const { kw, year } = options
  let pageImages: ReadonlyMap<number, string> = new Map()

  return createAldiFlyerSource({
    loadPages: async () => {
      const data = await net.fetchJson(catalogDataUrl(year, kw))
      const pdf = findPdfUrl(data)
      if (!pdf) unavailable('aldi', 'catalogue carried no PDF url')

      pageImages = findPageImageUrls(data)

      const result = await net.fetchPdfPages(pdf)
      if (!result.ok) unavailable('aldi', result.reason)
      return result.pages
    },
    fallbackValidity: options.fallbackValidity ?? null,
    flyerUrl: catalogPageUrl(year, kw),
    pageImageUrl: (pageNumber) => pageImages.get(pageNumber) ?? '',
  })
}
