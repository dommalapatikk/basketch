import { describe, expect, it } from 'vitest'
import { unwrap } from '../../collection/domain/result'
import { createModelCallPolicy, type ModelSpec } from '../domain/model-registry'
import { createModelPrice, usdMicros, usdToMicros } from '../domain/spend'
import { GOOGLE_429_PER_MINUTE_BODY } from '../__fixtures__/google-429'
import { ModelHttpError, createModelGate } from './model-gate'
import { postJson } from './model-http'

const spec = (overrides: Partial<ModelSpec> = {}): ModelSpec => ({
  id: 'gemini-3.5-flash-lite',
  provider: 'google',
  measuredMacroF1: null,
  measuredOn: null,
  requestsPerDay: 1000,
  requestsPerMinute: 15,
  maxInFlight: 1,
  ...overrides,
})

/** A clock that advances only when the gate sleeps — no real waiting, ever. */
function fakeClock() {
  let ms = 0
  const sleeps: number[] = []
  return {
    now: () => ms,
    sleep: async (delay: number) => {
      sleeps.push(delay)
      ms += delay
    },
    sleeps,
  }
}

const ok = async <T,>(value: T) => value

describe('classifier, reflector and enricher share ONE Gemini quota — backfill fired ~250 requests in 20s and got 255×429 (run 34833209176)', () => {
  it('paces to the SAME per-minute ceiling regardless of which caller is asking', async () => {
    const clock = fakeClock()
    const gate = createModelGate(unwrap(createModelCallPolicy(spec({ requestsPerMinute: 15 }))), clock)
    // checkRate paces to 90% of the published limit — floor(15 * 0.9) = 13.

    // Three DIFFERENT logical callers — exactly resilientClassifier (classify),
    // gemini-judge's reflector, and gemini-enricher's backfill — all making
    // calls through the same injected gate, as composition.ts now wires them.
    const classifierCalls = Array.from({ length: 5 }, () => () => ok('classified'))
    const reflectorCalls = Array.from({ length: 3 }, () => () => ok('reflected'))
    const enricherBurst = Array.from({ length: 6 }, () => () => ok('enriched'))
    const allCalls = [...classifierCalls, ...reflectorCalls, ...enricherBurst] // 14 total

    for (const call of allCalls) await gate.request(call)

    // 14 requests against a ceiling of 13: if the three callers had their OWN
    // limiter (today's bug), none of them would ever see the other two and
    // NONE would pace. One shared gate must pace exactly once, on the 14th.
    expect(clock.sleeps).toHaveLength(1)
    expect(clock.sleeps[0]).toBeGreaterThan(0)
  })

  it('a burst that would have fired ~250 requests in 20s instead paces every one of them', async () => {
    const clock = fakeClock()
    const gate = createModelGate(unwrap(createModelCallPolicy(spec({ requestsPerMinute: 15 }))), clock)

    const burst = Array.from({ length: 40 }, () => () => ok('enriched'))
    for (const call of burst) await gate.request(call)

    // Every call succeeded (none were refused with a 429 the way the old,
    // uncoordinated enricher was), and the simulated clock actually advanced
    // past one minute to accommodate all 40 — proof they were PACED, not
    // fired back-to-back.
    expect(clock.now()).toBeGreaterThan(60_000)
  })
})

describe('backfill does not begin until the last classification chunk has finished', () => {
  it('a second caller queues behind maxInFlight: 1 instead of racing the first', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec({ maxInFlight: 1 }))), {
      now: () => 0,
      sleep: async () => {},
    })

    const order: string[] = []
    // A plain mutable holder, not a bare `let`, so the closure assignment
    // below is unambiguous to read back after the awaits.
    const control: { finish: (() => void) | null } = { finish: null }
    const classifyChunk = () =>
      new Promise<string>((resolve) => {
        order.push('classify:start')
        control.finish = () => {
          order.push('classify:end')
          resolve('classified')
        }
      })
    const backfillEnrich = async () => {
      order.push('backfill:start')
      return 'enriched'
    }

    const classifyPromise = gate.request(classifyChunk)
    await Promise.resolve()
    await Promise.resolve()

    const backfillPromise = gate.request(backfillEnrich)
    await Promise.resolve()
    await Promise.resolve()

    // The classify chunk is still running (its promise is unresolved), and
    // maxInFlight: 1 must hold the ONE slot — backfill's attempt function has
    // not been invoked yet.
    expect(order).toEqual(['classify:start'])

    control.finish?.()
    await classifyPromise
    await backfillPromise

    expect(order).toEqual(['classify:start', 'classify:end', 'backfill:start'])
  })
})

