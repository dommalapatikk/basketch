import { describe, expect, it } from 'vitest'
import { pingHealthcheck } from './healthcheck-ping'

function fakeFetch(
  impl: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; statusText: string }>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init)) as typeof fetch
}

describe('a missing HEALTHCHECK_PING_URL warns and never fails the run (AP-5)', () => {
  it('skips the ping and logs a warning when the secret is absent', async () => {
    const calls: string[] = []
    const result = await pingHealthcheck(
      {},
      0,
      { fetch: fakeFetch(async () => ({ ok: true, status: 200, statusText: 'OK' })), log: (m) => calls.push(m) },
    )

    expect(result).toEqual({ status: 'skipped', reason: expect.stringMatching(/HEALTHCHECK_PING_URL/) })
    expect(calls.some((m) => /WARN/.test(m))).toBe(true)
  })

  it('never throws when the secret is present but the ping fails — a dead-man switch cannot kill the run it watches', async () => {
    const failing = fakeFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND hc-ping.com')
    })

    await expect(pingHealthcheck({ HEALTHCHECK_PING_URL: 'https://hc-ping.com/x' }, 0, { fetch: failing })).resolves.toEqual({
      status: 'failed',
      reason: expect.stringContaining('ENOTFOUND'),
    })
  })

  it('treats a non-2xx response as a failed ping, not a thrown error', async () => {
    const result = await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/x' },
      0,
      { fetch: fakeFetch(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' })) },
    )
    expect(result).toEqual({ status: 'failed', reason: expect.stringContaining('500') })
  })
})

describe('the ping URL carries the exit code (F4) — a bare GET is healthchecks.io\'s SUCCESS signal regardless of how the run went', () => {
  it('pings "<url>/0" on a successful run', async () => {
    let calledUrl: string | null = null
    const result = await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/abc-123' },
      0,
      { fetch: fakeFetch(async (url) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK' } }) },
    )
    expect(calledUrl).toBe('https://hc-ping.com/abc-123/0')
    expect(result).toEqual({ status: 'ok' })
  })

  it('pings "<url>/1" on a failed run — healthchecks.io reads any non-zero suffix as a failure', async () => {
    // THE F4 DEFECT ITSELF: before this, a bare GET was sent regardless of
    // outcome, so an exit-1 run reported "healthy" on the dashboard.
    let calledUrl: string | null = null
    await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/abc-123' },
      1,
      { fetch: fakeFetch(async (url) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK' } }) },
    )
    expect(calledUrl).toBe('https://hc-ping.com/abc-123/1')
  })

  it('pings "<url>/75" on a retryable exit — the retry code is a distinct, real exit code', async () => {
    let calledUrl: string | null = null
    await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/abc-123' },
      75,
      { fetch: fakeFetch(async (url) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK' } }) },
    )
    expect(calledUrl).toBe('https://hc-ping.com/abc-123/75')
  })

  it('does not double a trailing slash on the base URL', async () => {
    let calledUrl: string | null = null
    await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/abc-123/' },
      0,
      { fetch: fakeFetch(async (url) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK' } }) },
    )
    expect(calledUrl).toBe('https://hc-ping.com/abc-123/0')
  })
})

describe('the ping cannot hang the run (F4)', () => {
  it('passes an AbortSignal with a short timeout — undici defaults to a 300s headers timeout otherwise', async () => {
    let signalSeen: AbortSignal | undefined
    await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/x' },
      0,
      {
        fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          signalSeen = init?.signal ?? undefined
          return { ok: true, status: 200, statusText: 'OK' } as Response
        }) as typeof fetch,
      },
    )
    expect(signalSeen).toBeInstanceOf(AbortSignal)
  })
})
