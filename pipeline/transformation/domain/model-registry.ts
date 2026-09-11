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
import { err, ok } from '../../collection/domain/result'

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
  readonly note?: string
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
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    measuredMacroF1: 0.842,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    note: 'one batch lost to a network error during measurement; score is on 266 of 291',
  },
  {
    id: 'gemini-flash-lite-latest',
    provider: 'google',
    measuredMacroF1: null,
    measuredOn: null,
    requestsPerDay: 1000,
    note: 'floating alias — survives a retirement, but the model behind it can change without notice',
  },
]

/** Judge chain. The judge never sets a category, so a weaker model is fine. */
export const JUDGE_CHAIN: readonly ModelSpec[] = [
  {
    id: 'openai/gpt-5-nano',
    provider: 'openrouter',
    measuredMacroF1: 0.831,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    note: 'as JUDGE: caught 25% of errors with a 0% false-alarm rate',
  },
  {
    id: 'qwen/qwen3.7-flash',
    provider: 'openrouter',
    measuredMacroF1: 0.887,
    measuredOn: '2026-09-10',
    requestsPerDay: 1000,
    note: 'higher classification score, but failed to answer 3 of 5 in single-item mode',
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
