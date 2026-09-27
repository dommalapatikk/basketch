import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * D3, docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §6 F2 /
 * docs/rca/2026-09-27-architect-stale-expired-deals.md §6 D3: the webhook
 * the pipeline calls at the end of a run used to pass the `'hours'` cache-
 * life profile to `revalidateTag`, which is stale-while-revalidate — the
 * NEXT visitor after a pipeline run could still be served the previous
 * run's data. Next 16 docs (`revalidateTag.md`): "for webhooks ... that need
 * immediate expiration, pass `{ expire: 0 }`". This is exactly that case —
 * an external system (the pipeline) telling the site new data exists.
 */

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const ORIGINAL_SECRET = process.env.REVALIDATE_SECRET

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.resetModules()
  process.env.REVALIDATE_SECRET = ORIGINAL_SECRET
})

function postRequest(body?: unknown, authHeader?: string): Request {
  return new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/revalidate', () => {
  it('expires the tag immediately ({ expire: 0 }), not with a stale-while-revalidate profile', async () => {
    process.env.REVALIDATE_SECRET = 'test-secret'
    const { revalidateTag } = await import('next/cache')
    const { POST } = await import('./route')

    const response = await POST(postRequest({ tag: 'deals' }, 'Bearer test-secret'))

    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('deals', { expire: 0 })
  })

  it('defaults to the "deals" tag when the body omits one', async () => {
    process.env.REVALIDATE_SECRET = 'test-secret'
    const { revalidateTag } = await import('next/cache')
    const { POST } = await import('./route')

    await POST(postRequest(undefined, 'Bearer test-secret'))

    expect(revalidateTag).toHaveBeenCalledWith('deals', { expire: 0 })
  })

  it('rejects a missing or wrong bearer token with 401 and does not revalidate', async () => {
    process.env.REVALIDATE_SECRET = 'test-secret'
    const { revalidateTag } = await import('next/cache')
    const { POST } = await import('./route')

    const response = await POST(postRequest({ tag: 'deals' }, 'Bearer wrong-secret'))

    expect(response.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('returns 500 and does not revalidate when REVALIDATE_SECRET is not configured', async () => {
    process.env.REVALIDATE_SECRET = ''
    const { revalidateTag } = await import('next/cache')
    const { POST } = await import('./route')

    const response = await POST(postRequest({ tag: 'deals' }, 'Bearer anything'))

    expect(response.status).toBe(500)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
