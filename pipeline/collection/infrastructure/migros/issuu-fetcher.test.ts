import { describe, expect, it } from 'vitest'
import { fetchFlyerImages, looksLikeJpeg, pageImageUrl, parseIssuuDocument } from './issuu-fetcher'

const jpeg = (size = 450_000) => {
  const b = new Uint8Array(size)
  b.set([0xff, 0xd8, 0xff, 0xe0])
  return b.buffer
}

const htmlError = () => new TextEncoder().encode('<html>403 Forbidden</html>').buffer

/** Shape of the real Issuu page, verified 2026-09-10 against KW37. */
const realish = `<html><script>{"publicationId":"x","pageCount":24,"cover":"https://image.isu.pub/260908112026-142372b912b44f6b1a8fad76352897a0/jpg/page_1.jpg"}</script></html>`

describe('parseIssuuDocument', () => {
  it('finds the revision and page count on a real-shaped page', () => {
    const loc = parseIssuuDocument(realish)
    expect(loc?.revision).toBe('260908112026-142372b912b44f6b1a8fad76352897a0')
    expect(loc?.pageCount).toBe(24)
  })

  it('handles escaped JSON — Issuu emits both forms', () => {
    const escaped = `<script>{\\"pageCount\\":18} image.isu.pub/abc123-def</script>`
    expect(parseIssuuDocument(escaped)?.pageCount).toBe(18)
  })

  it('returns null when the revision is missing', () => {
    expect(parseIssuuDocument('<html>{"pageCount":24}</html>')).toBeNull()
  })

  it('returns null when the page count is missing', () => {
    // Better to fail loudly than to guess how many pages a flyer has.
    expect(parseIssuuDocument('<html>image.isu.pub/abc-123</html>')).toBeNull()
  })

  it('returns null for an unrelated page', () => {
    expect(parseIssuuDocument('<html>Not found</html>')).toBeNull()
  })
})

describe('pageImageUrl', () => {
  it('builds the image url Issuu actually serves', () => {
    expect(pageImageUrl('abc-123', 7)).toBe('https://image.isu.pub/abc-123/jpg/page_7.jpg')
  })
})

describe('looksLikeJpeg', () => {
  it('accepts JPEG magic bytes', () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  it('rejects the HTML error body Issuu returns past the last page', () => {
    expect(looksLikeJpeg(new Uint8Array(new TextEncoder().encode('<html>403')))).toBe(false)
  })
})

describe('fetchFlyerImages', () => {
  it('downloads every page of the flyer', async () => {
    const r = await fetchFlyerImages('https://issuu.test/doc', {
      fetchText: async () => realish,
      fetchBinary: async () => jpeg(),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.images).toHaveLength(24)
      expect(r.location.revision).toContain('260908112026')
      expect(r.images[0]?.url).toContain('page_1.jpg')
    }
  })

  it('keeps the rest when one page fails — 23 of 24 is still a usable flyer', async () => {
    let n = 0
    const r = await fetchFlyerImages('https://issuu.test/doc', {
      fetchText: async () => realish,
      fetchBinary: async () => {
        n++
        if (n === 5) throw new Error('ECONNRESET')
        return jpeg()
      },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.images).toHaveLength(23)
  })

  it('skips an HTML error body rather than handing it to OCR', async () => {
    const r = await fetchFlyerImages('https://issuu.test/doc', {
      fetchText: async () => realish,
      fetchBinary: async () => htmlError(),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('no page images')
  })

  it('skips an implausibly small image', async () => {
    const r = await fetchFlyerImages('https://issuu.test/doc', {
      fetchText: async () => realish,
      fetchBinary: async () => jpeg(500),
    })
    expect(r.ok).toBe(false)
  })

  it('reports when Issuu changes its page shape rather than guessing', async () => {
    const r = await fetchFlyerImages('https://issuu.test/doc', { fetchText: async () => '<html>redesign</html>' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('changed its page shape')
  })

  it('reports a document fetch failure', async () => {
    const r = await fetchFlyerImages('https://issuu.test/doc', {
      fetchText: async () => {
        throw new Error('HTTP 404')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('404')
  })

  it('respects the page ceiling', async () => {
    const many = realish.replace('"pageCount":24', '"pageCount":500')
    const r = await fetchFlyerImages('https://issuu.test/doc', { fetchText: async () => many, fetchBinary: async () => jpeg() }, 10)
    expect(r.ok && r.images.length).toBe(10)
  })
})
