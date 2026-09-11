// FlyerFetcher — downloads a weekly flyer PDF and turns it into positioned words.
//
// THE GAP THIS CLOSES: every flyer adapter (Spar, Aldi) takes `loadPages` as an
// injected dependency and was tested entirely against captured fixtures. That is
// correct TDD — and it meant nothing ever downloaded a flyer. The adapters could
// parse a PDF they were handed, but could not obtain one, so the whole
// collection module has never run in production.
//
// A fixture-based suite cannot catch this: it is designed not to touch the
// network. The gap sits outside what the tests measure, not inside a gap in them.
//
// REQUIRES poppler-utils (pdftotext) on the runner. Present on macOS via
// Homebrew; must be installed explicitly in CI, which is why this failed
// locally-invisible until now.

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { type PdfPage, extractWords } from './pdf-words'

const run = promisify(execFile)

/** Honest client, with a contact address, per the project's legal constraints. */
export const USER_AGENT = 'basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)'

/** Swiss flyers run 20–40 MB. Beyond this something is wrong, not big. */
export const MAX_PDF_BYTES = 120 * 1024 * 1024

/** A flyer download that stalls must not hold up the weekly cron. */
export const DOWNLOAD_TIMEOUT_MS = 180_000

export type FlyerFetchResult =
  | { readonly ok: true; readonly pages: PdfPage[]; readonly bytes: number }
  | { readonly ok: false; readonly reason: string }

export type FetchDeps = {
  /** Injected so tests never touch the network. */
  fetchBinary?: (url: string) => Promise<ArrayBuffer>
  /** Injected so tests never shell out to poppler. */
  toPages?: (pdfPath: string) => Promise<PdfPage[]>
}

async function httpGetBinary(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      // SPAR's GetPDF.ashx 302s to cdn.ipaper.io — redirects must be followed.
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_PDF_BYTES) throw new Error(`declared ${declared} bytes exceeds the ${MAX_PDF_BYTES} limit`)

    return await res.arrayBuffer()
  } finally {
    clearTimeout(timer)
  }
}

/** True when the bytes really are a PDF. Retailers serve HTML error pages with 200. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/**
 * Downloads a flyer PDF and extracts positioned words.
 *
 * Never throws — returns a reason. A flyer failing is one retailer missing for a
 * week, not a reason to lose the whole run.
 */
export async function fetchFlyerPages(url: string, deps: FetchDeps = {}): Promise<FlyerFetchResult> {
  const fetchBinary = deps.fetchBinary ?? httpGetBinary
  const toPages = deps.toPages ?? extractWords

  let buffer: ArrayBuffer
  try {
    buffer = await fetchBinary(url)
  } catch (e) {
    return { ok: false, reason: `download failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0) return { ok: false, reason: 'download returned 0 bytes' }
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, reason: `${bytes.length} bytes exceeds the limit` }

  // A retailer serving an HTML error page with HTTP 200 would otherwise reach
  // poppler and fail with something unreadable.
  if (!looksLikePdf(bytes)) {
    const head = Buffer.from(bytes.slice(0, 60)).toString('utf8').replace(/\s+/g, ' ')
    return { ok: false, reason: `not a PDF — starts with "${head}"` }
  }

  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'basketch-flyer-'))
    const path = join(dir, 'flyer.pdf')
    await writeFile(path, bytes)
    const pages = await toPages(path)
    if (pages.length === 0) return { ok: false, reason: 'pdftotext produced no pages — is poppler installed?' }
    return { ok: true, pages, bytes: bytes.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The single most likely CI failure, and the least obvious from the message.
    if (/ENOENT|not found/i.test(message)) {
      return { ok: false, reason: `pdftotext unavailable (install poppler-utils): ${message}` }
    }
    return { ok: false, reason: `extraction failed: ${message}` }
  } finally {
    // Flyers are ~30 MB. A runner that leaks one per source per run fills up.
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Downloads a PDF and extracts PLAIN TEXT — no coordinates.
 *
 * WHY a separate path from fetchFlyerPages: `pdftotext -bbox` CRASHES on LIDL's
 * flyer (poppler std::out_of_range), so per-word coordinates are unavailable for
 * that source. Plain `pdftotext` succeeds on the same file.
 *
 * That is why LIDL's loyalty check is page-level rather than per-product: it is
 * the best available given the crash, not a design preference. Getting this
 * wrong publishes a Lidl Plus member price as if anyone could pay it — the
 * Art. 3(1)(e) UWG exposure the adapter exists to avoid.
 */
export async function fetchPdfText(url: string, deps: FetchDeps = {}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const fetchBinary = deps.fetchBinary ?? httpGetBinary

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await fetchBinary(url))
  } catch (e) {
    return { ok: false, reason: `download failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!looksLikePdf(bytes)) return { ok: false, reason: 'not a PDF' }

  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'basketch-lidl-'))
    const path = join(dir, 'flyer.pdf')
    await writeFile(path, bytes)
    // Deliberately NOT -bbox: it crashes on this file.
    const { stdout } = await run('pdftotext', [path, '-'], { maxBuffer: 64 * 1024 * 1024 })
    if (!stdout.trim()) return { ok: false, reason: 'pdftotext produced no text' }
    return { ok: true, text: stdout }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/ENOENT|not found/i.test(message)) {
      return { ok: false, reason: `pdftotext unavailable (install poppler-utils): ${message}` }
    }
    return { ok: false, reason: `text extraction failed: ${message}` }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Fetches a JSON descriptor — Aldi's catalogue step.
 *
 * The PDF url is then pulled out by `findPdfUrl` in the ALDI adapter, which
 * already handles Publitas' escaped `\u0026` and `\/`. Keeping the extraction
 * there and the transport here preserves the layering: this file knows how to
 * fetch, the adapter knows what the retailer's payload means.
 */
export async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** True when poppler is present. Call once at startup, not per flyer. */
export async function popplerAvailable(): Promise<boolean> {
  try {
    await run('pdftotext', ['-v'])
    return true
  } catch {
    return false
  }
}
