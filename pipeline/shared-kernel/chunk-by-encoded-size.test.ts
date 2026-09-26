// MOVED from transformation/infrastructure/supabase/supabase-classification-cache.test.ts
// (WP-1c code review, M-1) along with the code it tests — see that file's
// header, and chunk-by-encoded-size.ts's header, for why this is now a shared
// kernel used by both the classification cache AND product-resolve.ts.
import { describe, expect, it } from 'vitest'
import { chunkByEncodedSize, encodedSize } from './chunk-by-encoded-size'

/**
 * THE DEFECT, run 34703713179: `LOOKUP_CHUNK = 200` counted KEYS, not bytes.
 * Swiss product names carry umlauts, `%`, `&` and spaces that percent-encode
 * to 3-6 bytes each, so two chunks of 200 keys could differ by kilobytes —
 * which is why exactly 3 of 8 failed, every time, while the other 5 were
 * fine — the failures are the chunks with the longest names.
 *
 * A count-based chunk cannot express the constraint. Bytes can.
 */
describe('chunkByEncodedSize keeps every request under the transport budget', () => {
  it('never emits a chunk whose encoded size exceeds the budget', () => {
    const keys = Array.from({ length: 500 }, (_, i) => `produkt-nr-${i}-mit-umlauten-äöü-und-prozent-%|t3|p1|s1`)
    for (const chunk of chunkByEncodedSize(keys, 2_000)) {
      expect(encodedSize(chunk)).toBeLessThanOrEqual(2_000)
    }
  })

  it('loses no keys and keeps their order', () => {
    const keys = ['a', 'b', 'c', 'd', 'e']
    expect(chunkByEncodedSize(keys, 12).flat()).toEqual(keys)
  })

  it('gives SMALLER chunks for long accented names than for short ascii ones', () => {
    // The mechanism behind "only some chunks failed".
    const short = Array.from({ length: 200 }, (_, i) => `k${i}`)
    const long = Array.from({ length: 200 }, (_, i) => `denner schweinsnierstück ${i} 25% rabatt aktion|t3|p1|s1`)
    expect(chunkByEncodedSize(long, 4_000).length).toBeGreaterThan(
      chunkByEncodedSize(short, 4_000).length,
    )
  })

  it('still emits a single oversized key rather than dropping it', () => {
    // Cannot be split. Better to attempt and fail loudly than to silently omit
    // a product from the lookup and re-process it forever.
    const huge = 'x'.repeat(5_000)
    const chunks = chunkByEncodedSize([huge], 1_000)
    expect(chunks).toEqual([[huge]])
  })

  it('returns nothing for no keys', () => {
    expect(chunkByEncodedSize([], 1_000)).toEqual([])
  })

  it('measures BYTES, not characters — an umlaut is not one byte on the wire', () => {
    expect(encodedSize(['ä'])).toBeGreaterThan(1)
  })

  it('respects maxKeys even when the byte budget has room left', () => {
    const keys = Array.from({ length: 10 }, (_, i) => `k${i}`)
    const chunks = chunkByEncodedSize(keys, 100_000, 3)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3)
    }
    expect(chunks.flat()).toEqual(keys)
  })

  it('defaults to the 5,000-byte / 150-key budget when none is given', () => {
    const keys = Array.from({ length: 200 }, (_, i) => `product-${i}`)
    for (const chunk of chunkByEncodedSize(keys)) {
      expect(chunk.length).toBeLessThanOrEqual(150)
      expect(encodedSize(chunk)).toBeLessThanOrEqual(5_000)
    }
  })
})
