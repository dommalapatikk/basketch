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
  week: IsoWeek,
  timeoutMs: number,
  clock: Clock,
): Promise<{ result: CollectionResult; span: SourceSpan }> {
  const startedAt = clock.now()

  const finish = (result: CollectionResult): { result: CollectionResult; span: SourceSpan } => {
    const durationMs = clock.now() - startedAt
    const span: SourceSpan =
      result.ok === true
        ? {
            retailer: result.retailer,
            durationMs,
            status: 'ok',
            offerCount: result.offers.length,
            warningCount: result.warnings.length,
            warnings: result.warnings.map((w) => (w.item ? `${w.item}: ${w.message}` : w.message)),
          }
        : {
            retailer: result.retailer,
            durationMs,
            status: 'failed',
            offerCount: 0,
            warningCount: 0,
            failureReason: result.reason,
            detail: result.detail,
            warnings: [],
          }
    return { result, span }
  }

  try {
    return finish(await withTimeout(source.fetchOffers(week), timeoutMs))
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
  week: IsoWeek,
  options: CollectOffersOptions = {},
): Promise<CollectOffersOutcome> {
  const telemetry = options.telemetry ?? noopTelemetry
  const clock = options.clock ?? systemClock
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const runId = (options.newRunId ?? defaultRunId)()

  const startedAtIso = clock.isoNow()
  const startedAt = clock.now()
  const retailers: Retailer[] = sources.map((s) => s.retailer)
  telemetry.runStarted(runId, week, retailers)

  // Sources are independent; run them together so one slow retailer does not
  // serialise the whole cron. Never rejects — runOne contains its own errors.
  const settled = await Promise.all(sources.map((s) => runOne(s, week, timeoutMs, clock)))

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
  const status: RunTrace['status'] = okCount === spans.length ? 'ok' : okCount === 0 ? 'failed' : 'degraded'

  const trace: RunTrace = {
    runId,
    week,
    startedAt: startedAtIso,
    durationMs: clock.now() - startedAt,
    sources: spans,
    totalOffers: offers.length,
    status,
  }
  telemetry.runFinished(trace)

  return { runId, offers, results, trace }
}
