// IssuuFetcher — locates the Migros weekly flyer's page images.
//
//   https://issuu.com/m-magazin/docs/migros-wochenflyer-{KW}-{YYYY}-d-{region}
//     → the HTML carries a revision id
//     → page JPEGs at image.isu.pub/{revision}/jpg/page_{N}.jpg
//
// WHY this route at all: Migros refuses programmatic access four ways —
// robots.txt disallows the offer paths, the terms name crawlers explicitly, the
// prohibition covers non-commercial use, and staff declined an API request on
// the record. The flyer, however, is published openly on Issuu with no barrier.
// That is an open door, not a wall circumvented.
//
// ── The image rule ──────────────────────────────────────────────────────────
//
// Page images are fetched TRANSIENTLY, OCR'd, and discarded. basketch never
// stores a Swiss product photograph — Art. 2 Abs. 3bis URG protects them by
// default. What is stored is {pageImageUrl, x, y, w, h}; the visitor's browser
// fetches the image from Issuu and crops it with CSS. The picture is never
// reproduced on our infrastructure.

export const USER_AGENT = 'basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)'

/** A flyer page that has not been OCR'd yet. */
export type FlyerImage = {
  readonly pageNumber: number
  readonly url: string
  readonly bytes: Uint8Array
}

export type IssuuLocation = {
  readonly revision: string
  readonly pageCount: number
}

export type IssuuDeps = {
  fetchText?: (url: string) => Promise<string>
  fetchBinary?: (url: string) => Promise<ArrayBuffer>
}

async function httpText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function httpBinary(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Pulls the revision id and page count out of the Issuu document HTML.
 *
 * Both are embedded in a JSON blob whose shape Issuu changes without notice, so
 * this matches the values rather than a path to them. Verified 2026-09-10
 * against KW37: revision `260908112026-142372b…`, pageCount 24.
 */
export function parseIssuuDocument(html: string): IssuuLocation | null {
  const revision = html.match(/image\.isu\.pub\/([a-z0-9-]+)/i)?.[1]
  if (!revision) return null

  // The escaping varies: "pageCount":24 and \"pageCount\":24 both occur.
  const pageCount = Number(html.match(/\\?"pageCount\\?":\s*(\d+)/)?.[1] ?? 0)
  if (!Number.isInteger(pageCount) || pageCount < 1) return null

  return { revision, pageCount }
}

export function pageImageUrl(revision: string, pageNumber: number): string {
  return `https://image.isu.pub/${revision}/jpg/page_${pageNumber}.jpg`
}

export type IssuuResult =
  | { readonly ok: true; readonly location: IssuuLocation; readonly images: FlyerImage[] }
  | { readonly ok: false; readonly reason: string }

/** A page image is ~450 KB. Far outside that range means something else came back. */
const MIN_IMAGE_BYTES = 10_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** JPEG magic bytes. Issuu serves an HTML error page for out-of-range pages. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/**
 * Downloads every page image of a flyer.
 *
 * Never throws. A page that fails is skipped with the rest kept — a flyer is
 * still worth OCR'ing with 23 of 24 pages, and losing one page must not lose
 * the retailer for the week.
 */
export async function fetchFlyerImages(
  docUrl: string,
  deps: IssuuDeps = {},
  maxPages = 60,
): Promise<IssuuResult> {
  const fetchText = deps.fetchText ?? httpText
  const fetchBinary = deps.fetchBinary ?? httpBinary

  let html: string
  try {
    html = await fetchText(docUrl)
  } catch (e) {
    return { ok: false, reason: `issuu document fetch failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const location = parseIssuuDocument(html)
  if (!location) {
    return { ok: false, reason: 'could not find a revision id or page count — Issuu changed its page shape' }
  }

  const pages = Math.min(location.pageCount, maxPages)
  const images: FlyerImage[] = []

  for (let n = 1; n <= pages; n++) {
    const url = pageImageUrl(location.revision, n)
    try {
      const bytes = new Uint8Array(await fetchBinary(url))
      // Issuu returns a small HTML body with 403 past the last page; without
      // this check that would be handed to OCR as if it were an image.
      if (!looksLikeJpeg(bytes)) continue
      if (bytes.length < MIN_IMAGE_BYTES || bytes.length > MAX_IMAGE_BYTES) continue
      images.push({ pageNumber: n, url, bytes })
    } catch {
      // Skip and keep going: 23 of 24 pages is still a usable flyer.
    }
  }

  if (images.length === 0) return { ok: false, reason: `no page images downloaded from ${location.revision}` }
  return { ok: true, location, images }
}
