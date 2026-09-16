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
import { type ClassificationFailure, type ClassificationRequest, type Classifier, guardClassifier } from '../domain/classifier'
import {
  type Budget,
  type BudgetState,
  ZERO_SPEND,
  checkBudget,
  mayEscalate,
  recordSpend,
  reserveCall,
  sanitiseDescriptor,
  sanitiseForPrompt,
  settleTokens,
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
  /**
   * Set exactly when this outcome came from something going WRONG — never
   * for a genuine content disagreement. WP-P6a F1: an 'uncertain' outcome
   * that is RESOURCE-limited (the escalation budget ran out before this
   * product's turn; reflection ran and returned nothing) says NOTHING
   * about whether the category is actually wrong — unlike "the judge
   * disputed it and reflection still disagrees", which IS the uncertainty
   * signal D3 exists to capture. `classify-deals.ts`'s cache must tell the
   * two apart: only the latter is safe to memoise as permanently uncertain.
   */
  readonly failure?: ClassificationFailure
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
  /**
   * Per-call judge token usage — NOT routed through `log`, which every
   * caller prefixes as a warning (`log` exists for port BREACHES). A
   * successful judge call reporting its own spend is ordinary operation,
   * not a defect, so it gets its own hook — the same reason the classifier
   * has `onUsage` rather than logging through its own breach channel.
   */
  onJudgeUsage?: (tokens: number, verdict: JudgeVerdict) => void
}

/** One disputed item, accepted as classified without ever reaching the judge — sampled out, or the escalation budget is spent. */
function acceptedWithoutJudging(d: { request: ClassificationRequest; classification: Classification }): Outcome {
  return { request: d.request, classification: d.classification, status: 'classified', judgeVerdict: null, reflected: false }
}

/**
 * Decides, for EVERY disputed item, whether it is judged at all — sampling
 * and the escalation-budget check both run here, in ONE synchronous pass,
 * strictly BEFORE any judge call is dispatched. A decision made once a
 * concurrent call is already in flight would be racing the thing it is
 * meant to gate, which is not a gate.
 *
 * WP-P6 code review, MUST-FIX 1. `budget` is READ ONCE from `mayEscalate`'s
 * point of view only if it is never updated across the pass — the first
 * version of this function took a `mayEscalateNow` closure over a budget
 * that was only reassigned AFTER the judge calls resolved, so every item in
 * this loop saw the SAME starting state. Measured: `maxCalls: 10` (the 80%
 * line: 8) admitted 50 of 100 disputed items in one chunk, because nothing
 * during SELECTION ever moved the needle — either every item passed or none
 * did. `reserveCall` fixes this by reserving a call slot the moment an item
 * is ACCEPTED, so the NEXT item's check already accounts for it, in the same
 * synchronous pass, before any of them has actually run.
 */
export function selectForJudging(
  disputed: GraphState['disputed'],
  judgeRate: number,
  budget: BudgetState,
  policy: Budget,
): { readonly toJudge: GraphState['disputed']; readonly accepted: Outcome[]; readonly reserved: BudgetState } {
  const toJudge: GraphState['disputed'] = []
  const accepted: Outcome[] = []
  let reserved = budget

  for (const [i, d] of disputed.entries()) {
    // Sampling keeps the judge affordable; unjudged answers are accepted as
    // classified rather than held back.
    const sampledOut = judgeRate < 1 && i % Math.round(1 / judgeRate) !== 0
    if (sampledOut || !mayEscalate(policy, reserved)) {
      accepted.push(acceptedWithoutJudging(d))
      continue
    }
    toJudge.push(d)
    reserved = reserveCall(reserved)
  }

  return { toJudge, accepted, reserved }
}

/**
 * Folds every judge verdict (from a bounded-concurrency `Promise.all`) back
 * into outcomes and the still-disputed worklist. `judged[i]` answers
 * `toJudge[i]` — `Promise.all` preserves array order regardless of which
 * call resolved first, so this never needs its own index bookkeeping.
 */
function foldJudgeResults(
  toJudge: GraphState['disputed'],
  judged: readonly { verdict: JudgeVerdict; tokens: number }[],
  onVerdict: (tokens: number, verdict: JudgeVerdict) => void,
): { readonly outcomes: Outcome[]; readonly stillDisputed: GraphState['disputed'] } {
  const outcomes: Outcome[] = []
  const stillDisputed: GraphState['disputed'] = []

  toJudge.forEach((d, i) => {
    const result = judged[i]
    if (!result) return // Promise.all guarantees this never happens; defensive, not reachable.
    onVerdict(result.tokens, result.verdict)

    if (result.verdict === 'wrong') stillDisputed.push(d)
    else outcomes.push({ request: d.request, classification: d.classification, status: 'classified', judgeVerdict: result.verdict, reflected: false })
  })

  return { outcomes, stillDisputed }
}

/**
 * One disputed item through reflection. Sequential — reflection only ever
 * runs on what the judge disputed (a small remainder), so concurrency here
 * has not been measured as worth the complexity the way the judge's own
 * ~10.3s-per-call cost was.
 */
