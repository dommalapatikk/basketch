import { describe, expect, it } from 'vitest'
import { createOpenRouterSpendAccount, readingFromBody } from './openrouter-spend-account'

describe('readingFromBody — the pure shape logic behind GET /api/v1/key', () => {
  it('reads a capped key using limit_remaining directly', () => {
    const r = readingFromBody({ data: { limit: 5, limit_remaining: 3.5, usage_monthly: 1.5 } })
    expect(r).toEqual({ kind: 'capped', remainingMicros: 3_500_000, limitMicros: 5_000_000 })
  })

  it('falls back to limit - usage_monthly when limit_remaining is absent', () => {
    const r = readingFromBody({ data: { limit: 5, usage_monthly: 2 } })
    expect(r).toEqual({ kind: 'capped', remainingMicros: 3_000_000, limitMicros: 5_000_000 })
  })

  it('runs without the judge when the key has no provider limit (AP-10) — limit: null means uncapped', () => {
    expect(readingFromBody({ data: { limit: null } })).toEqual({ kind: 'uncapped' })
  })

  it('is unreadable when the response carries no `data` field at all', () => {
    const r = readingFromBody({})
    expect(r.kind).toBe('unreadable')
  })

  it('is unreadable when there is no way to compute what remains', () => {
    const r = readingFromBody({ data: { limit: 5 } }) // no limit_remaining, no usage_monthly
    expect(r.kind).toBe('unreadable')
  })

  it('clamps a spent-past-limit key to zero remaining rather than a negative amount', () => {
    const r = readingFromBody({ data: { limit: 5, usage_monthly: 7 } })
    expect(r).toEqual({ kind: 'capped', remainingMicros: 0, limitMicros: 5_000_000 })
  })

  it('is unreadable for a malformed body', () => {
    expect(readingFromBody(null).kind).toBe('unreadable')
    expect(readingFromBody('not json').kind).toBe('unreadable')
  })
})

describe('createOpenRouterSpendAccount — goes through the gate\'s bounded request primitive', () => {
  it('reads limit, limit_remaining and usage_monthly from a real (faked) HTTP round trip', async () => {
    const account = createOpenRouterSpendAccount({
      apiKey: 'k',
      fetchImpl: async () => new Response(JSON.stringify({ data: { limit: 5, limit_remaining: 4.2, usage_monthly: 0.8 } }), { status: 200 }),
    })
    expect(await account.remaining()).toEqual({ kind: 'capped', remainingMicros: 4_200_000, limitMicros: 5_000_000 })
  })

  it('reports unreadable, not zero remaining, when the endpoint fails', async () => {
    const account = createOpenRouterSpendAccount({
      apiKey: 'k',
      fetchImpl: async () => new Response('{"error":"unauthorized"}', { status: 401 }),
    })
    const reading = await account.remaining()
    expect(reading.kind).toBe('unreadable')
  })

  it('reports unreadable, not zero remaining, on a network failure', async () => {
    const account = createOpenRouterSpendAccount({
      apiKey: 'k',
      fetchImpl: async () => {
        throw new Error('fetch failed')
      },
    })
    expect((await account.remaining()).kind).toBe('unreadable')
  })

  it('sends the API key as a Bearer token', async () => {
    let seenAuth: string | null | undefined
    const account = createOpenRouterSpendAccount({
      apiKey: 'secret-key',
      fetchImpl: async (_u, init) => {
        seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization
        return new Response(JSON.stringify({ data: { limit: null } }), { status: 200 })
      },
    })
    await account.remaining()
    expect(seenAuth).toBe('Bearer secret-key')
  })
})
