// GeminiEnricher — extracts the per-category attributes.
//
// Runs AFTER classification, because the sub-category decides which schema
// applies. Batched per sub-category so the field list is sent once, not once
// per product.
//
// It never invents. `validateAttributes` drops anything the schema does not
// define, anything of the wrong type, and any enum value outside its list — so
// a model returning `fatPercent: "whole"` or inventing a `freshness` field
// cannot reach the database.
//
// WP-P9 (item 6, D3): `enrich` reports a per-item OUTCOME, not a bare
// `Map<string, attributes>`. A product absent from the old map could mean "the
// retailer's name states nothing" or "Google refused this call" — two facts
// with opposite costs (the first should never be asked again; the second MUST
// be) that a missing map entry cannot tell apart. See `EnrichmentOutcome` in
// `../../domain/classification-cache.ts`.

import type { EnrichmentOutcome } from '../../domain/classification-cache'
import { classifyFailure } from '../../domain/resilience'
import type { ClassificationRequest } from '../../domain/classifier'
import {
  type EnrichRequest,
  buildEnrichPrompt,
  groupBySubCategory,
  validateAttributes,
} from '../enrich-prompt'
import { extractAnswers } from '../classification-prompt'
import { ModelHttpError, type ModelGate } from '../model-gate'
import { postJson, summariseError } from '../model-http'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Products per request. Smaller than classification's 25: attribute answers are longer. */
const ENRICH_BATCH = 15

export type Enricher = {
  readonly name: string
  /** One outcome per item asked about — never a bare map a missing key could mean anything for. */
  enrich(items: readonly EnrichRequest[]): Promise<{
    outcomes: Map<string, EnrichmentOutcome>
    tokens: number
  }>
}

export type EnricherDeps = {
  apiKey: string
  model: string
  batchSize?: number
  /**
   * REQUIRED (WP-P5). The SAME (provider, model) gate the classifier and the
   * reflector use when they share this model — one Gemini quota, three
   * callers, paced together instead of three private limiters that never see
   * each other. See `model-gate.ts`.
   */
  gate: ModelGate
  /** Injected so tests never touch the network. */
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
  log?: (message: string) => void
}

// Bounded by model-http. Enrichment failing costs metadata, never a category —
// but an enrichment call that HANGS costs the run, because every classification
// chunk behind it waits.
async function askGemini(apiKey: string, model: string, prompt: string, gate: ModelGate) {
  const j = (await postJson({
    url: `${ENDPOINT}/${model}:generateContent?key=${apiKey}`,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
    gate,
  })) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { totalTokenCount?: number }
  }
  return {
    text: j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    tokens: j?.usageMetadata?.totalTokenCount ?? 0,
  }
}

/**
 * Records EVERY item in a batch as `failed`, with the SAME reason and the
 * SAME `rateLimited` classification — used when the whole batch call itself
 * threw (a rate limit, a timeout, a 5xx) or returned nothing parseable.
 *
 * `rateLimited` is read from the SAME `classifyFailure` the shared
 * `ModelGate` already uses (`resilience.ts`), not re-derived by regexing the
 * message here — the domain's rate-limit classification stays in one place.
 */
function markBatchFailed(
  outcomes: Map<string, EnrichmentOutcome>,
  batch: readonly EnrichRequest[],
  reason: string,
  rateLimited: boolean,
): void {
  for (const item of batch) {
    outcomes.set(item.request.productName, { kind: 'failed', reason, rateLimited })
  }
}

export function createGeminiEnricher(deps: EnricherDeps): Enricher {
  const ask = deps.ask ?? ((p: string) => askGemini(deps.apiKey, deps.model, p, deps.gate))
  const batchSize = deps.batchSize ?? ENRICH_BATCH
  const log = deps.log ?? (() => {})

  return {
    name: deps.model,

    async enrich(items) {
      const outcomes = new Map<string, EnrichmentOutcome>()
      let tokens = 0
      if (items.length === 0) return { outcomes, tokens }

      for (const [subCategory, group] of groupBySubCategory(items)) {
        for (let i = 0; i < group.length; i += batchSize) {
          const batch = group.slice(i, i + batchSize)

          let text: string
          try {
            const r = await ask(buildEnrichPrompt(subCategory, batch))
            text = r.text
            tokens += r.tokens
          } catch (e) {
            // Enrichment failing costs metadata, never the product. The deal is
            // already classified and will be stored either way — but EVERY
            // item in this batch must be recorded `failed`, not silently
            // dropped, or `needsEnrichment` can never tell "we asked and got
            // refused" apart from "we never asked" on the next run.
            //
            // ONE short summary line, not the raw error: `ModelGate` already
            // retried this call internally (see model-gate.ts), so what
            // reaches here is the FINAL outcome, and its message can still
            // carry up to ERROR_BODY_CHARS (2,000) of a provider's JSON body.
            // Before WP-P5, 429s alone were 89% of one run's log by byte count.
            const status = e instanceof ModelHttpError ? e.status : null
            const message = e instanceof Error ? e.message : String(e)
            const rateLimited = classifyFailure(status, message).startsWith('rate-limited')
            log(`enrich ${subCategory}: ${summariseError(e)}`)
            markBatchFailed(outcomes, batch, summariseError(e), rateLimited)
            continue
          }

          const answers = extractAnswers(text)
          if (!answers) {
            log(`enrich ${subCategory}: unparseable response`)
            markBatchFailed(outcomes, batch, 'unparseable response', false)
            continue
          }

          // Matched by the echoed index, not by position — a dropped item would
          // otherwise shift every product's attributes onto its neighbour.
          const byIndex = new Map<number, { attributes?: Record<string, unknown> }>()
          for (const a of answers as { i?: number; attributes?: Record<string, unknown> }[]) {
            if (typeof a.i === 'number') byIndex.set(a.i, a)
          }

          batch.forEach((item, index) => {
            const answer = byIndex.get(index)
            // The model answered for OTHER items in this batch but skipped
            // this one entirely — genuinely unknown, not "nothing to state".
            // Recorded `failed` (not rate-limited: this is a content gap, not
            // a quota one) so the product is offered again next run rather
            // than assumed resolved.
            if (!answer) {
              outcomes.set(item.request.productName, {
                kind: 'failed',
                reason: `no answer echoed for index ${index}`,
                rateLimited: false,
              })
              return
            }

            const clean = validateAttributes(subCategory, answer.attributes ?? {})
            // Both are ANSWERS — the retailer's name was read either way.
            // `statedNothing` is the never-infer rule in practice: honest and
            // final, not a failure to record again next week.
            outcomes.set(
              item.request.productName,
              Object.keys(clean).length > 0 ? { kind: 'stated', attributes: clean } : { kind: 'statedNothing' },
            )
          })
        }
      }

      return { outcomes, tokens }
    },
  }
}

export type { EnrichRequest, ClassificationRequest, EnrichmentOutcome }
