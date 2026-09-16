import { describe, expect, it } from 'vitest'
import { REVALIDATE_TIMEOUT_MS, pingRevalidateWebhook } from './revalidate-webhook'

const ENV = { WEB_REVALIDATE_URL: 'https://basketch.vercel.app/api/revalidate', WEB_REVALIDATE_SECRET: 'shh' }

function fakeFetch(
  impl: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; statusText: string }>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init)) as typeof fetch
}

describe('never fails the run (F3/N3) — the caller never inspects this function\'s result', () => {
  it('skips the call and logs when either env var is missing', async () => {
    const calls: string[] = []
    await pingRevalidateWebhook({}, { fetch: fakeFetch(async () => ({ ok: true, status: 200, statusText: 'OK' })), log: (m) => calls.push(m) })
    expect(calls.some((m) => /skipped/.test(m))).toBe(true)
  })

  it('never throws when the webhook responds with an error status', async () => {
    await expect(
      pingRevalidateWebhook(ENV, { fetch: fakeFetch(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' })) }),
    ).resolves.toBeUndefined()
  })

  it('never throws when the fetch itself rejects', async () => {
    const failing = fakeFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND basketch.vercel.app')
    })
    await expect(pingRevalidateWebhook(ENV, { fetch: failing })).resolves.toBeUndefined()
  })
})

describe('the webhook cannot hang the run past its deadline (N3, code review round 2)', () => {
  it('passes an AbortSignal — an unbounded call on finishRun\'s unconditional first line could hold the process past RUN_TIMEOUT_MS', async () => {
    let signalSeen: AbortSignal | undefined
    await pingRevalidateWebhook(ENV, {
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        signalSeen = init?.signal ?? undefined
        return { ok: true, status: 200, statusText: 'OK' } as Response
      }) as typeof fetch,
    })
    expect(signalSeen).toBeInstanceOf(AbortSignal)
  })

  it('logs a timeout distinctly, naming the bound, and still resolves without throwing', async () => {
    const calls: string[] = []
    const timingOut = fakeFetch(async () => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      throw err
    })

    await expect(pingRevalidateWebhook(ENV, { fetch: timingOut, log: (m) => calls.push(m) })).resolves.toBeUndefined()
    expect(calls.some((m) => m.includes('timed out') && m.includes(String(REVALIDATE_TIMEOUT_MS)))).toBe(true)
  })
})
