// Model registry — surviving the day a provider retires a model.
//
// THE FAILURE THIS PREVENTS, observed 2026-09-10:
//
//   models.list  →  "gemini-2.5-flash-lite"  ✅ listed as available
//   generateContent → 404 "This model is no longer available to new users."
//
// A listing is not availability. Our config named a model as a bare string, so
// the day Google retires the current one, the weekly run fails at 05:00 on a
// Thursday with nobody watching and no fallback.
//
// Two defences:
//   1. an ORDERED CHAIN, not a single name — the run degrades instead of dying
//   2. a STARTUP PROBE — fail in the first ten seconds with a clear message,
//      rather than after 40 minutes of retries

import type { Result } from '../../collection/domain/result'
import { err, ok, unwrap } from '../../collection/domain/result'
import { DEFAULT_RETRY, type RetryPolicy } from './resilience'
import { type ModelPrice, type SpendPolicy, createModelPrice, createSpendPolicy } from './spend'

/**
 * `unwrap` is safe here for the same reason `createModelCallPolicy` already
 * treats a `ModelSpec` as trusted: these two prices are our own literal data,
 * verified against openrouter.ai on 2026-09-16, never untrusted input. A
 * malformed literal is a defect in THIS file, caught at module load — not 40
 * minutes into a run.
 */
function unsafePrice(input: { inputPerMTokMicros: number; outputPerMTokMicros: number }): ModelPrice {
  return unwrap(createModelPrice(input))
}

/**
 * WP-P8 (RCA item 5). `openai/gpt-5-nano` has been a PAID OpenRouter model
 * since 2026-09-10 and nothing in the registry knew its price — `Budget`'s
 * money field had no producer. `billing` makes that unrepresentable for the
 * NEXT paid model too: `createModelCallPolicy` below refuses to build a
 * policy for any OpenRouter model whose id does not end in `:free` unless it
 * declares `paid` billing with both a price and a positive `maxOutputTokens`.
 */
export type ModelBilling =
  | { readonly kind: 'free-tier' }
  | { readonly kind: 'paid'; readonly price: ModelPrice; readonly maxOutputTokens: number }

export type ModelSpec = {
  readonly id: string
  readonly provider: 'google' | 'openrouter'
  /**
   * Measured macro-F1 on the Denner benchmark, or null if never measured.
   * A model nobody has scored should not silently become the primary.
   */
  readonly measuredMacroF1: number | null
  readonly measuredOn: string | null
  readonly requestsPerDay: number | null
  /**
   * WP-P5. Measured 2026-09-10 against a real key (same figure as
   * `resilience.ts`'s `KNOWN_LIMITS` — this is the one place it turns into a
   * gate). The free-tier Gemini variants share one project-level quota, so the
   * same number applies to every entry in `TIER1_CHAIN` even though only
   * `gemini-3.5-flash-lite` has been probed live.
   */
  readonly requestsPerMinute: number
  /**
   * How many calls to this model may be in flight at once.
   *
   * WP-P5 ruling (D1): Gemini is 1 — every existing caller (classifier,
   * reflector, enricher) already runs sequentially, and 1 keeps that true by
   * construction instead of by accident. WP-P6 raises the judge's entry to a
   * bounded N once concurrent judging ships; this field is the seam it edits
   * — no other file changes.
   */
  readonly maxInFlight: number
  readonly note?: string
  /**
   * WP-P8. Optional so every existing free-tier Gemini entry (and every test
   * fixture built before this WP) is untouched — `createModelCallPolicy` only
   * demands it for an OpenRouter model that is not `:free`. Absent means
   * "free-tier" for any model where that is actually true; it is NEVER
   * inferred for a non-`:free` OpenRouter id.
   */
  readonly billing?: ModelBilling
}

/**
 * Tier-1 chain, best first. Every entry was called with a real key on
 * 2026-09-10; scores are from the 291-product benchmark or its 65-product
 * stratified sample.
 */
export const TIER1_CHAIN: readonly ModelSpec[] = [
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    measuredMacroF1: 0.855,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    requestsPerMinute: 15,
    maxInFlight: 1,
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    measuredMacroF1: 0.842,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    requestsPerMinute: 15,
    maxInFlight: 1,
    note: 'one batch lost to a network error during measurement; score is on 266 of 291',
  },
  {
    id: 'gemini-flash-lite-latest',
    provider: 'google',
    measuredMacroF1: null,
    measuredOn: null,
    requestsPerDay: 1000,
    requestsPerMinute: 15,
    maxInFlight: 1,
    note: 'floating alias — survives a retirement, but the model behind it can change without notice',
  },
]