describe('reading the provider through ModelHttpError', () => {
  it("obeys a real rate-limited-short retryDelay end to end, not the 30s guess cap", async () => {
    const clock = fakeClock()
    const gate = createModelGate(unwrap(createModelCallPolicy(spec())), clock)

    let calls = 0
    const attempt = async () => {
      calls++
      if (calls === 1) throw new ModelHttpError('HTTP 429: requests per minute exceeded', 429, 57_000)
      return 'ok'
    }

    const result = await gate.request(attempt)
    expect(result).toBe('ok')
    expect(calls).toBe(2)
    // Not capped at DEFAULT_RETRY.maxDelayMs (30s) — PROVIDER_WAIT_CEILING_MS
    // (90s) applies to rate-limited-short, so 57s survives untouched.
    expect(clock.sleeps).toContain(57_000)
  })

  it('never retries a daily quota — no wait recovers it within the run', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec())), fakeClock())
    let calls = 0
    const attempt = async () => {
      calls++
      throw new ModelHttpError('HTTP 429: requests per day exceeded', 429, null)
    }

    await expect(gate.request(attempt)).rejects.toThrow(/rate-limited-daily/)
    expect(calls).toBe(1)

    // F5 (code review): asserting only the rejection let this pass even if
    // recordFailure were never called — the CIRCUIT is what stops every
    // later caller from paying for the same exhausted day. A daily quota
    // opens it immediately, same as resilient-classifier.ts used to.
    await expect(gate.request(async () => 'ok')).rejects.toThrow(/circuit-open/)
    expect(calls).toBe(1) // the second attempt() was never even invoked
  })

  it('gives up after the policy\'s attempt limit rather than retrying forever', async () => {
    const clock = fakeClock()
    const policy = unwrap(
      createModelCallPolicy(spec(), { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 }),
    )
    const gate = createModelGate(policy, clock)

    let calls = 0
    const attempt = async () => {
      calls++
      throw new ModelHttpError('HTTP 503', 503, null)
    }

    await expect(gate.request(attempt)).rejects.toThrow(/503/)
    expect(calls).toBe(2) // maxAttempts: 2 means two calls, not one plus two retries
  })
})

describe("a content failure from ONE caller must not stop every other caller's requests (F2)", () => {
  it("an oversized-prompt 400 does not open the circuit — it would let one enricher batch stop the whole run's classification", async () => {
    // MEASURED: Gemini answers an oversized prompt with HTTP 400
    // INVALID_ARGUMENT. The enricher's batches vary in size (grouped by
    // sub-category); the classifier's are a fixed 25. Before this fix, one
    // bad enricher batch opened the circuit this gate now shares with the
    // classifier and the reflector, and every classify() call for the rest
    // of the run failed `circuit-open` — a content complaint about one
    // request costing the entire run's categorisation.
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())

    await expect(
      gate.request(async () => {
        throw new ModelHttpError('HTTP 400: {"error":{"code":400,"status":"INVALID_ARGUMENT"}}', 400, null)
      }),
    ).rejects.toThrow(/permanent/)

    // A later, unrelated call (the classifier, say) must still be allowed
    // through — the circuit must NOT have opened.
    const result = await gate.request(async () => 'classified')
    expect(result).toBe('classified')
  })

  it('a 401 (bad key) still opens the circuit immediately — that IS model-wide, unlike a 400', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())

    await expect(
      gate.request(async () => {
        throw new ModelHttpError('HTTP 401: invalid api key', 401, null)
      }),
    ).rejects.toThrow(/permanent/)

    await expect(gate.request(async () => 'ok')).rejects.toThrow(/circuit-open/)
  })

  it('a 404 (retired model) still opens the circuit immediately — every future call with this model id fails identically', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())

    await expect(
      gate.request(async () => {
        throw new ModelHttpError('HTTP 404: This model is no longer available to new users', 404, null)
      }),
    ).rejects.toThrow(/model-gone/)

    await expect(gate.request(async () => 'ok')).rejects.toThrow(/circuit-open/)
  })

  it('five consecutive 400s still do NOT open the circuit — content failures are excluded entirely, not just individually forgiven', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())
    const badRequest = async () => {
      throw new ModelHttpError('HTTP 400: INVALID_ARGUMENT', 400, null)
    }

    for (let i = 0; i < 5; i++) await expect(gate.request(badRequest)).rejects.toThrow(/permanent/)

    await expect(gate.request(async () => 'still open for business')).resolves.toBe('still open for business')
  })
})

