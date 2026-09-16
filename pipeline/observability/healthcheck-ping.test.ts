import { describe, expect, it } from 'vitest'
import { pingHealthcheck } from './healthcheck-ping'

function fakeFetch(impl: (url: string) => Promise<{ ok: boolean; status: number; statusText: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => impl(String(input))) as typeof fetch
}

describe('a missing HEALTHCHECK_PING_URL warns and never fails the run (AP-5)', () => {
  it('skips the ping and logs a warning when the secret is absent', async () => {
    const calls: string[] = []
    const result = await pingHealthcheck({}, { fetch: fakeFetch(async () => ({ ok: true, status: 200, statusText: 'OK' })), log: (m) => calls.push(m) })

    expect(result).toEqual({ status: 'skipped', reason: expect.stringMatching(/HEALTHCHECK_PING_URL/) })
    expect(calls.some((m) => /WARN/.test(m))).toBe(true)
  })

  it('never throws when the secret is present but the ping fails — a dead-man switch cannot kill the run it watches', async () => {
    const failing = fakeFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND hc-ping.com')
    })

    await expect(pingHealthcheck({ HEALTHCHECK_PING_URL: 'https://hc-ping.com/x' }, { fetch: failing })).resolves.toEqual({
      status: 'failed',
      reason: expect.stringContaining('ENOTFOUND'),
    })
  })

  it('treats a non-2xx response as a failed ping, not a thrown error', async () => {
    const result = await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/x' },
      { fetch: fakeFetch(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' })) },
    )
    expect(result).toEqual({ status: 'failed', reason: expect.stringContaining('500') })
  })

  it('pings the exact URL from the secret when it is present', async () => {
    let calledUrl: string | null = null
    const result = await pingHealthcheck(
      { HEALTHCHECK_PING_URL: 'https://hc-ping.com/abc-123' },
      {
        fetch: fakeFetch(async (url) => {
          calledUrl = url
          return { ok: true, status: 200, statusText: 'OK' }
        }),
      },
    )
    expect(calledUrl).toBe('https://hc-ping.com/abc-123')
    expect(result).toEqual({ status: 'ok' })
  })
})