/**
 * WP-P8. Both prices verified 2026-09-16 against openrouter.ai's own pricing
 * pages (per-model `/pricing`) — the same $0.05/$0.40 for gpt-5-nano already
 * cited in `component-2-agent-design.md:923` and OpenAI's own docs.
 * `maxOutputTokens` is a conservative PRE-benchmark default (~2-2.5x the
 * realistic ~0.3-1.5k output tokens this WP measured uncapped) — AP-11's
 * 291-row re-benchmark, which requires a real paid call this WP could not
 * make, must confirm it before it is trusted at full production traffic. See
 * `docs/decisions/<this-WP's-ADR>.md`.
 */
const GPT_5_NANO_PRICE = { inputPerMTokMicros: 50_000, outputPerMTokMicros: 400_000 }
const QWEN_3_7_FLASH_PRICE = { inputPerMTokMicros: 30_000, outputPerMTokMicros: 130_000 }

/** Judge chain. The judge never sets a category, so a weaker model is fine. */
export const JUDGE_CHAIN: readonly ModelSpec[] = [
  {
    id: 'openai/gpt-5-nano',
    provider: 'openrouter',
    measuredMacroF1: 0.831,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    requestsPerMinute: 20,
    // WP-P6: raised from 1. Judged sequentially at ~10.3s each
    // (docs/rca/2026-09-15-tech-lead-items-6-9.md §9.1), a 400-product
    // cold-start miss set took ~69 minutes against a 45-minute step — every
    // attempt 1 since 12.9 died on the timeout. 4 is the Tech Lead's number
    // (`docs/rca/2026-09-15-final-plan.md` WP-P6).
    //
    // CORRECTED (code review): the earlier comment here claimed ~260s per
    // 100 products, reasoning that 4-in-flight latency was the bottleneck.
    // It is not. 4 calls at ~10.3s each is ~23 req/min of raw demand, which
    // EXCEEDS `checkRate`'s paced ceiling — 90% of `requestsPerMinute: 20`
    // is 18/min (`resilience.ts`) — so the shared per-minute cap binds
    // first, the same cap every classifier/reflector call already shares
    // through this gate. Expected throughput is therefore ~18 req/min, not
    // 4-way parallel latency: ~1,000s → ~330s per 100 products (100 / 18
    // req/min ≈ 5.6 min). Still a ~3x win over sequential, just not 4x —
    // `maxInFlight: 4` mainly buys HEADROOM for retries and jitter to land
    // without idling a slot, not a full 4x speedup against an already-paced
    // bucket.
    maxInFlight: 4,
    note: 'as JUDGE: caught 25% of errors with a 0% false-alarm rate',
    billing: { kind: 'paid', price: unsafePrice(GPT_5_NANO_PRICE), maxOutputTokens: 2_000 },
  },
  {
    id: 'qwen/qwen3.7-flash',
    provider: 'openrouter',
    measuredMacroF1: 0.887,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    requestsPerMinute: 20,
    maxInFlight: 1,
    note: 'higher classification score, but failed to answer 3 of 5 in single-item mode',
    billing: { kind: 'paid', price: unsafePrice(QWEN_3_7_FLASH_PRICE), maxOutputTokens: 2_000 },
  },
]

/** Models proven unusable. Never silently re-enter a chain. */
export const BLOCKED_MODELS: Record<string, string> = {
  'gemini-2.5-flash-lite': 'retired 2026-09: 404 "no longer available to new users"',
  'gemini-2.5-flash': 'retired 2026-09: 404 "no longer available to new users"',
  'gemini-3.5-flash': 'free tier is 20 requests PER DAY — cannot serve a weekly run',
  'thinkingmachines/inkling:free': '403 "only available on agentic harnesses"',
  'mistralai/mistral-small-24b-instruct-2501': 'measured 55.4% accuracy on Swiss German product names',
}

export type ProbeResult = { readonly id: string; readonly available: boolean; readonly detail?: string }

/**
 * Picks the first model in the chain that a probe found alive.
 *
 * Deliberately refuses to fall through to an unmeasured model when a measured
 * one is available: a model nobody has scored may be worse in ways nobody has
 * noticed, and a silent downgrade is harder to debug than a loud failure.
 */
export function selectModel(chain: readonly ModelSpec[], probes: readonly ProbeResult[]): Result<ModelSpec> {
  const alive = new Map(probes.map((p) => [p.id, p]))

  const blocked = chain.filter((m) => BLOCKED_MODELS[m.id])
  if (blocked.length > 0) {
    return err(`chain contains blocked models: ${blocked.map((b) => `${b.id} (${BLOCKED_MODELS[b.id]})`).join('; ')}`)
  }

  for (const model of chain) {
    const probe = alive.get(model.id)
    if (probe?.available) return ok(model)
  }

  const reasons = chain.map((m) => `${m.id}: ${alive.get(m.id)?.detail ?? 'not probed'}`).join('; ')
  return err(`no model in the chain is available — ${reasons}`)
}

