// model-probe — fail in ten seconds, not forty minutes.
//
// THE FAILURE THIS PREVENTS, observed 2026-09-10:
//
//   models.list       → "gemini-2.5-flash-lite"  ✅ listed as available
//   generateContent   → 404 "no longer available to new users"
//
// A listing is not availability. Without a probe, the day Google retires the
// configured model, the weekly run discovers it 72 batches deep at 05:00 on a
// Thursday, having burned its retry budget on a model that will never answer.
//
// The probe calls each model in the chain ONCE with a trivial prompt. Cost is
// a handful of tokens; the alternative is a silent week.
//
// The AbortController/setTimeout/clearTimeout dance this file used to hand-roll
// twice now lives in `model-http.ts`, which every model call in the pipeline
// goes through. The 15s budget below is the only thing that was ever specific
// to probing.

import type { ModelSpec, ProbeResult } from '../domain/model-registry'
import { postJson } from './model-http'

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

/** Short enough that a probe cannot itself stall a run — tighter than the call budget on purpose. */
const PROBE_TIMEOUT_MS = 15_000

async function probeGemini(model: string, apiKey: string): Promise<ProbeResult> {
  try {
    await postJson({
      url: `${GEMINI}/${model}:generateContent?key=${apiKey}`,
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }),
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    return { id: model, available: true }
  } catch (e) {
    return { id: model, available: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

async function probeOpenRouter(model: string, apiKey: string): Promise<ProbeResult> {
  try {
    await postJson({
      url: OPENROUTER,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://basketch.vercel.app',
        'X-Title': 'basketch',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ok' }], max_tokens: 5 }),
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    return { id: model, available: true }
  } catch (e) {
    return { id: model, available: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

export type ProbeKeys = { google?: string; openrouter?: string }

/**
 * Probes a chain, best model first, and STOPS at the first that answers.
 *
 * Stopping early matters: probing all three every run would spend tokens
 * confirming fallbacks nobody needs. A model is only probed when the ones above
 * it have already failed.
 */
export async function probeModels(chain: readonly ModelSpec[], keys: ProbeKeys): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []

  for (const spec of chain) {
    const key = spec.provider === 'google' ? keys.google : keys.openrouter
    if (!key) {
      results.push({ id: spec.id, available: false, detail: `no ${spec.provider} api key` })
      continue
    }

    const result = spec.provider === 'google' ? await probeGemini(spec.id, key) : await probeOpenRouter(spec.id, key)
    results.push(result)

    // The chain is ordered best-first, so the first success is the one we want.
    if (result.available) break
  }

  return results
}
