import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_BODY_CHARS, REQUEST_TIMEOUT_MS, classifyFailure, decideRetry } from '../domain/resilience'
import { GOOGLE_429_BODY, PER_DAY_OFFSET, RETRY_DELAY_OFFSET } from '../__fixtures__/google-429'
import { createNoopGate } from '../../test-support/gate'
import { ModelHttpError } from './model-gate'
import { postJson } from './model-http'

/** A provider that accepts the request and then says nothing, ever — the 873s case. */
const stalls: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    // Real fetch rejects when its signal aborts. A fake that ignored the signal
    // would be testing a provider we do not have.
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  })

const responds = (body: string, status = 200): typeof fetch => async () => new Response(body, { status })

/** The noop gate: every test below is about postJson's OWN behaviour, not the gate's. */
const gate = () => createNoopGate()

describe('every call is bounded', () => {
  it('rejects a stalled provider instead of waiting on the OS TCP timeout', async () => {
    const started = Date.now()
    await expect(
      postJson({ url: 'https://example.test/x', body: '{}', timeoutMs: 30, fetchImpl: stalls, gate: gate() }),
    ).rejects.toThrow(/timeout/i)
    // The point of the whole fix: it came back, and it came back promptly.
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('names the budget it exceeded, so a CI log says how long it waited', async () => {
    await expect(
      postJson({ url: 'https://example.test/x', body: '{}', timeoutMs: 25, fetchImpl: stalls, gate: gate() }),
    ).rejects.toThrow('timeout: no response within 25ms')
  })

  it('applies REQUEST_TIMEOUT_MS when no budget is given — there is no unbounded call', async () => {
    let seen: AbortSignal | null | undefined
    await postJson({
      url: 'https://example.test/x',
      body: '{}',
      gate: gate(),
      fetchImpl: async (_u, init) => {
        seen = init?.signal
        return new Response('{}', { status: 200 })
      },
    })
    expect(seen).toBeInstanceOf(AbortSignal)
    // PostJsonOptions has no "no timeout" option to pass, by design.
    expect(REQUEST_TIMEOUT_MS).toBe(60_000)
  })
})

// VERIFIED, not assumed. The abort path was designed to need NO new retry code:
// it has to land in the branch resilience.ts already handles.
describe('an abort joins the retry path that already exists', () => {
  it('classifies a timeout as transient', async () => {
    const message = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      timeoutMs: 20,
      fetchImpl: stalls,
      gate: gate(),
    }).then(
      () => 'did not reject',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )

    expect(classifyFailure(null, message)).toBe('transient')
    expect(decideRetry('transient', 0).retry).toBe(true)
  })

  it('carries no stray 3-digit token that resilient-classifier would read as an HTTP status', () => {
    // statusFrom() matches /HTTP (\d{3})|"code":\s*(\d{3})|\b(\d{3})\b/. A budget
    // that happened to render as three digits would be misread as a status code.
    const message = `timeout: no response within ${REQUEST_TIMEOUT_MS}ms`
    expect(message).not.toMatch(/\b\d{3}\b/)
  })
})

describe('a failed response keeps enough body to act on', () => {
  it('preserves Google’s retryDelay, which sits far past the old 200-char cut', async () => {
    expect(RETRY_DELAY_OFFSET).toBeGreaterThan(200)
    expect(RETRY_DELAY_OFFSET).toBeLessThan(ERROR_BODY_CHARS)

    const message = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: responds(GOOGLE_429_BODY, 429),
      gate: gate(),
    }).then(
      () => 'did not reject',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )

    expect(message).toContain('HTTP 429')
    expect(message.match(/retryDelay["\s:]+([\d.]+s)/)?.[1]).toBe('37s')
  })

  it('preserves the PerDay quota id, so a 20/day cap is not retried as a blip', async () => {
    expect(PER_DAY_OFFSET).toBeGreaterThan(200)

    const message = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: responds(GOOGLE_429_BODY, 429),
      gate: gate(),
    }).then(
      () => 'did not reject',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )

    // Truncated at 200 this read as 'rate-limited-short' and we retried a cap
    // that no backoff recovers inside a run.
    expect(classifyFailure(429, message)).toBe('rate-limited-daily')
  })

  it('still truncates — an error message is not a place to paste a megabyte', async () => {
    const message = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: responds('x'.repeat(50_000), 500),
      gate: gate(),
    }).then(
      () => 'did not reject',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )
    expect(message.length).toBeLessThan(ERROR_BODY_CHARS + 100)
  })
})