describe('the circuit breaker (shared across every caller of this model)', () => {
  it('opens after five consecutive failures and stops calling the provider', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())
    const alwaysFails = async () => {
      throw new ModelHttpError('HTTP 503', 503, null)
    }

    for (let i = 0; i < 5; i++) {
      await expect(gate.request(alwaysFails)).rejects.toThrow()
    }

    let called = false
    await expect(
      gate.request(async () => {
        called = true
        return 'ok'
      }),
    ).rejects.toThrow(/circuit-open/)
    expect(called).toBe(false)
  })

  it('resets on success', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec(), { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 })), fakeClock())
    const fails = async () => {
      throw new ModelHttpError('HTTP 503', 503, null)
    }
    await expect(gate.request(fails)).rejects.toThrow()
    await expect(gate.request(() => ok('ok'))).resolves.toBe('ok')
    // Circuit reset — three more failures should not open it (needs five).
    await expect(gate.request(fails)).rejects.toThrow()
    await expect(gate.request(fails)).rejects.toThrow()
    await expect(gate.request(() => ok('ok'))).resolves.toBe('ok')
  })
})

// REGRESSION, end to end through postJson + a real ModelGate, using the ACTUAL
// Google response body captured in production (not a hand-written 35-char
// string, per HANDOVER §4's "coverage theatre" note about the OLD version of
// this exact test at resilient-classifier.test.ts:114-133).
describe('the full stack obeys a real 429 body instead of guessing', () => {
  it('waits 37s, not the old 30s guess cap, on a real Google per-minute 429', async () => {
    const clock = fakeClock()
    const gate = createModelGate(unwrap(createModelCallPolicy(spec())), clock)

    let calls = 0
    const p = postJson({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent',
      body: '{}',
      gate,
      fetchImpl: async () => {
        calls++
        if (calls > 1) return new Response('{"candidates":[]}', { status: 200 })
        return new Response(GOOGLE_429_PER_MINUTE_BODY, { status: 429 })
      },
    })

    await expect(p).resolves.toEqual({ candidates: [] })
    expect(clock.sleeps).toEqual([37_000])
  })
})

describe('empty and trivial cases', () => {
  it('an immediate success never sleeps', async () => {
    const clock = fakeClock()
    const gate = createModelGate(unwrap(createModelCallPolicy(spec())), clock)
    await gate.request(() => ok('ok'))
    expect(clock.sleeps).toHaveLength(0)
  })
})

