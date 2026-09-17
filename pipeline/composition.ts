// composition — the ONE place the real dependencies are built.
//
// Everything `run-pipeline.ts` needs — sources, classifier, reflector, judge,
// enricher, cache, storage, the revalidate hook — is constructed here, from
// `env`, and nowhere else. Before this file existed, `run.ts` built every one
// of them inline in a 700-line function that nothing imported: "the root
// wires classifier, reflector, judge and enricher from env" was true only by
// accident, never by a test.
//
// LAYERING: this is the INFRASTRUCTURE layer. It is the only file allowed to
// import the Gemini SDK's HTTP shape, the Supabase client and the real
// network transport, and it is the only file that constructs them.

import { BROWSE_CATEGORIES, type Deal, type Store } from '../shared/types'
import { createLiveSources, type Transport } from './collection/infrastructure/live-sources'
import type { ClassificationDeps, IsoWeekParts, PipelineDeps, StorageDeps } from './run-pipeline'
import { resolveProducts } from './product-resolve'
import { loadAliases, reportUnknownTags } from './resolve-taxonomy'
import {
  activeCountsByWindow,
  deactivateExpiredDeals,
  deactivateStaleForStores,
  logPipelineRun,
  storeDeals,
} from './store'
import { supabase } from './supabase-client'
import { writeEnrichment } from './storage/infrastructure/write-enrichment'
import { pingRevalidateWebhook } from './observability/revalidate-webhook'
import { populateV3Layer } from './v3-cutover'
import { unwrap } from './collection/domain/result'
import { guardClassifier } from './transformation/domain/classifier'
import { CURRENT_VERSIONS } from './transformation/domain/classification-cache'
import {
  JUDGE_CHAIN,
  TIER1_CHAIN,
  createModelCallPolicy,
  downgradeWarning,
  selectModel,
  type ModelSpec,
} from './transformation/domain/model-registry'
import { createGeminiReflector, createOpenRouterJudge } from './transformation/infrastructure/gemini/gemini-judge'
import { createGeminiClassifier } from './transformation/infrastructure/gemini/gemini-classifier'
import { createGeminiEnricher } from './transformation/infrastructure/gemini/gemini-enricher'
import { createModelGate, type ModelGate, type ModelGateDeps } from './transformation/infrastructure/model-gate'
import { createSupabaseClassificationCache } from './transformation/infrastructure/supabase/supabase-classification-cache'
import { probeModels } from './transformation/infrastructure/model-probe'
import { type UsdMicros, formatUsd } from './transformation/domain/spend'
import {
  type SpendAccount,
  type SpendAccountReading,
  createOpenRouterSpendAccount,
} from './transformation/infrastructure/openrouter-spend-account'

type Env = Record<string, string | undefined>

/** Fallback if the probe cannot run at all — the probe below is what normally decides. */
const TIER1_FALLBACK_SPEC: ModelSpec = TIER1_CHAIN[0] ?? {
  id: 'gemini-3.5-flash-lite',
  provider: 'google',
  measuredMacroF1: null,
  measuredOn: null,
  requestsPerDay: 1000,
  requestsPerMinute: 15,
  maxInFlight: 1,
}

const JUDGE_SPEC: ModelSpec = JUDGE_CHAIN[0] ?? {
  id: 'openai/gpt-5-nano',
  provider: 'openrouter',
  measuredMacroF1: null,
  measuredOn: null,
  requestsPerDay: 1000,
  requestsPerMinute: 20,
  maxInFlight: 1,
  // WP-P8: this fallback is only ever reached if JUDGE_CHAIN is somehow
  // empty — dead code today — but createModelCallPolicy now refuses ANY
  // non-`:free` OpenRouter spec without billing, so it needs one too.
  billing: { kind: 'paid', price: { inputPerMTokMicros: 50_000 as UsdMicros, outputPerMTokMicros: 400_000 as UsdMicros }, maxOutputTokens: 2_000 },
}

/** `JUDGE_SPEC.billing.maxOutputTokens`, or the judge adapter's own default if somehow absent. */
function judgeMaxOutputTokens(spec: ModelSpec): number {
  return spec.billing?.kind === 'paid' ? spec.billing.maxOutputTokens : 2_000
}

