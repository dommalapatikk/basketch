import { describe, expect, it } from 'vitest'
import { isOk, unwrap } from '../../collection/domain/result'
import { DEFAULT_RETRY } from './resilience'
import { createModelPrice } from './spend'
import {
  JUDGE_CHAIN,
  TIER1_CHAIN,
  type ModelSpec,
  createModelCallPolicy,
} from './model-registry'

const PRICE = unwrap(createModelPrice({ inputPerMTokMicros: 50_000, outputPerMTokMicros: 400_000 }))

const spec = (overrides: Partial<ModelSpec> = {}): ModelSpec => ({
  id: 'test-model',
  provider: 'google',
  measuredMacroF1: null,
  measuredOn: null,
  requestsPerDay: 1000,
  requestsPerMinute: 15,
  maxInFlight: 1,
  ...overrides,
})

describe('createModelCallPolicy', () => {
  it('builds a policy from a valid spec', () => {
    const r = createModelCallPolicy(spec())
    expect(isOk(r)).toBe(true)
    const policy = unwrap(r)
    expect(policy).toEqual({
      modelId: 'test-model',
      provider: 'google',
      requestsPerMinute: 15,
      requestsPerDay: 1000,
      maxInFlight: 1,
      retry: DEFAULT_RETRY,
    })
  })

  it('refuses a non-positive requestsPerMinute — a gate with no rate is not a gate', () => {
    const r = createModelCallPolicy(spec({ requestsPerMinute: 0 }))
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('requestsPerMinute')
  })

  it('refuses a maxInFlight below 1 — a gate that admits nothing can never make progress', () => {
    const r = createModelCallPolicy(spec({ maxInFlight: 0 }))
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('maxInFlight')
  })

  it('allows requestsPerDay to be null — not every model publishes a daily cap', () => {
    const r = createModelCallPolicy(spec({ requestsPerDay: null }))
    expect(isOk(r)).toBe(true)
  })

  it('refuses a zero or negative requestsPerDay rather than treating it as unlimited', () => {
    const r = createModelCallPolicy(spec({ requestsPerDay: 0 }))
    expect(isOk(r)).toBe(false)
  })

  it('accepts an overriding retry policy instead of always defaulting', () => {
    const custom = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }
    const policy = unwrap(createModelCallPolicy(spec(), custom))
    expect(policy.retry).toBe(custom)
  })
})

describe('every registry entry is a valid policy (would have been silently ungated otherwise)', () => {
  it.each([...TIER1_CHAIN, ...JUDGE_CHAIN])('$id', (entry) => {
    expect(isOk(createModelCallPolicy(entry))).toBe(true)
  })

  it('every Gemini entry in TIER1_CHAIN is maxInFlight 1 (WP-P5 D1 ruling)', () => {
    for (const m of TIER1_CHAIN) expect(m.maxInFlight).toBe(1)
  })

  it('the primary judge is maxInFlight 4 (WP-P6) — this is the seam that raises judge concurrency', () => {
    // 100 sequential judgements at ~10.3s each took ~1,000s; this is the
    // ONLY registry field classify-graph.ts's judge node relies on — the
    // gate's semaphore (model-gate.ts) already admits up to this many
    // concurrent attempts, so a regression here silently drops concurrency
    // back to sequential without any test in classify-graph.test.ts failing.
    expect(JUDGE_CHAIN[0]?.maxInFlight).toBe(4)
  })

  // WP-P8: every paid OpenRouter model in the registry declares a price AND a
  // maxOutputTokens — the registry-wide guard "the next paid model cannot
  // arrive the way this one did".
  it.each([...JUDGE_CHAIN])('$id declares paid billing (price + maxOutputTokens)', (entry) => {
    expect(entry.provider).toBe('openrouter')
    expect(entry.id.endsWith(':free')).toBe(false)
    expect(entry.billing?.kind).toBe('paid')
    if (entry.billing?.kind === 'paid') {
      expect(entry.billing.maxOutputTokens).toBeGreaterThan(0)
      expect(entry.billing.price.outputPerMTokMicros).toBeGreaterThan(0)
    }
  })

  it('every paid entry produces a ModelCallPolicy with a spend field, derived, never a bare literal', () => {
    for (const entry of JUDGE_CHAIN) {
      const policy = unwrap(createModelCallPolicy(entry))
      expect(policy.spend).toBeDefined()
      expect(policy.spend?.worstCaseCallCostMicros).toBeGreaterThan(0)
    }
    for (const entry of TIER1_CHAIN) {
      const policy = unwrap(createModelCallPolicy(entry))
      expect(policy.spend).toBeUndefined()
    }
  })
})

describe('the billing invariant — WP-P8, RCA item 5', () => {
  const openRouterSpec = (overrides: Partial<ModelSpec> = {}): ModelSpec => ({
    id: 'some-lab/some-model',
    provider: 'openrouter',
    measuredMacroF1: null,
    measuredOn: null,
    requestsPerDay: 1000,
    requestsPerMinute: 20,
    maxInFlight: 1,
    ...overrides,
  })

  it('refuses a paid model without a price — the judge has been paid since 2026-09-10 and nothing knew its price', () => {
    const r = createModelCallPolicy(openRouterSpec()) // no `billing` at all
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('billing')
  })

  it('refuses a paid model without max output tokens', () => {
    const r = createModelCallPolicy(
      openRouterSpec({ billing: { kind: 'paid', price: PRICE, maxOutputTokens: 0 } }),
    )
    expect(isOk(r)).toBe(false)
  })

  it('a `:free` OpenRouter id needs no billing at all', () => {
    const r = createModelCallPolicy(openRouterSpec({ id: 'some-lab/some-model:free' }))
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value.spend).toBeUndefined()
  })

  it('a Google model needs no billing, paid or otherwise', () => {
    const r = createModelCallPolicy(openRouterSpec({ provider: 'google', id: 'gemini-x' }))
    expect(isOk(r)).toBe(true)
  })

  it('accepts a valid paid declaration', () => {
    const r = createModelCallPolicy(openRouterSpec({ billing: { kind: 'paid', price: PRICE, maxOutputTokens: 2_000 } }))
    expect(isOk(r)).toBe(true)
  })
})
