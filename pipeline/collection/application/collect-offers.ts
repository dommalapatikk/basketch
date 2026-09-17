// collectOffers — runs every source for a week and returns what survived.
//
// This is the only place that decides what happens when a source misbehaves.
// Three guarantees:
//   1. One source failing never stops the others.
//   2. An adapter that THROWS (a bug, not a handled failure) is contained here
//      and reported as a failure — it never crashes the run.
//   3. A source that hangs is cut off by a timeout rather than blocking the cron.
//
// Application layer: may import the domain, never infrastructure.

import { type Offer, type Retailer, dedupeOffers } from '../domain/offer'
import type { CollectionResult, IsoWeek, OfferSource } from '../domain/offer-source'
import { type Clock, type RunTrace, type SourceSpan, type Telemetry, noopTelemetry, systemClock } from './telemetry'

export type CollectOffersOptions = {
  telemetry?: Telemetry
  clock?: Clock
  /** Per-source ceiling. A stuck source must not hold up the weekly run. */
  timeoutMs?: number
  /** Injected so traces are deterministic under test. */
  newRunId?: () => string
  /**
   * WP-J1 (D5). The date each source's OWN `editionFor` is asked about —
   * "which publication is in effect right now", never a single ISO week
   * shared across all seven. Defaults to `new Date()`. This is deliberately
   * separate from the `runWeek: IsoWeek` argument below, which stays a
   * display label for the trace/telemetry — it is not fed to any adapter
   * any more. The per-source fact this actually drives lands on
   * `SourceSpan.publication` (code review MUST-FIX 1).
   */
  referenceDate?: Date
}

export type CollectOffersOutcome = {
  readonly runId: string
  readonly offers: readonly Offer[]
  readonly results: readonly CollectionResult[]
  readonly trace: RunTrace
}

const DEFAULT_TIMEOUT_MS = 120_000

function defaultRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Rejects if the source has not settled in time, without leaving a dangling timer. */
function withTimeout(promise: Promise<CollectionResult>, ms: number): Promise<CollectionResult> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : JSON.stringify(e)
}

async function runOne(
  source: OfferSource,
  referenceDate: Date,
  timeoutMs: number,
  clock: Clock,
): Promise<{ result: CollectionResult; span: SourceSpan }> {
  const startedAt = clock.now()

  // WP-J1 (D5): the enforcement point must know WHICH publication before it
  // fetches. Each source names its own — never a single week shared across
  // all seven (item 1 RCA: run.ts used to compute one ISO week and hand it
  // to every adapter, which is how Migros ended up asking for a flyer that
  // was not published yet). Computed once, OUTSIDE the try/catch that guards
  // `fetchOffers`: `editionFor` is contractually pure and never throws
  // (port-contract.test.ts), so a throw here is a genuine adapter bug the
  // contract test should already have caught, not a network-shaped failure
  // this function exists to contain.
  const edition = source.editionFor(referenceDate)

  const finish = (result: CollectionResult): { result: CollectionResult; span: SourceSpan } => {
    const durationMs = clock.now() - startedAt
    const span: SourceSpan =
      result.ok === true
        ? {
            retailer: result.retailer,
            publication: edition.publication,
            durationMs,
            status: 'ok',
            offerCount: result.offers.length,
            warningCount: result.warnings.length,
            warnings: result.warnings.map((w) => (w.item ? `${w.item}: ${w.message}` : w.message)),
            degraded: result.degraded,
          }
        : {
            retailer: result.retailer,
            publication: edition.publication,
            durationMs,
            status: 'failed',
            offerCount: 0,
            warningCount: 0,
            failureReason: result.reason,
            detail: result.detail,
            warnings: [],
            degraded: false,
          }
    return { result, span }
  }

  try {
    return finish(await withTimeout(source.fetchOffers(edition), timeoutMs))
  } catch (e) {
    // An adapter is contractually forbidden from throwing. If one does, that is
    // a defect — contain it, report it, and let the other sources finish.
    return finish({
      ok: false,
      retailer: source.retailer,
      reason: 'source-unavailable',
      detail: `adapter threw: ${errorMessage(e)}`,
    })
  }
}

export async function collectOffers(
  sources: readonly OfferSource[],
  runWeek: IsoWeek,
  options: CollectOffersOptions = {},
): Promise<CollectOffersOutcome> {
  const telemetry = options.telemetry ?? noopTelemetry
  const clock = options.clock ?? systemClock
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const runId = (options.newRunId ?? defaultRunId)()
  const referenceDate = options.referenceDate ?? new Date()

  const startedAtIso = clock.isoNow()
  const startedAt = clock.now()
  const retailers: Retailer[] = sources.map((s) => s.retailer)
  telemetry.runStarted(runId, runWeek, retailers)

  // Sources are independent; run them together so one slow retailer does not
  // serialise the whole cron. Never rejects — runOne contains its own errors.
  const settled = await Promise.all(sources.map((s) => runOne(s, referenceDate, timeoutMs, clock)))

  const results: CollectionResult[] = []
  const spans: SourceSpan[] = []
  const collected: Offer[] = []

  for (const { result, span } of settled) {
    results.push(result)
    spans.push(span)
    telemetry.sourceFinished(runId, span)
    if (result.ok) collected.push(...result.offers)
  }

  // Dedupe across sources as well as within one: the same offer can arrive
  // twice from a single retailer (observed in Denner's own API).
  const offers = dedupeOffers(collected)

  const okCount = spans.filter((s) => s.status === 'ok').length
  // An ok-but-degraded source (WP-C3 / HANDOVER item 8: a source serving too
  // many display-truncated names) must surface here too — otherwise the
  // exact scenario the guard exists for (aktionis changes its markup, ~30%
  // of cards fall back) sets the flag and nothing downstream ever reads it.
  const anyDegraded = spans.some((s) => s.status === 'ok' && s.degraded)
  const status: RunTrace['status'] =
    okCount === 0 ? 'failed' : okCount === spans.length && !anyDegraded ? 'ok' : 'degraded'

  const trace: RunTrace = {
    runId,
    runWeek,
    startedAt: startedAtIso,
    durationMs: clock.now() - startedAt,
    sources: spans,
    totalOffers: offers.length,
    status,
  }
  telemetry.runFinished(trace)

  return { runId, offers, results, trace }
}
