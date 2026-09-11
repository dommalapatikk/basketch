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

import type { ClassificationRequest } from '../../domain/classifier'
import {
  type EnrichRequest,
  buildEnrichPrompt,
  groupBySubCategory,
  validateAttributes,
} from '../enrich-prompt'
import { extractAnswers } from '../classification-prompt'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Products per request. Smaller than classification's 25: attribute answers are longer. */
const ENRICH_BATCH = 15

export type Enricher = {
  readonly name: string
  /** Attributes keyed by product name. A product absent from the map got none. */
  enrich(items: readonly EnrichRequest[]): Promise<{
    attributes: Map<string, Record<string, unknown>>
    tokens: number
  }>
}

export type EnricherDeps = {
  apiKey: string
  model: string
  batchSize?: number
  /** Injected so tests never touch the network. */
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
  log?: (message: string) => void
}

async function askGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { totalTokenCount?: number }
  }
  return {
    text: j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    tokens: j?.usageMetadata?.totalTokenCount ?? 0,
  }
}

export function createGeminiEnricher(deps: EnricherDeps): Enricher {
  const ask = deps.ask ?? ((p: string) => askGemini(deps.apiKey, deps.model, p))
  const batchSize = deps.batchSize ?? ENRICH_BATCH
  const log = deps.log ?? (() => {})

  return {
    name: deps.model,

    async enrich(items) {
      const attributes = new Map<string, Record<string, unknown>>()
      let tokens = 0
      if (items.length === 0) return { attributes, tokens }

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
            // already classified and will be stored either way.
            log(`enrich ${subCategory}: ${e instanceof Error ? e.message : String(e)}`)
            continue
          }

          const answers = extractAnswers(text)
          if (!answers) {
            log(`enrich ${subCategory}: unparseable response`)
            continue
          }

          // Matched by the echoed index, not by position — a dropped item would
          // otherwise shift every product's attributes onto its neighbour.
          const byIndex = new Map<number, { attributes?: Record<string, unknown> }>()
          for (const a of answers as { i?: number; attributes?: Record<string, unknown> }[]) {
            if (typeof a.i === 'number') byIndex.set(a.i, a)
          }

          batch.forEach((item, index) => {
            const raw = byIndex.get(index)?.attributes
            if (!raw) return
            const clean = validateAttributes(subCategory, raw)
            // An empty result is not worth storing: it says nothing a missing
            // row does not already say.
            if (Object.keys(clean).length > 0) attributes.set(item.request.productName, clean)
          })
        }
      }

      return { attributes, tokens }
    },
  }
}

export type { EnrichRequest, ClassificationRequest }