const TAXONOMY = BROWSE_CATEGORIES.map((c) => ({ category: c.id, subCategories: c.subCategories }))

/**
 * Probe the chain before spending anything. A listing is not availability:
 * gemini-2.5-flash-lite appeared in Google's own models list on 2026-09-10 and
 * 404'd on call. Ten seconds here beats discovering it 72 batches deep.
 *
 * Skipped entirely without a Google key, so a run with no API keys makes zero
 * network calls while building its dependencies — what makes the "wires from
 * env" test deterministic and offline.
 */
async function selectTier1Spec(env: Env, log: (message: string) => void): Promise<ModelSpec> {
  if (!env.GOOGLE_AI_API_KEY) return TIER1_FALLBACK_SPEC

  const probes = await probeModels(TIER1_CHAIN, { google: env.GOOGLE_AI_API_KEY, openrouter: env.OPENROUTER_API_KEY })
  const chosen = selectModel(TIER1_CHAIN, probes)
  if (!chosen.ok) {
    console.error(`[pipeline] [ERROR] ${chosen.error}`)
    return TIER1_FALLBACK_SPEC
  }

  const warning = downgradeWarning(TIER1_CHAIN, chosen.value)
  // A fallback is better than a failure, but it must never be silent: the run
  // still succeeds while producing measurably worse categories.
  if (warning) console.warn(`[pipeline] [WARN] ${warning}`)
  else log(`classifier model: ${chosen.value.id}`)
  return chosen.value
}

/**
 * Builds a `ModelGate` for one `ModelSpec` — used by BOTH the classifier and
 * (via the SAME instance, see below) the reflector and the enricher whenever
 * they share a model.
 *
 * WP-P5 / RCA item 6: three uncoordinated limiters shared one Gemini quota,
 * so a backfill of 1,107 products fired ~250 requests in 20 seconds and got
 * 255 of them refused. `unwrap` is safe here — `spec` is always our own
 * static registry data (or the fallback literal above), never untrusted
 * input, so a rejected policy is a defect in THIS file, caught at startup.
 *
 * F1 (code review): `log` is wired to the RUN's own logger, not left to the
 * gate's silent default. Without this, every "waiting 57s", "retrying in
 * 57s (attempt 2)" and "giving up" line the gate emits went nowhere — a run
 * could sleep 12 minutes honouring a Retry-After and the Categorize log
 * would be blank between two chunk summaries, exactly the evidence gap this
 * WP exists to close. `overrides` still wins where a test supplies its own
 * `log` (or a scripted clock), because it is spread AFTER.
 *
 * WP-P8: `spendCeilingMicros`, when given, is threaded into the gate's own
 * ledger — meaningless for a free-tier spec (the gate ignores it when
 * `policy.spend` is undefined) and REQUIRED in practice for a paid one, since
 * a paid gate built without it defaults to a ZERO ceiling (fail closed).
 */
function buildGate(spec: ModelSpec, log: (message: string) => void, overrides: ModelGateDeps = {}, spendCeilingMicros?: UsdMicros): ModelGate {
  return createModelGate(unwrap(createModelCallPolicy(spec)), { log, spendCeilingMicros, ...overrides })
}

// THE INSTRUMENT. Without this, degraded('save', ...) went nowhere: a failed
// cache write returned ok(0) and printed "cached 0 classifications" — a
// visible zero with no cause. A failed SAVE is an error: the run re-pays next
// week. A degraded LOOKUP is informational.
function buildClassificationCache() {
  return createSupabaseClassificationCache({
    client: supabase,
    versions: CURRENT_VERSIONS,
    onDegraded: (operation, detail) => {
      if (operation === 'save') {
        console.error(`[pipeline] [ERROR] classification cache save degraded: ${detail}`)
      } else {
        console.warn(`[pipeline] [WARN] classification cache ${operation}: ${detail}`)
      }
    },
  })
}

/**
 * WP-P8 (AP-10). Reads what remains of this billing period's allowance from
 * OpenRouter's own account, and decides whether the judge may run at all.
 *
 * `guarded: false` means "a paid call was possible (the key exists) without a
 * confirmed provider-side cap" — logged loudly here as a WARNING, never a
 * critical alert (AP-10, reconciled with AP-7 by the Tech Lead: a critical
 * alert fails the run, and "run without the judge" must not itself fail the
 * run it is trying to keep going).
 *
 * `null` `ceilingMicros` with `guarded: true` covers the ordinary case where
 * there is simply no OpenRouter key at all — nothing paid was ever possible,
 * so there is nothing to warn about.
 */