// WP-P5 / RCA item 6 (architect review §A.3): postJson threw only
// `HTTP ${status}: ${body}` and dropped every response header. OpenRouter's
// retry instruction is ONLY in the `Retry-After` header — never in the body —
// so for OpenRouter it could not be read at all, and `resilience.ts`'s own
// claim ("the provider's own instruction always wins") was false for every
// OpenRouter call.
describe("reads OpenRouter's Retry-After header — postJson dropped it", () => {
  const respondsWithHeaders = (status: number, headers: Record<string, string>): typeof fetch => async () =>
    new Response('{"error":"rate limited"}', { status, headers })

  it('attaches the header value to the thrown ModelHttpError as retryAfterMs', async () => {
    const caught = await postJson({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      body: '{}',
      fetchImpl: respondsWithHeaders(429, { 'Retry-After': '12' }),
      gate: gate(),
    }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(caught).toBeInstanceOf(ModelHttpError)
    expect((caught as ModelHttpError).retryAfterMs).toBe(12_000)
    expect((caught as ModelHttpError).status).toBe(429)
  })

  it('reads Retry-After given as an HTTP date, not just seconds', async () => {
    const future = new Date(Date.now() + 5_000)
    const caught = await postJson({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      body: '{}',
      fetchImpl: respondsWithHeaders(429, { 'Retry-After': future.toUTCString() }),
      gate: gate(),
    }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(caught).toBeInstanceOf(ModelHttpError)
    expect((caught as ModelHttpError).retryAfterMs).toBeGreaterThan(0)
    expect((caught as ModelHttpError).retryAfterMs).toBeLessThanOrEqual(5_000)
  })

  it('falls back to null, not a guess, when the provider sends no retry instruction at all', async () => {
    const caught = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: respondsWithHeaders(500, {}),
      gate: gate(),
    }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(caught).toBeInstanceOf(ModelHttpError)
    expect((caught as ModelHttpError).retryAfterMs).toBeNull()
  })

  it("still reads Google's body-embedded retryDelay when there is no header", async () => {
    const caught = await postJson({
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: responds(GOOGLE_429_BODY, 429),
      gate: gate(),
    }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(caught).toBeInstanceOf(ModelHttpError)
    expect((caught as ModelHttpError).retryAfterMs).toBe(37_000)
  })
})

describe('the happy path', () => {
  it('returns the parsed JSON body', async () => {
    const j = await postJson({ url: 'https://example.test/x', body: '{}', fetchImpl: responds('{"a":1}'), gate: gate() })
    expect(j).toEqual({ a: 1 })
  })

  it('sends the body verbatim and merges caller headers over the JSON content type', async () => {
    let init: RequestInit | undefined
    await postJson({
      url: 'https://example.test/x',
      body: '{"model":"m"}',
      headers: { Authorization: 'Bearer k' },
      gate: gate(),
      fetchImpl: async (_u, i) => {
        init = i
        return new Response('{}', { status: 200 })
      },
    })
    expect(init?.body).toBe('{"model":"m"}')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer k' })
  })
})

// WP-P5 architecture test: "no model call can be made without a gate".
// The type system already makes `gate` non-optional; this proves it is ALSO
// enforced at runtime, so a caller that bypasses TypeScript (`as any`, plain
// JS, a future refactor that loosens the type) still cannot slip an ungated
// call through the one choke point every model call passes through.
describe('no model call can be made without a gate', () => {
  it('refuses to run when gate is omitted, even past the type checker', async () => {
    const options = { url: 'https://example.test/x', body: '{}', fetchImpl: responds('{}') } as Record<string, unknown>
    await expect(postJson(options as Parameters<typeof postJson>[0])).rejects.toThrow(/gate is required/i)
  })

  it('never reaches the network when the gate is missing', async () => {
    let called = false
    const options = {
      url: 'https://example.test/x',
      body: '{}',
      fetchImpl: async () => {
        called = true
        return new Response('{}', { status: 200 })
      },
    } as Record<string, unknown>

    await postJson(options as Parameters<typeof postJson>[0]).catch(() => {})
    expect(called).toBe(false)
  })
})

// THE INVARIANT, enforced rather than remembered.
//
// A `signal:` repeated at four call sites is a convention: the next adapter
// omits it and nothing notices until a weekly run hangs. This test is the reason
// the seam exists — it fails the build the moment anyone reintroduces a raw
// model call. pipeline/ has no ESLint config, so a test is the lint rule.
describe('model-http is the only place this pipeline calls a model over HTTP', () => {
  const INFRASTRUCTURE = join(import.meta.dirname, '.')
  const SEAM = 'model-http.ts'

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
    })

  it('finds the adapters it is supposed to be guarding', () => {
    // Guard the guard: a glob that silently matched nothing would pass forever.
    expect(sourceFiles(INFRASTRUCTURE).length).toBeGreaterThanOrEqual(6)
  })

  it('no other infrastructure file calls fetch directly', () => {
    const offenders = sourceFiles(INFRASTRUCTURE)
      .filter((path) => !path.endsWith(SEAM))
      .filter((path) => /(^|[^.\w])fetch\s*\(/.test(readFileSync(path, 'utf8')))

    expect(offenders, `call postJson() from model-http.ts instead — it carries the timeout: ${offenders.join(', ')}`).toEqual(
      [],
    )
  })
})
