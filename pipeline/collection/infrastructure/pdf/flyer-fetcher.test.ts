import { describe, expect, it } from 'vitest'
import { MAX_PDF_BYTES, fetchFlyerPages, looksLikePdf } from './flyer-fetcher'
import type { PdfPage } from './pdf-words'

const pdfBytes = (extra = 100) => {
  const b = new Uint8Array(4 + extra)
  b.set([0x25, 0x50, 0x44, 0x46]) // %PDF
  return b.buffer
}

const htmlBytes = () => new TextEncoder().encode('<!DOCTYPE html><html><body>Error 404</body>').buffer

// Real KW37 flyer dimensions, in PDF points.
const page = (n: number): PdfPage => ({ pageNumber: n, widthPt: 502, heightPt: 794, words: [] })

const ok = (pages: PdfPage[]) => async () => pages

describe('looksLikePdf', () => {
  it('accepts a real PDF header', () => {
    expect(looksLikePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true)
  })

  it('rejects an HTML error page', () => {
    // Retailers serve these with HTTP 200. Without this check the bytes reach
    // poppler and fail with something unreadable.
    expect(looksLikePdf(new Uint8Array(new TextEncoder().encode('<!DOCTYPE')))).toBe(false)
  })

  it('rejects empty bytes', () => {
    expect(looksLikePdf(new Uint8Array(0))).toBe(false)
  })
})

describe('fetchFlyerPages — the happy path', () => {
  it('downloads, extracts and reports the size', async () => {
    const r = await fetchFlyerPages('https://example.test/flyer.pdf', {
      fetchBinary: async () => pdfBytes(500),
      toPages: ok([page(1), page(2)]),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pages).toHaveLength(2)
      expect(r.bytes).toBe(504)
    }
  })
})

describe('fetchFlyerPages — failure is a reason, never a throw', () => {
  it('reports a download failure without throwing', async () => {
    // One flyer failing is one retailer missing for a week, not a lost run.
    const r = await fetchFlyerPages('https://example.test/x.pdf', {
      fetchBinary: async () => {
        throw new Error('HTTP 403')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('403')
  })

  it('rejects an HTML error page served with HTTP 200', async () => {
    const r = await fetchFlyerPages('https://example.test/x.pdf', { fetchBinary: async () => htmlBytes() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('not a PDF')
  })

  it('rejects an empty download', async () => {
    const r = await fetchFlyerPages('https://example.test/x.pdf', { fetchBinary: async () => new ArrayBuffer(0) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('0 bytes')
  })

  it('refuses an implausibly large file rather than filling the runner', async () => {
    const r = await fetchFlyerPages('https://example.test/x.pdf', {
      fetchBinary: async () => pdfBytes(MAX_PDF_BYTES + 1),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('exceeds the limit')
  })

  it('names poppler explicitly when it is missing — the likeliest CI failure', async () => {
    // Installed on macOS via Homebrew, absent on a GitHub runner unless added.
    // Without this message the error is "spawn pdftotext ENOENT", which says
    // nothing useful at 05:00 on a Thursday.
    const r = await fetchFlyerPages('https://example.test/x.pdf', {
      fetchBinary: async () => pdfBytes(),
      toPages: async () => {
        throw new Error('spawn pdftotext ENOENT')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('install poppler-utils')
  })

  it('treats zero pages as a failure, not an empty success', async () => {
    const r = await fetchFlyerPages('https://example.test/x.pdf', {
      fetchBinary: async () => pdfBytes(),
      toPages: ok([]),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('no pages')
  })
})