// WP-P8 (RCA item 5): the judge has been paid since 2026-09-10 with no
// per-call cap and no money measured anywhere. `maxRappen: 500` could never
// trip because `rappen` was never passed to `recordSpend`. These prove the
// REPLACEMENT actually gates a call, black-box, through the same `request()`
// every adapter calls — not just that `spend.ts`'s pure functions are correct
// in isolation (see `spend.test.ts` for that).
describe('the spend ledger (WP-P8) — a paid call cannot be made without a reservation', () => {
  const price = unwrap(createModelPrice({ inputPerMTokMicros: 50_000, outputPerMTokMicros: 400_000 }))
  // 2,000 output tokens × $0.40/M = 800 micros worst case per call.
  const paidPolicy = (overrides: Partial<ModelSpec> = {}, retryOverrides = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }) =>
    unwrap(
      createModelCallPolicy(
        spec({
          id: 'openai/gpt-5-nano',
          provider: 'openrouter',
          requestsPerMinute: 20,
          billing: { kind: 'paid', price, maxOutputTokens: 2_000 },
          ...overrides,
        }),
        retryOverrides,
      ),
    )

  it('refuses a paid call outright when the ledger cannot cover the worst case — never even reaches the network', async () => {
    const gate = createModelGate(paidPolicy(), { ...fakeClock(), spendCeilingMicros: unwrap(usdToMicros(0.0005)) }) // 500 micros < 800
    let attempted = false

    await expect(
      gate.request(async () => {
        attempted = true
        return { ok: true }
      }),
    ).rejects.toThrow(/spend-exhausted/)

    expect(attempted).toBe(false)
  })

  it('settles a failed call at the worst case — the judge recorded 0 tokens on any error', async () => {
    // Ceiling covers exactly ONE worst-case call.
    const gate = createModelGate(paidPolicy(), { ...fakeClock(), spendCeilingMicros: unwrap(usdToMicros(0.0008)) })

    await expect(
      gate.request(async () => {
        throw new ModelHttpError('HTTP 500', 500, null)
      }),
    ).rejects.toThrow()

    // If the failed call had settled at 0 (the old defect), the ceiling would
    // still have 800 micros free and this second call would go through. It
    // must be refused instead — proof the first call cost its full worst case.
    await expect(gate.request(async () => ({ ok: true }))).rejects.toThrow(/spend-exhausted/)
  })

  it('a successful call settles at its REAL reported cost, freeing room for the next call', async () => {
    // Ceiling covers 1.25x one worst-case call (1,000 micros vs 800).
    const gate = createModelGate(paidPolicy(), { ...fakeClock(), spendCeilingMicros: unwrap(usdMicros(1_000)) })

    // First call reports a REAL cost of only 100 micros via usage.cost.
    await gate.request(async () => ({ usage: { cost: 0.0001 } }))

    // Remaining should now be 900 — enough for a second 800-micro reservation.
    // Had the gate settled the first call at its 800 worst case instead (the
    // defect this replaces), only 200 would remain and this would be refused.
    let secondAttempted = false
    await gate.request(async () => {
      secondAttempted = true
      return { usage: { cost: 0.0001 } }
    })
    expect(secondAttempted).toBe(true)
  })

  it('effective concurrency never lets reservations exceed what remains', async () => {
    // maxInFlight 2, but the ceiling covers only ONE worst-case call.
    const gate = createModelGate(paidPolicy({ maxInFlight: 2 }), { ...fakeClock(), spendCeilingMicros: unwrap(usdToMicros(0.0008)) })

    // Reservation happens synchronously, before the in-flight slot is even
    // requested — so the second call is refused immediately, not queued
    // behind the first and then double-spent once both are in flight.
    const first = gate.request(() => new Promise((resolve) => setTimeout(() => resolve({ usage: { cost: 0 } }), 0)))
    await expect(gate.request(async () => ({ ok: true }))).rejects.toThrow(/spend-exhausted/)
    await first
  })

  it('a free-tier policy (no billing) never reserves anything — Gemini calls are unaffected', async () => {
    const gate = createModelGate(unwrap(createModelCallPolicy(spec())), fakeClock())
    // No spendCeilingMicros supplied at all, and the call still succeeds —
    // proof the reservation step is skipped entirely for a free-tier policy.
    await expect(gate.request(() => ok('free'))).resolves.toBe('free')
  })
})
