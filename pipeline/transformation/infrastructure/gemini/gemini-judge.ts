// Judge and Reflector — the agent's second and third rungs, made real.
//
// Both were built, measured and then passed as `null` into the graph, so the
// agent ran as a single rung. These adapters connect them.
//
// WHAT WAS MEASURED, 2026-09-10, on the 291-product benchmark:
//
//   JUDGE (gpt-5-nano via OpenRouter, a DIFFERENT lab)
//     caught 25% of errors · FALSE-ALARM RATE 0% · 18/18 correct answers approved
//     That 0% is the number that matters: when it says "wrong", believe it.
//
//   SELF-REPORTED CONFIDENCE
//     only 5 of 291 scored below 0.9 — while 16 were wrong. The model is
//     CONFIDENTLY wrong, so confidence cannot be the escalation trigger.
//     The judge is.
//
//   REFLECT (same model, single item, "argue against your own answer")
//     fixed 2, broke 1 on the items it saw. Marginal, and it only ever runs on
//     answers the judge disputed, so its cost is bounded by the judge's 0%
//     false-alarm rate.

import { isOk } from '../../../collection/domain/result'
import type { Classification } from '../../domain/classification'
import { createClassification, createConfidence } from '../../domain/classification'
import type { ClassificationRequest } from '../../domain/classifier'
import type { Judge, JudgeVerdict, Reflector } from '../../application/classify-graph'
import {
  type TaxonomyEntry,
  buildJudgePrompt,
  buildReflectPrompt,
  extractAnswers,
} from '../classification-prompt'
import type { ModelGate } from '../model-gate'
import { postJson, summariseError } from '../model-http'

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

export type JudgeDeps = {
  apiKey: string
  model: string
  taxonomy: readonly TaxonomyEntry[]
  /** REQUIRED (WP-P5). This judge's own OpenRouter (provider, model) gate — see `model-gate.ts`. */
  gate: ModelGate
  /** Told about a judge call that ultimately failed, after the gate's own retries. Never swallowed. */
  log?: (message: string) => void
  /** Injected so tests never touch the network. */
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
}

// Bounded by model-http. The judge runs once per escalated product, in
// sequence, so a stall here holds up the whole classification chain.
async function askOpenRouter(apiKey: string, model: string, prompt: string, gate: ModelGate) {
  const j = (await postJson({
    url: OPENROUTER,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://basketch.vercel.app',
      'X-Title': 'basketch',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0 }),
    gate,
  })) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
  return { text: j?.choices?.[0]?.message?.content ?? '', tokens: j?.usage?.total_tokens ?? 0 }
}

/**
 * A judge from a different lab.
 *
 * It NEVER sets a category — it only decides whether one is trustworthy.
 * That distinction is what makes a model 15 points worse at classifying still
 * useful here: spotting that something looks wrong is an easier task than
 * producing the right answer.
 */
export function createOpenRouterJudge(deps: JudgeDeps): Judge {
  const ask = deps.ask ?? ((p: string) => askOpenRouter(deps.apiKey, deps.model, p, deps.gate))
  const log = deps.log ?? (() => {})

  return {
    name: deps.model,

    async judge(request, answer): Promise<{ verdict: JudgeVerdict; tokens: number }> {
      try {
        const { text, tokens } = await ask(buildJudgePrompt(deps.taxonomy, request, answer))
        const parsed = extractAnswers(text)?.[0] as { verdict?: string } | undefined
        const verdict = String(parsed?.verdict ?? '').toLowerCase()

        if (verdict === 'correct' || verdict === 'defensible' || verdict === 'wrong') {
          return { verdict, tokens }
        }
        // An unparseable verdict must not be read as disapproval — that would
        // escalate everything the moment the judge changed its output format.
        return { verdict: 'unavailable', tokens }
      } catch (e) {
        // A judge that is down must not block classification. The answer
        // stands — but a silent 429/402/timeout is exactly what made a dead
        // judge indistinguishable from an approving one (RCA item 6.2 step 4:
        // the reflector's identical silent catch hid a probable quota drain).
        log(`judge: ${summariseError(e)}`)
        return { verdict: 'unavailable', tokens: 0 }
      }
    },
  }
}

export type ReflectorDeps = {
  apiKey: string
  model: string
  taxonomy: readonly TaxonomyEntry[]
  /**
   * REQUIRED (WP-P5). The SAME gate as the tier-1 classifier when they share
   * a model — one Gemini quota, shared, not two limiters that never see each
   * other's calls.
   */
  gate: ModelGate
  /** Told about a reflection call that ultimately failed. Never swallowed — see the catch below. */
  log?: (message: string) => void
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
}

// Bounded by model-http, same reason as the judge above.
async function askGemini(apiKey: string, model: string, prompt: string, gate: ModelGate) {
  const j = (await postJson({
    url: `${GEMINI}/${model}:generateContent?key=${apiKey}`,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
    gate,
  })) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { totalTokenCount?: number }
  }
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return { text, tokens: j?.usageMetadata?.totalTokenCount ?? 0 }
}

/**
 * Asks the model to argue against its own answer before committing.
 *
 * Distinct from re-classifying: tier 2 asks the SAME question with fewer
 * products competing for attention. This asks a DIFFERENT question — "what
 * would make this wrong?" — which is the only way one model can catch a
 * misunderstanding rather than a slip.
 */
export function createGeminiReflector(deps: ReflectorDeps): Reflector {
  const ask = deps.ask ?? ((p: string) => askGemini(deps.apiKey, deps.model, p, deps.gate))
  const log = deps.log ?? (() => {})

  return {
    async reflect(
      request: ClassificationRequest,
      answer: Classification,
    ): Promise<{ classification: Classification | null; tokens: number }> {
      try {
        const prompt = buildReflectPrompt(deps.taxonomy, request, {
          category: answer.category,
          subCategory: answer.subCategory,
          confidence: answer.confidence.value,
        })
        const { text, tokens } = await ask(prompt)
        const parsed = extractAnswers(text)?.[0]
        if (!parsed) return { classification: null, tokens }

        const conf = createConfidence(typeof parsed.confidence === 'number' ? parsed.confidence : answer.confidence.value)
        if (!isOk(conf)) return { classification: null, tokens }

        const built = createClassification({
          category: String(parsed.category ?? ''),
          subCategory: String(parsed.subCategory ?? ''),
          confidence: conf.value,
          // Tier 2: this answer came from the escalation rung.
          tier: 2,
          model: deps.model,
        })

        // A reflection that produces an invalid category is no reflection. The
        // graph then treats the item as unresolved rather than accepting junk.
        return { classification: isOk(built) ? built.value : null, tokens }
      } catch (e) {
        // WP-P5 / RCA item 6.2 step 4: this catch used to swallow every
        // failure with no log at all, which made the reflector's own 429s
        // invisible — the probable-but-unproven cause of enrichment starting
        // with an already-drained bucket. It is now the diagnostic this run
        // needed: if reflect calls are 429ing, this line says so.
        log(`reflect: ${summariseError(e)}`)
        return { classification: null, tokens: 0 }
      }
    },
  }
}