/**
 * Whether a chosen model is a downgrade worth reporting.
 *
 * Falling back is better than failing, but it must never be silent: the run
 * still succeeds while quietly producing worse categories.
 */
export function downgradeWarning(chain: readonly ModelSpec[], chosen: ModelSpec): string | null {
  const primary = chain[0]
  if (!primary || primary.id === chosen.id) return null

  if (chosen.measuredMacroF1 === null) {
    return `falling back to ${chosen.id}, which has NEVER been benchmarked (primary ${primary.id} unavailable)`
  }
  if (primary.measuredMacroF1 !== null) {
    const drop = primary.measuredMacroF1 - chosen.measuredMacroF1
    return `falling back to ${chosen.id}: macro-F1 ${chosen.measuredMacroF1.toFixed(3)} vs ${primary.measuredMacroF1.toFixed(3)} (${drop >= 0 ? '-' : '+'}${Math.abs(drop).toFixed(3)})`
  }
  return `falling back to ${chosen.id}`
}

// ── ModelCallPolicy (WP-P5) ──────────────────────────────────────────────────
//
// What one `ModelGate` (transformation/infrastructure/model-gate.ts) needs to
// pace, retry and circuit-break calls to ONE (provider, model) pair. Built
// only by `createModelCallPolicy`, never assembled by hand at a call site —
// the invariant below must hold everywhere a policy exists, not just where
// someone remembered to check it.

export type ModelCallPolicy = {
  readonly modelId: string
  readonly provider: ModelSpec['provider']
  readonly requestsPerMinute: number
  readonly requestsPerDay: number | null
  readonly maxInFlight: number
  readonly retry: RetryPolicy
  /**
   * WP-P8. Present only for a PAID model — `undefined` for free-tier Gemini.
   * `model-gate.ts` reserves `spend.worstCaseCallCostMicros` before every call
   * through this policy's gate and refuses the call outright if the ledger
   * cannot cover it. See `spend.ts`.
   */
  readonly spend?: SpendPolicy
}

/** An OpenRouter model id ending in `:free` carries no billing — the suffix IS the contract. */
function isFreeOpenRouterId(id: string): boolean {
  return id.endsWith(':free')
}

/**
 * Builds a `ModelCallPolicy` from a `ModelSpec`, refusing an unusable one.
 *
 * `spec` is always our own static registry data (`TIER1_CHAIN`, `JUDGE_CHAIN`
 * or a fallback literal) — never untrusted input — so a failure here is a
 * defect in this file, caught at composition-root startup rather than 40
 * minutes into a run.
 *
 * WP-P8: an OpenRouter model whose id does not end in `:free` MUST declare
 * `billing: { kind: 'paid', price, maxOutputTokens }` — refusing to build a
 * policy without one is the invariant that closes RCA item 5: "the judge has
 * been paid since 2026-09-10 and nothing knew its price". A `:free` id, or a
 * Google model, needs no billing at all.
 */
export function createModelCallPolicy(spec: ModelSpec, retry: RetryPolicy = DEFAULT_RETRY): Result<ModelCallPolicy> {
  if (spec.requestsPerMinute <= 0) {
    return err(`${spec.id}: requestsPerMinute must be > 0, got ${spec.requestsPerMinute}`)
  }
  if (spec.maxInFlight < 1) {
    return err(`${spec.id}: maxInFlight must be >= 1, got ${spec.maxInFlight}`)
  }
  if (spec.requestsPerDay !== null && spec.requestsPerDay <= 0) {
    return err(`${spec.id}: requestsPerDay must be > 0 or null, got ${spec.requestsPerDay}`)
  }

  const mustBePaid = spec.provider === 'openrouter' && !isFreeOpenRouterId(spec.id)
  if (mustBePaid && spec.billing?.kind !== 'paid') {
    return err(
      `${spec.id}: a paid OpenRouter model must declare billing (a price and maxOutputTokens) — refusing to ` +
        `build a call policy without one. The judge has been paid since 2026-09-10 and nothing knew its price ` +
        `until this WP; see model-registry.ts's ModelBilling.`,
    )
  }

  let spend: SpendPolicy | undefined
  if (spec.billing?.kind === 'paid') {
    const spendResult = createSpendPolicy({ price: spec.billing.price, maxOutputTokens: spec.billing.maxOutputTokens })
    if (!spendResult.ok) return err(`${spec.id}: ${spendResult.error}`)
    spend = spendResult.value
  }

  return ok({
    modelId: spec.id,
    provider: spec.provider,
    requestsPerMinute: spec.requestsPerMinute,
    requestsPerDay: spec.requestsPerDay,
    maxInFlight: spec.maxInFlight,
    retry,
    spend,
  })
}
