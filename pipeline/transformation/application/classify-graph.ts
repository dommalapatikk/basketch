// The classification agent — a LangGraph state machine.
//
// Every branch here was measured on the Denner benchmark, not designed from
// intuition. The measurements that shaped it (2026-09-10, 291 products):
//
//   self-reported confidence   5 of 291 scored below 0.9, yet 16 were WRONG.
//                              The model is confidently wrong, so confidence
//                              cannot be the escalation trigger.
//   judge (gpt-5-nano)         caught 25% of errors with a 0% FALSE-ALARM rate.
//                              When it says "wrong", believe it. So the judge
//                              is the trigger.
//   reflect (same model)       fixed 2, broke 1 on the items it saw. Positive
//                              but marginal — it only runs on disputed items.
//   repair                     0 work on a clean run; insurance for the day a
//                              provider returns the whole category list as an
//                              answer, which gpt-5-nano did.
//
// The graph never throws. Failure is an edge; the budget is a node; uncertainty
// is a terminal state, not an error.

import { END, START, StateGraph } from '@langchain/langgraph'
import { isOk } from '../../collection/domain/result'
import type { Classification } from '../domain/classification'
import { type ClassificationRequest, type Classifier, guardClassifier } from '../domain/classifier'
import {
  type Budget,
  type BudgetState,
  ZERO_SPEND,
  checkBudget,
  mayEscalate,
  recordSpend,
  sanitiseDescriptor,
  sanitiseForPrompt,
} from '../domain/guardrails'
import { guardJudge, guardReflector } from './port-guards'

/** Verdict from the judge. It never sets the category — only its trust. */
export type JudgeVerdict = 'correct' | 'defensible' | 'wrong' | 'unavailable'

export type Judge = {
  readonly name: string
  judge(
    request: ClassificationRequest,
    answer: { category: string; subCategory: string },
  ): Promise<{ verdict: JudgeVerdict; tokens: number }>
}

/** Revises a disputed answer by arguing against it. Same model, new question. */
export type Reflector = {
  reflect(
    request: ClassificationRequest,
    answer: Classification,
  ): Promise<{ classification: Classification | null; tokens: number }>
}

export type Outcome = {
  readonly request: ClassificationRequest
  readonly classification: Classification | null
  /** Terminal state. 'uncertain' is a RESULT, never an error. */
  readonly status: 'classified' | 'uncertain' | 'rejected' | 'skipped-budget'
  readonly judgeVerdict: JudgeVerdict | null
  readonly reflected: boolean
  readonly detail?: string
}

export type GraphState = {
  pending: ClassificationRequest[]
  outcomes: Outcome[]
  disputed: { request: ClassificationRequest; classification: Classification }[]
  budget: BudgetState
  halted: string | null
}

export type GraphDeps = {
  tier1: Classifier
  judge: Judge | null
  reflector: Reflector | null
  budget: Budget
  /** Judge only a sample — judging every product doubles the call count. */
  judgeSampleRate?: number
  /** Told when a port breaks its contract and throws. Silence would hide a defect. */
  log?: (message: string) => void
}

const channels = {
  pending: { value: (_: ClassificationRequest[], b: ClassificationRequest[]) => b, default: () => [] },
  outcomes: { value: (a: Outcome[], b: Outcome[]) => a.concat(b), default: () => [] },
  // REPLACE, not append. `outcomes` accumulates because every node adds final
  // results; `disputed` is a WORKLIST that each node hands on in reduced form.
  // With append semantics the judge's empty remainder never clears the list, so
  // reflection runs on a clean run and outcomes are emitted twice — which is
  // exactly what three tests caught.
  disputed: {
    value: (
      _a: { request: ClassificationRequest; classification: Classification }[],
      b: { request: ClassificationRequest; classification: Classification }[],
    ) => b,
    default: () => [],
  },
  budget: { value: (_: BudgetState, b: BudgetState) => b, default: () => ZERO_SPEND },
  halted: { value: (_: string | null, b: string | null) => b, default: () => null },
}

