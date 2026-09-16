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
import { CURRENT_VERSIONS } from './transformation/domain/classification-cache'
import { JUDGE_CHAIN, TIER1_CHAIN, downgradeWarning, selectModel } from './transformation/domain/model-registry'
import { createGeminiReflector, createOpenRouterJudge } from './transformation/infrastructure/gemini/gemini-judge'
import { createGeminiClassifier } from './transformation/infrastructure/gemini/gemini-classifier'
import { createGeminiEnricher } from './transformation/infrastructure/gemini/gemini-enricher'
import { resilientClassifier } from './transformation/infrastructure/resilient-classifier'
import { createSupabaseClassificationCache } from './transformation/infrastructure/supabase/supabase-classification-cache'
import { probeModels } from './transformation/infrastructure/model-probe'

type Env = Record<string, string | undefined>

/** Fallback if the probe cannot run at all — the probe below is what normally decides. */
const TIER1_FALLBACK = TIER1_CHAIN[0]?.id ?? 'gemini-3.5-flash-lite'

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
async function selectTier1Model(env: Env, log: (message: string) => void): Promise<string> {
  if (!env.GOOGLE_AI_API_KEY) return TIER1_FALLBACK

  const probes = await probeModels(TIER1_CHAIN, { google: env.GOOGLE_AI_API_KEY, openrouter: env.OPENROUTER_API_KEY })
  const chosen = selectModel(TIER1_CHAIN, probes)
  if (!chosen.ok) {
    console.error(`[pipeline] [ERROR] ${chosen.error}`)
    return TIER1_FALLBACK
  }

  const warning = downgradeWarning(TIER1_CHAIN, chosen.value)
  // A fallback is better than a failure, but it must never be silent: the run
  // still succeeds while producing measurably worse categories.
  if (warning) console.warn(`[pipeline] [WARN] ${warning}`)
  else log(`classifier model: ${chosen.value.id}`)
  return chosen.value.id
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

async function buildClassificationDeps(env: Env, log: (message: string) => void): Promise<ClassificationDeps> {
  const tier1Model = await selectTier1Model(env, log)

  return {
    cache: buildClassificationCache(),
    // Wrapped: rate limiting, exponential backoff and a circuit breaker.
    // Without this a single 429 kills a whole batch of 25 products.
    tier1: resilientClassifier({
      inner: createGeminiClassifier({
        apiKey: env.GOOGLE_AI_API_KEY ?? '',
        model: tier1Model,
        tier: 1,
        taxonomy: TAXONOMY,
        batchSize: 25,
      }),
      log,
    }),
    // THE ESCALATION TRIGGER. Both degrade to null when their key is absent,
    // so a missing OpenRouter key costs escalation, never the run.
    judge: env.OPENROUTER_API_KEY
      ? createOpenRouterJudge({ apiKey: env.OPENROUTER_API_KEY, model: JUDGE_CHAIN[0]?.id ?? 'openai/gpt-5-nano', taxonomy: TAXONOMY })
      : null,
    reflector: env.GOOGLE_AI_API_KEY
      ? createGeminiReflector({ apiKey: env.GOOGLE_AI_API_KEY, model: tier1Model, taxonomy: TAXONOMY })
      : null,
    // Per-category metadata: milk fat %, butter salted, wine vintage, detergent
    // wash loads. Optional by design — enrichment must never cost a product
    // its category.
    enricher: env.GOOGLE_AI_API_KEY
      ? createGeminiEnricher({ apiKey: env.GOOGLE_AI_API_KEY, model: tier1Model, log })
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
    createClassificationDeps: (log) => buildClassificationDeps(env, log),
    storage: PRODUCTION_STORAGE,
    revalidate: () => pingRevalidateWebhook(env, { fetch, log: (m) => console.log(m) }),
  }
}
