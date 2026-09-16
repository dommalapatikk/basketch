import { describe, expect, it, vi } from 'vitest'

// Isolated in its OWN file: vi.mock('node:fs/promises', ...) replaces the
// module for every importer in this file's graph, including live-sources.ts
// itself. Scoping it to a dedicated file keeps the main live-sources.test.ts
// suite on the real filesystem.

const WRITE_DELAY_MS: Record<string, number> = {}

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    writeFile: vi.fn(async (path: unknown) => {
      const key = String(path)
      if (key.includes('FAIL')) throw new Error('ENOENT: no such file or directory')
      const ms = WRITE_DELAY_MS[key] ?? 0
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
    }),
  }
})

const { writeManifestFiles } = await import('./live-sources')
type FlyerImage = { readonly pageNumber: number; readonly url: string; readonly bytes: Uint8Array }

/**
 * `writeManifestFiles` must wait for EVERY write to settle before throwing —
 * `Promise.allSettled`, not `Promise.all` (code review 2026-09-16: "rm races
 * them and can mask the original error"). `Promise.all` rejects as soon as
 * the FIRST promise rejects, without waiting for a slower sibling write; the
 * caller's `finally` (in `createOcrRunner`) then removes the whole temp
 * directory while that sibling write may still be in flight.
 *
 * Tested by TIMING, not by file content: a slow write (40ms) alongside an
 * immediately-failing one. Under `Promise.all`, the function would reject in
 * a few ms (dominated by the fast failure). Under `Promise.allSettled`, it
 * cannot reject until the slow write has also settled.
 */
describe('writeManifestFiles waits for every write to settle before throwing', () => {
  it('does not reject until the slow write has also finished (Promise.allSettled, not Promise.all)', async () => {
    const slowPath = '/tmp/migros-write-test/slow.jpg'
    const failPath = '/tmp/migros-write-test/FAIL.jpg'
    WRITE_DELAY_MS[slowPath] = 40

    const images: FlyerImage[] = [
      { pageNumber: 1, url: 'https://x/1.jpg', bytes: new Uint8Array([1]) },
      { pageNumber: 2, url: 'https://x/2.jpg', bytes: new Uint8Array([2]) },
    ]
    const manifest = [
      { pageNumber: 1, source: slowPath },
      { pageNumber: 2, source: failPath },
    ]

    const start = Date.now()
    await expect(writeManifestFiles(images, manifest)).rejects.toThrow('ENOENT')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(35)
  })
})
