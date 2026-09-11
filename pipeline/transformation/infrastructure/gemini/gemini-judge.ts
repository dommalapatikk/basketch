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

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

export type JudgeDeps = {
  apiKey: string
  model: string
  taxonomy: readonly TaxonomyEntry[]
  /** Injected so tests never touch the network. */
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
}

async function askOpenRouter(apiKey: string, model: string, prompt: string) {
  const res = await fetch(OPENROUTER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://basketch.vercel.app',
      'X-Title': 'basketch',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0 }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
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
  const ask = deps.ask ?? ((p: string) => askOpenRouter(deps.apiKey, deps.model, p))

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
      } catch {
        // A judge that is down must not block classification. The answer stands.
        return { verdict: 'unavailable', tokens: 0 }
      }
    },
  }
}

export type ReflectorDeps = {
  apiKey: string
  model: string
  taxonomy: readonly TaxonomyEntry[]
  ask?: (prompt: string) => Promise<{ text: string; tokens: number }>
}

async function askGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(`${GEMINI}/${model}:generateContent?key=${apiKey}`, {
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
  const ask = deps.ask ?? ((p: string) => askGemini(deps.apiKey, deps.model, p))

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
      } catch {
        return { classification: null, tokens: 0 }
      }
    },
  }
}
