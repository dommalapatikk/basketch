import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSpec } from '../domain/model-registry'
import { probeModels } from './model-probe'

// This file had no tests. It was changed when the AbortController dance it
// hand-rolled twice moved into model-http.ts, so its behaviour is pinned here
// before anyone relies on it again.

const spec = (id: string, provider: 'google' | 'openrouter'): ModelSpec => ({
  id,
  provider,
  measuredMacroF1: null,
  measuredOn: null,
  requestsPerDay: null,
})

const GOOGLE = spec('gemini-3.5-flash-lite', 'google')
const OPENROUTER = spec('openai/gpt-5-nano', 'openrouter')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('probing a chain', () => {
  it('stops at the first model that answers — fallbacks are not probed for nothing', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(String(url))
      return new Response('{}', { status: 200 })
    })

    const results = await probeModels([GOOGLE, OPENROUTER], { google: 'g', openrouter: 'o' })

    expect(results).toEqual([{ id: GOOGLE.id, available: true }])
    expect(urls).toHaveLength(1)
  })

  it('falls through to the next model when the first is retired', async () => {
    // The 2026-09-10 case: listed by models.list, 404 on generateContent.
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('generativelanguage')
        ? new Response('{"error":{"message":"no longer available to new users"}}', { status: 404 })
        : new Response('{}', { status: 200 }),
    )

    const results = await probeModels([GOOGLE, OPENROUTER], { google: 'g', openrouter: 'o' })

    expect(results[0]?.available).toBe(false)
    expect(results[0]?.detail).toContain('HTTP 404')
    expect(results[0]?.detail).toContain('no longer available')
    expect(results[1]).toEqual({ id: OPENROUTER.id, available: true })
  })

  it('reports a missing key without spending a request', async () => {
    let called = false
    vi.stubGlobal('fetch', async () => {
      called = true
      return new Response('{}', { status: 200 })
    })

    const results = await probeModels([OPENROUTER], { google: 'g' })

    expect(results[0]).toEqual({ id: OPENROUTER.id, available: false, detail: 'no openrouter api key' })
    expect(called).toBe(false)
  })

  it('reports a network failure as unavailable rather than throwing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('fetch failed')
    })

    const results = await probeModels([GOOGLE], { google: 'g' })

    expect(results[0]).toEqual({ id: GOOGLE.id, available: false, detail: 'fetch failed' })
  })

  it('bounds itself — a probe that stalls cannot itself stall the run', async () => {
    let seen: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal
      return new Response('{}', { status: 200 })
    })

    await probeModels([GOOGLE], { google: 'g' })

    expect(seen).toBeInstanceOf(AbortSignal)
  })
})
