// GeminiClassifier — a Classifier adapter for Google's Generative Language API.
//
// Everything Google-shaped stops at this file: responseSchema, candidates,
// parts, finishReason. The domain sees Classification or a failure reason.
//
// Batching: the taxonomy prompt is ~600 tokens and identical for every product,
// so sending it once per 25 products instead of once per product cuts input
// tokens roughly 10x. At basketch volume that is the difference between "cheap"
// and "free tier".

import { type Result, err, ok } from '../../../collection/domain/result'
import type { ClassificationTier } from '../../domain/classification'
import type {
  ClassificationOutcome,
  ClassificationRequest,
  Classifier,
} from '../../domain/classifier'
import {
  type TaxonomyEntry,
  alignByIndex,
  buildPrompt,
  extractAnswers,
} from '../classification-prompt'
import type { ModelGate } from '../model-gate'
import { postJson } from '../model-http'

// Re-exported so existing tests and callers keep one import site.
export { buildPrompt, extractAnswers, PROMPT_VERSION } from '../classification-prompt'
export type { TaxonomyEntry } from '../classification-prompt'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

// ── Google's wire shape. Referenced nowhere outside this file. ───────────────

type GeminiPart = { text?: string }
type GeminiCandidate = { content?: { parts?: GeminiPart[] }; finishReason?: string }
type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
type GeminiResponse = {
  candidates?: GeminiCandidate[]
  usageMetadata?: GeminiUsage
  error?: { message?: string; status?: string }
}

// ── The adapter ──────────────────────────────────────────────────────────────

export type GeminiDeps = {
  apiKey: string
  model: string
  tier: ClassificationTier
  taxonomy: readonly TaxonomyEntry[]
  batchSize?: number
  /** Retrieval few-shot block, built per batch from the cache. */
  examplesFor?: (batch: readonly ClassificationRequest[]) => string
  /**
   * REQUIRED (WP-P5). The (provider, model) quota this call shares with the
   * reflector and the enricher when they run the same model — see
   * `model-gate.ts`. Built once by the composition root, never per call.
   */
  gate: ModelGate
  /** Injected so tests never touch the network. */
  fetchJson?: (url: string, body: string) => Promise<unknown>
  /** Accumulates token usage for the run budget (§7b.3). */
  onUsage?: (tokens: number) => void
}

// Bounded by model-http: Node's fetch has no default timeout, and a chunk of
// 100 products makes ~59 SEQUENTIAL calls through here.
async function httpPost(url: string, body: string, gate: ModelGate): Promise<unknown> {
  return postJson({ url, body, gate })
}

export function createGeminiClassifier(deps: GeminiDeps): Classifier {
  const batchSize = deps.batchSize ?? 25
  const fetchJson = deps.fetchJson ?? ((url: string, body: string) => httpPost(url, body, deps.gate))

  return {
    name: deps.model,
    tier: deps.tier,
    batchSize,

    async classify(batch: readonly ClassificationRequest[]): Promise<Result<readonly ClassificationOutcome[]>> {
      if (batch.length === 0) return ok([])

      const url = `${ENDPOINT}/${deps.model}:generateContent?key=${deps.apiKey}`
      const body = JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(deps.taxonomy, batch, deps.examplesFor?.(batch) ?? '') }] }],
        generationConfig: {
          // Deterministic: the same product must classify the same way every run,
          // or the cache and the benchmark both become meaningless.
          temperature: 0,
          responseMimeType: 'application/json',
        },
      })

      let raw: unknown
      try {
        raw = await fetchJson(url, body)
      } catch (e) {
        return err(`provider-unavailable: ${e instanceof Error ? e.message : String(e)}`)
      }

      const res = raw as GeminiResponse
      if (res.error) return err(`provider-unavailable: ${res.error.status ?? ''} ${res.error.message ?? ''}`.trim())

      if (res.usageMetadata?.totalTokenCount) deps.onUsage?.(res.usageMetadata.totalTokenCount)

      const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const answers = extractAnswers(text)
      if (!answers) return err(`source-changed: could not parse a JSON array from the response`)

      return ok(alignByIndex(batch, answers, deps.model, deps.tier))
    },
  }
}
