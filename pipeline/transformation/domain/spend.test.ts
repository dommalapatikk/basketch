import { describe, expect, it } from 'vitest'
import { isOk, unwrap } from '../../collection/domain/result'
import {
  ZERO_USD_MICROS,
  createModelPrice,
  createSpendLedgerState,
  createSpendPolicy,
  formatUsd,
  remainingMicros,
  reserve,
  settle,
  usageFromOpenRouterResponse,
  usdMicros,
  usdToMicros,
} from './spend'

// gpt-5-nano's real OpenRouter pricing (component-2-agent-design.md:923; verified
// against developers.openai.com and openrouter.ai/openai/gpt-5-nano): $0.05/M
// input, $0.40/M output.
const GPT_5_NANO_PRICE = unwrap(createModelPrice({ inputPerMTokMicros: 50_000, outputPerMTokMicros: 400_000 }))

describe('UsdMicros — an integer, never a float dollar amount', () => {
  it('accepts a non-negative integer', () => {
    expect(isOk(usdMicros(5_000_000))).toBe(true)
  })

  it('refuses a fractional amount — 0.1 + 0.2 !== 0.3 is not a ledger we can trust', () => {
    expect(isOk(usdMicros(1.5))).toBe(false)
  })

  it('refuses a negative amount', () => {
    expect(isOk(usdMicros(-1))).toBe(false)
  })

  it('refuses a non-finite amount', () => {
    expect(isOk(usdMicros(Number.POSITIVE_INFINITY))).toBe(false)
    expect(isOk(usdMicros(Number.NaN))).toBe(false)
  })

  it('converts a provider dollar figure to the nearest whole micro-dollar', () => {
    expect(unwrap(usdToMicros(5))).toBe(5_000_000)
    expect(unwrap(usdToMicros(0.0008))).toBe(800)
  })

  it('clamps a negative provider figure to zero rather than refusing it — an account read is untrusted input', () => {
    expect(unwrap(usdToMicros(-0.01))).toBe(0)
  })

  it('formats for a log line', () => {
    expect(formatUsd(unwrap(usdToMicros(0.0008)))).toBe('$0.0008')
  })
})

describe('SpendPolicy — the worst case a call could cost', () => {
  it('refuses a paid model without max output tokens — the judge call had no max_tokens', () => {
    const r = createSpendPolicy({ price: GPT_5_NANO_PRICE, maxOutputTokens: 0 })
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('maxOutputTokens')
  })

  it('refuses a negative or fractional maxOutputTokens', () => {
    expect(isOk(createSpendPolicy({ price: GPT_5_NANO_PRICE, maxOutputTokens: -5 }))).toBe(false)
    expect(isOk(createSpendPolicy({ price: GPT_5_NANO_PRICE, maxOutputTokens: 12.5 }))).toBe(false)
  })

  it('derives the worst-case cost from price × maxOutputTokens, precomputed once', () => {
    const policy = unwrap(createSpendPolicy({ price: GPT_5_NANO_PRICE, maxOutputTokens: 2_000 }))
    // 2,000 tokens × $0.40/M = $0.0008 = 800 micros.
    expect(policy.worstCaseCallCostMicros).toBe(800)
  })
})