async function resolveJudgeSpendCeiling(
  env: Env,
  log: (message: string) => void,
  // Test-only seam. Without it this function makes a REAL request to
  // OpenRouter, which is why the composition tests were briefly talking to
  // the live API and reading a 401 as "unreadable" — a test that needs the
  // network to decide an answer is not a test.
  spendAccount?: SpendAccount,
): Promise<{ readonly ceilingMicros: UsdMicros | null; readonly guarded: boolean }> {
  if (!env.OPENROUTER_API_KEY) return { ceilingMicros: null, guarded: true }

  const account = spendAccount ?? createOpenRouterSpendAccount({ apiKey: env.OPENROUTER_API_KEY })
  const reading: SpendAccountReading = await account.remaining()

  if (reading.kind === 'capped') {
    log(`spend account: ${formatUsd(reading.remainingMicros)} remaining of ${formatUsd(reading.limitMicros)} this period`)
    return { ceilingMicros: reading.remainingMicros, guarded: true }
  }

  const reason =
    reading.kind === 'uncapped'
      ? 'the OpenRouter key has no credit limit set (limit: null)'
      : `the OpenRouter spend account could not be read: ${reading.reason}`
  console.warn(
    `[pipeline] [WARN] spend-unguarded: running WITHOUT the judge this run — ${reason}. ` +
      'Set a credit limit on the OpenRouter CI key (WP-0 #1, AP-8: USD 5/month, auto top-up off) to re-enable it.',
  )
  return { ceilingMicros: null, guarded: false }
}

async function buildClassificationDeps(
  env: Env,
  log: (message: string) => void,
  gateDeps: ModelGateDeps = {},
  spendAccount?: SpendAccount,
): Promise<ClassificationDeps> {
  const tier1Spec = await selectTier1Spec(env, log)
  const tier1Model = tier1Spec.id

  // ONE gate for this run's Gemini model, shared by the classifier, the
  // reflector and the enricher — every caller of this model pays out of the
  // SAME 15-requests-per-minute bucket Google actually enforces (WP-P5). This
  // replaces the rate/retry loop that used to live on a decorator private to
  // the classifier alone, which never saw the other two callers.
  const tier1Gate = buildGate(tier1Spec, log, gateDeps)

  // WP-P8 / AP-10: read BEFORE deciding whether to build the judge at all —
  // an unreadable account or an uncapped key means no judge this run, not a
  // judge running against an unbounded ledger.
  const spendCeiling = await resolveJudgeSpendCeiling(env, log, spendAccount)
  const judgeMayRun = Boolean(env.OPENROUTER_API_KEY) && spendCeiling.ceilingMicros !== null

  return {
    cache: buildClassificationCache(),
    // Retry, pacing and the circuit breaker live in `tier1Gate`, injected at
    // `postJson`. `guardClassifier` is the one thing left for a decorator to
    // do here — a Classifier that throws must still come back as an Err
    // (F6, code review: the old one-line `resilientClassifier` wrapper added
    // nothing beyond this call and was deleted).
    tier1: guardClassifier(
      createGeminiClassifier({
        apiKey: env.GOOGLE_AI_API_KEY ?? '',
        model: tier1Model,
        tier: 1,
        taxonomy: TAXONOMY,
        batchSize: 25,
        gate: tier1Gate,
        // WP-P6: this hook existed since the classifier was written and was
        // never passed — classify token usage never reached a log anywhere.
        // Per BATCH (up to 25 products), unlike the judge's per-product
        // `onJudgeUsage` (classify-deals.ts) — the two granularities match
        // how each adapter actually calls its model.
        onUsage: (tokens) => log(`[transform] classify: ${tokens} tokens`),
      }),
      log,
    ),
    // THE ESCALATION TRIGGER. Degrades to null when the key is absent OR
    // (WP-P8, AP-10) when the account has no confirmed provider-side cap —
    // classification is unaffected either way. Its own (provider, model)
    // gate — the judge is a different provider and, today, a different model
    // from the classifier, so it never shares tier1Gate.
    judge:
      judgeMayRun && env.OPENROUTER_API_KEY
        ? createOpenRouterJudge({
            // WP-P8 review: with reasoning effort UNSET, GPT-5 defaults to
            // medium and can spend ~50% of max_tokens thinking, returning
            // finish_reason 'length' with EMPTY content — billed in full for
            // an unusable answer. A one-word verdict needs no reasoning.
            reasoningEffort: 'minimal',
            apiKey: env.OPENROUTER_API_KEY,
            model: JUDGE_SPEC.id,
            taxonomy: TAXONOMY,
            gate: buildGate(JUDGE_SPEC, log, gateDeps, spendCeiling.ceilingMicros ?? undefined),
            maxOutputTokens: judgeMaxOutputTokens(JUDGE_SPEC),
            log,
          })
        : null,
    // SAME gate instance as tier1 above — the reflector calls the identical
    // Gemini model, so it must pace against the identical bucket.
    reflector: env.GOOGLE_AI_API_KEY
      ? createGeminiReflector({ apiKey: env.GOOGLE_AI_API_KEY, model: tier1Model, taxonomy: TAXONOMY, gate: tier1Gate, log })
      : null,
    // Per-category metadata: milk fat %, butter salted, wine vintage, detergent
    // wash loads. Optional by design — enrichment must never cost a product
    // its category. SAME gate instance again — this is the caller that, with
    // no gate of its own, fired ~250 requests in 20 seconds against the
    // classifier's already-spent quota (RCA item 6).
    enricher: env.GOOGLE_AI_API_KEY
      ? createGeminiEnricher({ apiKey: env.GOOGLE_AI_API_KEY, model: tier1Model, gate: tier1Gate, log })
      : null,
  }
}