export function buildClassifyGraph(deps: GraphDeps) {
  const judgeRate = deps.judgeSampleRate ?? 1
  const log = deps.log ?? (() => {})

  // The graph defends itself rather than trusting what it was handed. CLAUDE.md
  // says pipeline ports never throw; every adapter we own honours that, and the
  // graph used to depend on their politeness. One unhandled rejection ~800
  // products deep discards the whole run, so the contract is enforced here,
  // once, where no caller and no future adapter can opt out of it.
  const tier1 = guardClassifier(deps.tier1, log)
  const judge = deps.judge ? guardJudge(deps.judge, log) : null
  const reflector = deps.reflector ? guardReflector(deps.reflector, log) : null

  const graph = new StateGraph<GraphState>({ channels })

    // ── guard ────────────────────────────────────────────────────────────────
    // Untrusted third-party text. A product name arrives from a retailer flyer
    // or OCR and goes straight into a prompt; anything steering the model dies
    // here, before it can.
    .addNode('guard', async (s: GraphState) => {
      const safe: ClassificationRequest[] = []
      const rejected: Outcome[] = []
      for (const r of s.pending) {
        const name = sanitiseForPrompt(r.productName)
        if (!isOk(name)) {
          rejected.push({ request: r, classification: null, status: 'rejected', judgeVerdict: null, reflected: false, detail: name.error })
          continue
        }
        const desc = sanitiseDescriptor(r.descriptor)
        safe.push({
          ...r,
          productName: name.value.value,
          descriptor: isOk(desc) ? (desc.value?.value ?? null) : null,
        })
      }
      return { pending: safe, outcomes: rejected }
    })

    // ── classify ─────────────────────────────────────────────────────────────
    .addNode('classify', async (s: GraphState) => {
      const verdict = checkBudget(deps.budget, s.budget)
      if (!verdict.ok) {
        return {
          halted: verdict.reason,
          outcomes: s.pending.map((r) => ({
            request: r, classification: null, status: 'skipped-budget' as const,
            judgeVerdict: null, reflected: false, detail: verdict.reason,
          })),
          pending: [],
        }
      }

      const outcomes: Outcome[] = []
      const disputed: GraphState['disputed'] = []
      let budget = s.budget
      const size = tier1.batchSize

      for (let i = 0; i < s.pending.length; i += size) {
        const batch = s.pending.slice(i, i + size)
        const res = await tier1.classify(batch)
        budget = recordSpend(budget, 0)

        // A provider failure is an EDGE, not an exception. The batch is
        // reported as uncertain and the run continues — it never writes a
        // guessed category and never silently drops a product.
        if (!isOk(res)) {
          outcomes.push(...batch.map((r) => ({
            request: r, classification: null, status: 'uncertain' as const,
            judgeVerdict: null, reflected: false, detail: res.error,
          })))
          continue
        }

        for (const o of res.value) {
          if (!o.ok) {
            outcomes.push({ request: o.request, classification: null, status: 'uncertain', judgeVerdict: null, reflected: false, detail: o.detail })
            continue
          }
          disputed.push({ request: o.request, classification: o.classification })
        }
      }

      return { pending: [], outcomes, disputed, budget }
    })

    // ── judge ────────────────────────────────────────────────────────────────
    // The escalation trigger. NOT self-reported confidence: measured at 5 of 291
    // below 0.9 while 16 were wrong. The judge had a 0% false-alarm rate, so a
    // "wrong" verdict is trustworthy in a way the model's own score is not.
    .addNode('judge', async (s: GraphState) => {
      if (!judge) {
        return {
          disputed: [],
          outcomes: s.disputed.map((d) => ({
            request: d.request, classification: d.classification,
            status: 'classified' as const, judgeVerdict: null, reflected: false,
          })),
        }
      }

      const outcomes: Outcome[] = []
      const stillDisputed: GraphState['disputed'] = []
      let budget = s.budget

      for (const [i, d] of s.disputed.entries()) {
        // Sampling keeps the judge affordable; unjudged answers are accepted as
        // classified rather than held back.
        if (judgeRate < 1 && i % Math.round(1 / judgeRate) !== 0) {
          outcomes.push({ request: d.request, classification: d.classification, status: 'classified', judgeVerdict: null, reflected: false })
          continue
        }
        if (!mayEscalate(deps.budget, budget)) {
          outcomes.push({ request: d.request, classification: d.classification, status: 'classified', judgeVerdict: null, reflected: false })
          continue
        }

        const { verdict, tokens } = await judge.judge(d.request, {
          category: d.classification.category,
          subCategory: d.classification.subCategory,
        })
        budget = recordSpend(budget, tokens)

        if (verdict === 'wrong') stillDisputed.push(d)
        else outcomes.push({ request: d.request, classification: d.classification, status: 'classified', judgeVerdict: verdict, reflected: false })
      }

      return { disputed: stillDisputed, outcomes, budget }
    })

    // ── reflect ──────────────────────────────────────────────────────────────
    // Only ever sees answers the judge disputed. Asks a DIFFERENT question from
    // "classify this again" — "what would make your answer wrong?" — which is
    // the only way one model can catch its own misunderstanding rather than a
    // slip.
    .addNode('reflect', async (s: GraphState) => {
      const outcomes: Outcome[] = []
      let budget = s.budget

      for (const d of s.disputed) {
        if (!reflector || !mayEscalate(deps.budget, budget)) {
          outcomes.push({ request: d.request, classification: d.classification, status: 'uncertain', judgeVerdict: 'wrong', reflected: false, detail: 'judge disputed; no reflection available' })
          continue
        }

        const { classification, tokens } = await reflector.reflect(d.request, d.classification)
        budget = recordSpend(budget, tokens)

        if (!classification) {
          outcomes.push({ request: d.request, classification: d.classification, status: 'uncertain', judgeVerdict: 'wrong', reflected: true, detail: 'reflection produced no answer' })
          continue
        }

        // Reflection changed its mind -> accept the revision.
        // Reflection held its ground against a judge that disputed it -> the two
        // disagree, and that IS the uncertainty signal. Flag for review rather
        // than pick a winner.
        const changed = classification.category !== d.classification.category
        outcomes.push({
          request: d.request,
          classification,
          status: changed ? 'classified' : 'uncertain',
          judgeVerdict: 'wrong',
          reflected: true,
          detail: changed ? 'revised after reflection' : 'judge and classifier disagree',
        })
      }

      return { disputed: [], outcomes, budget }
    })

  graph.addEdge(START, 'guard' as never)
  graph.addEdge('guard' as never, 'classify' as never)
  graph.addEdge('classify' as never, 'judge' as never)

  // The only conditional edge: reflection runs solely when the judge disputed
  // something. On a clean run it never executes and costs nothing.
  graph.addConditionalEdges(
    'judge' as never,
    (s: GraphState) => (s.disputed.length > 0 ? 'reflect' : END),
    { reflect: 'reflect' as never, [END]: END } as never,
  )
  graph.addEdge('reflect' as never, END)

  return graph.compile()
}