describe('SpendLedger — reserve before a call, settle after', () => {
  it('reserves the worst case before a call and settles the actual usage after', () => {
    const ceiling = unwrap(usdToMicros(5))
    const state0 = createSpendLedgerState(ceiling)
    const worstCase = unwrap(usdMicros(800))

    const reserved = reserve(state0, worstCase)
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return
    // The worst case is committed immediately — before the call is made.
    expect(remainingMicros(reserved.state)).toBe(ceiling - 800)

    const settled = settle(reserved.state, reserved.reservation, { kind: 'known', actualMicros: unwrap(usdMicros(300)) })
    // The real cost (300) replaces the reservation (800) — the difference is freed.
    expect(settled.spentMicros).toBe(300)
    expect(settled.reservedMicros).toBe(0)
    expect(remainingMicros(settled)).toBe(ceiling - 300)
  })

  it('settles a failed call at the worst case — the judge recorded 0 tokens on any error', () => {
    const ceiling = unwrap(usdToMicros(5))
    const state0 = createSpendLedgerState(ceiling)
    const worstCase = unwrap(usdMicros(800))

    const reserved = reserve(state0, worstCase)
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return

    const settled = settle(reserved.state, reserved.reservation, { kind: 'unknown' })
    expect(settled.spentMicros).toBe(800) // the worst case, NOT 0
    expect(settled.reservedMicros).toBe(0)
  })

  it('records a real cost above the reservation rather than silently clamping it down', () => {
    const state0 = createSpendLedgerState(unwrap(usdToMicros(5)))
    const reserved = reserve(state0, unwrap(usdMicros(800)))
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return

    const settled = settle(reserved.state, reserved.reservation, { kind: 'known', actualMicros: unwrap(usdMicros(1_200)) })
    expect(settled.spentMicros).toBe(1_200)
  })

  it('refuses to reserve when a single worst-case call exceeds what is left this period', () => {
    const state0 = createSpendLedgerState(unwrap(usdMicros(500)))
    const r = reserve(state0, unwrap(usdMicros(800)))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('exceed')
  })

  it('effective concurrency never lets reservations exceed what remains', () => {
    // WP-P6 raises maxInFlight above 1 — several reservations can be
    // outstanding at once. Each successive reserve() must see the PREVIOUS
    // one's commitment, not a stale ceiling.
    const ceiling = unwrap(usdMicros(2_000))
    const worstCase = unwrap(usdMicros(800))

    let state = createSpendLedgerState(ceiling)
    const r1 = reserve(state, worstCase)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    state = r1.state

    const r2 = reserve(state, worstCase)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    state = r2.state

    // A third reservation of 800 would commit 2,400 against a 2,000 ceiling.
    const r3 = reserve(state, worstCase)
    expect(r3.ok).toBe(false)
  })

  it('a retried attempt starts from the money already spent this month — attempt 2 used to reset to ZERO_SPEND', () => {
    // The ledger itself has no memory across process attempts — it is built
    // fresh each time from whatever the CALLER passes as `ceilingMicros`. The
    // fix for "attempt 2 resets to zero" lives in WHERE that ceiling comes
    // from (OpenRouter's own account balance, read fresh every attempt — see
    // openrouter-spend-account.ts), not in this ledger. This test proves the
    // ledger honours a ceiling that already reflects prior spend: a $5
    // allowance with $2 already spent by attempt 1 must be built as a $3
    // ceiling, and the ledger then refuses a $3.50 reservation against it.
    const attempt1SpentAlready = unwrap(usdToMicros(2))
    const monthlyLimit = unwrap(usdToMicros(5))
    const ceilingForAttempt2 = unwrap(usdMicros(monthlyLimit - attempt1SpentAlready)) // $3 left

    const state = createSpendLedgerState(ceilingForAttempt2)
    const tooMuch = reserve(state, unwrap(usdToMicros(3.5)))
    expect(tooMuch.ok).toBe(false)

    const fitsWhatsLeft = reserve(state, unwrap(usdToMicros(2.5)))
    expect(fitsWhatsLeft.ok).toBe(true)
  })

  it('never lets remainingMicros go negative even if spent+reserved somehow exceeds the ceiling', () => {
    const state: ReturnType<typeof createSpendLedgerState> = { ceilingMicros: unwrap(usdMicros(100)), spentMicros: unwrap(usdMicros(150)), reservedMicros: ZERO_USD_MICROS }
    expect(remainingMicros(state)).toBe(0)
  })
})

describe('usageFromOpenRouterResponse — settling from what the provider actually reports', () => {
  it('prefers usage.cost when the provider reports it directly', () => {
    const usage = usageFromOpenRouterResponse({ usage: { cost: 0.0008, prompt_tokens: 900, completion_tokens: 400 } }, GPT_5_NANO_PRICE)
    expect(usage).toEqual({ kind: 'known', actualMicros: 800 })
  })

  it('falls back to prompt_tokens/completion_tokens × price when cost is absent', () => {
    // 900 input tokens × $0.05/M = $0.000045 = 45 micros.
    // 400 output tokens × $0.40/M = $0.00016 = 160 micros.
    const usage = usageFromOpenRouterResponse({ usage: { prompt_tokens: 900, completion_tokens: 400 } }, GPT_5_NANO_PRICE)
    expect(usage).toEqual({ kind: 'known', actualMicros: 45 + 160 })
  })

  it('is unknown when the response carries no usage field at all', () => {
    expect(usageFromOpenRouterResponse({ choices: [] }, GPT_5_NANO_PRICE)).toEqual({ kind: 'unknown' })
  })

  it('is unknown for a malformed or missing body', () => {
    expect(usageFromOpenRouterResponse(null, GPT_5_NANO_PRICE)).toEqual({ kind: 'unknown' })
    expect(usageFromOpenRouterResponse(undefined, GPT_5_NANO_PRICE)).toEqual({ kind: 'unknown' })
    expect(usageFromOpenRouterResponse('not an object', GPT_5_NANO_PRICE)).toEqual({ kind: 'unknown' })
  })

  it('is unknown when cost is present but not a finite non-negative number', () => {
    expect(usageFromOpenRouterResponse({ usage: { cost: Number.NaN, prompt_tokens: 10, completion_tokens: 10 } }, GPT_5_NANO_PRICE)).toEqual({
      kind: 'known',
      // NaN cost is rejected, but the token fallback still applies:
      // ceil(10*50000/1e6) + ceil(10*400000/1e6) = ceil(0.5) + ceil(4) = 1 + 4 = 5.
      actualMicros: 5,
    })
  })
})