/** Narrows `resolveProducts`' richer row (it also carries `productGroup`) down to the port's contract. */
async function resolveProductsForPort(deals: readonly Deal[], store: Store): Promise<Map<string, { productId: string }>> {
  const resolved = await resolveProducts(deals as Deal[], store)
  const out = new Map<string, { productId: string }>()
  for (const [name, result] of resolved) out.set(name, { productId: result.productId })
  return out
}

const PRODUCTION_STORAGE: StorageDeps = {
  loadAliases: () => loadAliases(supabase),
  reportUnknownTags: (tags) => reportUnknownTags(supabase, [...tags]),
  resolveProducts: resolveProductsForPort,
  activeCountsByWindow,
  storeDeals,
  writeEnrichment: (items) => writeEnrichment(supabase, items, (m) => console.log(`[pipeline] [INFO] ${m}`)),
  populateV3Layer,
  deactivateStaleForStores,
  deactivateExpiredDeals,
  logPipelineRun,
}

export type ProductionDepsOverrides = {
  /** Test-only seam: the real adapters run against a fake network instead of the real one. */
  readonly transport?: Transport
  /**
   * Test-only seam (WP-P5): lets a test give every `ModelGate` this root
   * builds a scripted clock and an instant `sleep`, so a composition-root
   * test can prove the classifier, the reflector and the enricher share ONE
   * paced quota without waiting on real wall-clock time.
   */
  readonly modelClock?: ModelGateDeps
  /**
   * Test-only seam (WP-P8, AP-10): supplies the judge's spend reading instead
   * of asking OpenRouter for it, so a test can exercise capped / uncapped /
   * unreadable without a network call.
   */
  readonly spendAccount?: SpendAccount
}

/**
 * The composition root. Builds every real dependency `runPipeline` needs from
 * `env`. `overrides.transport` exists only so a test can exercise the REAL
 * `createLiveSources` wiring — real adapters, real parsing — against a fake
 * network, rather than only a hand-built fake `OfferSource`.
 */
export function createProductionDeps(env: Env, overrides: ProductionDepsOverrides = {}): PipelineDeps {
  return {
    sources: (week: IsoWeekParts) => createLiveSources({ kw: week.kw, year: week.year, transport: overrides.transport }),
    createClassificationDeps: (log) => buildClassificationDeps(env, log, overrides.modelClock, overrides.spendAccount),
    storage: PRODUCTION_STORAGE,
    revalidate: () => pingRevalidateWebhook(env, { fetch, log: (m) => console.log(m) }),
  }
}
