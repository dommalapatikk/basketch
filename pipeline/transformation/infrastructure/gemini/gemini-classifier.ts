// GeminiClassifier — a Classifier adapter for Google's Generative Language API.
//
// Everything Google-shaped stops at this file: responseSchema, candidates,
// parts, finishReason. The domain sees Classification or a failure reason.
//
// Batching: the taxonomy prompt is ~600 tokens and identical for every product,
// so sending it once per 25 products instead of once per product cuts input
// tokens roughly 10x. At basketch volume that is the difference between "cheap"
// and "free tier".

import { type Result, err, isOk, ok } from '../../../collection/domain/result'
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

/** Gemini's own value for a response cut off by the output token limit. */
const FINISH_REASON_MAX_TOKENS = 'MAX_TOKENS'

/**
 * D4: bisect a truncated batch at most twice — 25 → 13 → 7. Below that,
 * the products are held back with the reason recorded, never split again
 * and never dropped silently.
 */
const MAX_BISECTIONS = 2

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

type ModelReply = { readonly finishReason: string | undefined; readonly text: string }

/**
 * ONE HTTP attempt: builds the prompt for exactly this batch, sends it and
 * reads back the raw text plus Gemini's own `finishReason` — never parsed
 * here. `Err` from this function means the call itself failed (network,
 * an explicit Google error payload) — a TRANSPORT-level failure, already
 * retried by `deps.gate` before this promise ever settles. It is never
 * used for a truncated or unparseable ANSWER, which are content failures
 * decided by the caller below, one layer up.
 */
async function callModel(
  batch: readonly ClassificationRequest[],
  deps: GeminiDeps,
  fetchJson: (url: string, body: string) => Promise<unknown>,
): Promise<Result<ModelReply>> {
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
  return ok({ finishReason: res.candidates?.[0]?.finishReason, text })
}

/** Every product in `batch` held back with the SAME recorded reason — never silently dropped. */
function heldBack(
  batch: readonly ClassificationRequest[],
  reason: 'output-truncated' | 'unparseable',
  detail: string,
): ClassificationOutcome[] {
  return batch.map((request) => ({ ok: false, request, reason, detail }))
}

/**
 * Classifies one batch, applying the D4 content guards. Never throws, and
 * never returns `Err` for a content problem — a truncated or unparseable
 * answer is reported per product, through the SAME `Ok` path a clean batch
 * takes, which is what keeps it away from `model-gate.ts`'s circuit
 * breaker entirely: the circuit only ever sees what `postJson` throws, and
 * neither guard below ever does.
 *
 *   MAX_TOKENS (`bisectionsLeft > 0`)   the generation was cut off. Retrying
 *     the IDENTICAL batch at temperature 0 truncates identically, so this
 *     sends a SMALLER request instead — at most two splits, 25 → 13 → 7.
 *     Below that, `heldBack` records the reason rather than trying forever.
 *   unparseable (`retryUnparseableOnce`)   the answer was NOT cut off, but
 *     its text did not parse. Retried ONCE, same size: the project has
 *     measured this provider as non-deterministic in practice even at
 *     temperature 0 (HANDOVER.md — 16 parse errors one run, 18 the next).
 */
async function classifyWithGuards(
  batch: readonly ClassificationRequest[],
  deps: GeminiDeps,
  fetchJson: (url: string, body: string) => Promise<unknown>,
  bisectionsLeft: number,
  retryUnparseableOnce: boolean,
): Promise<Result<readonly ClassificationOutcome[]>> {
  if (batch.length === 0) return ok([])

  const called = await callModel(batch, deps, fetchJson)
  if (!isOk(called)) return called
  const { finishReason, text } = called.value

  if (finishReason === FINISH_REASON_MAX_TOKENS) {
    if (batch.length > 1 && bisectionsLeft > 0) {
      const mid = Math.ceil(batch.length / 2)
      const left = await classifyWithGuards(batch.slice(0, mid), deps, fetchJson, bisectionsLeft - 1, true)
      if (!isOk(left)) return left
      const right = await classifyWithGuards(batch.slice(mid), deps, fetchJson, bisectionsLeft - 1, true)
      if (!isOk(right)) return right
      return ok([...left.value, ...right.value])
    }
    return ok(
      heldBack(
        batch,
        'output-truncated',
        `output truncated (MAX_TOKENS) at batch size ${batch.length} — bisection exhausted`,
      ),
    )
  }

  const answers = extractAnswers(text)
  if (!answers) {
    if (retryUnparseableOnce) return classifyWithGuards(batch, deps, fetchJson, bisectionsLeft, false)
    return ok(heldBack(batch, 'unparseable', 'could not parse a JSON array from the response, even after one retry'))
  }

  // Per-item completeness, not a batch-level check: `alignByIndex` walks
  // `batch` — every REQUESTED product, not merely every ANSWERED one — so a
  // response that skips an index still produces a `no-answer` outcome for
  // it, never a silently shorter result.
  return ok(alignByIndex(batch, answers, deps.model, deps.tier))
}

export function createGeminiClassifier(deps: GeminiDeps): Classifier {
  const batchSize = deps.batchSize ?? 25
  const fetchJson = deps.fetchJson ?? ((url: string, body: string) => httpPost(url, body, deps.gate))

  return {
    name: deps.model,
    tier: deps.tier,
    batchSize,

    async classify(batch: readonly ClassificationRequest[]): Promise<Result<readonly ClassificationOutcome[]>> {
      return classifyWithGuards(batch, deps, fetchJson, MAX_BISECTIONS, true)
    },
  }
}