async function reflectOne(
  d: { request: ClassificationRequest; classification: Classification },
  reflector: Reflector,
  budget: BudgetState,
  policy: Budget,
): Promise<{ readonly outcome: Outcome; readonly budget: BudgetState }> {
  // WP-P6a F1: the escalation BUDGET ran out before this product's turn — a
  // fact about THIS RUN, not about the product. `failure` set so
  // `classify-deals.ts` never memoises it as a permanent uncertain the way a
  // genuine judge/reflector disagreement is.
  if (!mayEscalate(policy, budget)) {
    return {
      outcome: {
        request: d.request, classification: d.classification, status: 'uncertain',
        judgeVerdict: 'wrong', reflected: false,
        detail: 'judge disputed; escalation budget exhausted', failure: 'budget-exhausted',
      },
      budget,
    }
  }

  const { classification, tokens } = await reflector.reflect(d.request, d.classification)
  const spent = recordSpend(budget, tokens)

  if (!classification) {
    // WP-P6a F1: the reflector RAN and produced nothing — a resource limit
    // (a dead provider, an unparseable reply), not a content signal.
    return {
      outcome: {
        request: d.request, classification: d.classification, status: 'uncertain',
        judgeVerdict: 'wrong', reflected: true,
        detail: 'reflection produced no answer', failure: 'no-answer',
      },
      budget: spent,
    }
  }

  // Reflection changed its mind -> accept the revision.
  // Reflection held its ground against a judge that disputed it -> the two
  // disagree, and that IS the uncertainty signal. Flag for review rather
  // than pick a winner. No `failure` here — this is the genuine content
  // disagreement WP-P6a's cache exists to remember, not a resource limit.
  const changed = classification.category !== d.classification.category
  return {
    outcome: {
      request: d.request,
      classification,
      status: changed ? 'classified' : 'uncertain',
      judgeVerdict: 'wrong',
      reflected: true,
      detail: changed ? 'revised after reflection' : 'judge and classifier disagree',
    },
    budget: spent,
  }
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
  const onJudgeUsage = deps.onJudgeUsage ?? (() => {})

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
            // MUST-FIX 2 (WP-P6 code review): the RUN's own token/call/spend
            // budget, not the escalation one D4 targets — same reported
            // reason kind, so classify-deals.ts's held-back breakdown does
            // not need a third bucket for what is, from an operator's view,
            // the same shape of "budget ran out before this product's turn".
            failure: 'budget-exhausted' as const,
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
        //
        // 'provider-unavailable' here: a whole-batch Err from `classify()` is
        // always a TRANSPORT-level failure (the network threw, or Google
        // returned an explicit error payload) — never a content failure. D4's
        // content guards (truncation, unparseable output) are handled INSIDE
        // the adapter and never surface as a batch-level Err (see
        // `gemini-classifier.ts`'s `classifyWithGuards`); they reach here, if
        // at all, as the per-item `!o.ok` branch below, carrying their own
        // `o.reason`.
        if (!isOk(res)) {
          outcomes.push(...batch.map((r) => ({
            request: r, classification: null, status: 'uncertain' as const,
            judgeVerdict: null, reflected: false, detail: res.error,
            failure: 'provider-unavailable' as const,
          })))
          continue
        }

        for (const o of res.value) {
          if (!o.ok) {
            outcomes.push({ request: o.request, classification: null, status: 'uncertain', judgeVerdict: null, reflected: false, detail: o.detail, failure: o.reason })
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
    //
    // WP-P6: judged ONE PRODUCT AT A TIME, sequentially, at ~10.3s each — a
    // 400-product cold-start miss set took ~69 minutes against a 45-minute
    // step (`docs/rca/2026-09-15-tech-lead-items-6-9.md` §9.1). Dispatching
    // through `Promise.all` below and letting the (provider, model) gate's
    // own semaphore (`model-gate.ts`, `maxInFlight: 4` on `JUDGE_CHAIN[0]` in
    // `model-registry.ts`) bound the actual concurrency cuts that to ~330s
    // per 100 products — see `JUDGE_CHAIN[0]`'s own comment for the
    // corrected arithmetic (the gate's paced 18 req/min ceiling binds
    // before 4-in-flight latency does, so this is a ~3x win, not 4x).
    // Nothing about PACING changes: the gate already owns rate, retry and
    // the circuit — this node only changes how many calls it has
    // OUTSTANDING at once, never how fast the provider's bucket refills.
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

      // `selectForJudging` reserves a call slot PER ACCEPTED ITEM, in one
      // synchronous pass, BEFORE any judge call is dispatched — see its own
      // doc comment (MUST-FIX 1). `reserved` already carries every accepted
      // item's call slot; `foldJudgeResults` below only has to settle the
      // REAL token cost once `Promise.all` resolves, via `settleTokens`
      // (never `recordSpend`, which would count each call a second time).
      const { toJudge, accepted, reserved } = selectForJudging(s.disputed, judgeRate, s.budget, deps.budget)
      let budget = reserved

      // Bounded concurrency lives in the GATE (`model-gate.ts`'s semaphore,
      // `policy.maxInFlight`), not here — `Promise.all` dispatches every
      // remaining item at once, and the SHARED gate behind `judge.judge()`
      // admits at most `maxInFlight` HTTP attempts at a time, queuing the
      // rest.
      const judged = await Promise.all(
        toJudge.map((d) => judge.judge(d.request, { category: d.classification.category, subCategory: d.classification.subCategory })),
      )

      const { outcomes, stillDisputed } = foldJudgeResults(toJudge, judged, (tokens, verdict) => {
        budget = settleTokens(budget, tokens)
        onJudgeUsage(tokens, verdict)
      })

      return { disputed: stillDisputed, outcomes: [...accepted, ...outcomes], budget }
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
        // No reflector configured AT ALL for this run: a standing fact about
        // THIS DEPLOYMENT, not a per-call resource limit — unchanged from
        // before WP-P6, and still safe to memoise (`classify-deals.test.ts`'s
        // WP-P6a suite already locks this behaviour in).
        if (!reflector) {
          outcomes.push({ request: d.request, classification: d.classification, status: 'uncertain', judgeVerdict: 'wrong', reflected: false, detail: 'judge disputed; no reflector configured' })
          continue
        }

        const result = await reflectOne(d, reflector, budget, deps.budget)
        outcomes.push(result.outcome)
        budget = result.budget
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
