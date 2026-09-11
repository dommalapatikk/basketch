// Telemetry — the observability port for a collection run.
//
// WHY this exists and why it is small:
// `pipeline_runs` has been written on every run for months and nothing reads it,
// so the categorisation regression stayed invisible. The fix is not a bigger
// stack — it is emitting enough structure that a failure is legible, and giving
// the existing table something worth reading.
//
// Deliberately NOT OpenTelemetry: no collector to run, no dependency, no cost.
// basketch is a weekly cron on a free tier. Right-sized beats textbook —
// see CLAUDE.md § Domain-Driven Design.
//
// Time and IDs are injected so traces are deterministic under test.

import type { Retailer } from '../domain/offer'
import type { CollectionFailureReason, IsoWeek } from '../domain/offer-source'

export type SourceSpan = {
  readonly retailer: Retailer
  readonly durationMs: number
  readonly status: 'ok' | 'failed'
  readonly offerCount: number
  readonly warningCount: number
  /** Present only when status is 'failed'. */
  readonly failureReason?: CollectionFailureReason
  readonly detail?: string
  /** Offers dropped before they reached the domain, with reasons. */
  readonly warnings: readonly string[]
}

export type RunTrace = {
  readonly runId: string
  readonly week: IsoWeek
  readonly startedAt: string
  readonly durationMs: number
  readonly sources: readonly SourceSpan[]
  readonly totalOffers: number
  /** ok = every source succeeded · degraded = some failed · failed = all failed. */
  readonly status: 'ok' | 'degraded' | 'failed'
}

export type Telemetry = {
  runStarted(runId: string, week: IsoWeek, retailers: readonly Retailer[]): void
  sourceFinished(runId: string, span: SourceSpan): void
  runFinished(trace: RunTrace): void
}

export type Clock = {
  now(): number
  isoNow(): string
}

export const systemClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
}

/** Used in tests and wherever telemetry is genuinely not wanted. */
export const noopTelemetry: Telemetry = {
  runStarted: () => {},
  sourceFinished: () => {},
  runFinished: () => {},
}

/** Captures everything in memory. Test double, and useful for assertions. */
export function createInMemoryTelemetry(): Telemetry & {
  readonly spans: SourceSpan[]
  readonly traces: RunTrace[]
} {
  const spans: SourceSpan[] = []
  const traces: RunTrace[] = []
  return {
    spans,
    traces,
    runStarted: () => {},
    sourceFinished: (_runId, span) => {
      spans.push(span)
    },
    runFinished: (trace) => {
      traces.push(trace)
    },
  }
}

/**
 * Shape expected by the existing `pipeline_runs` table (see pipeline/store.ts).
 * Mapping to it rather than adding a table keeps one source of truth for runs.
 */
export type PipelineRunRecord = {
  store_results: Record<string, { status: string; count: number }>
  total_stored: number
  duration_ms: number
  error_log: string | null
}

export function toPipelineRunRecord(trace: RunTrace): PipelineRunRecord {
  const store_results: Record<string, { status: string; count: number }> = {}
  for (const s of trace.sources) {
    store_results[s.retailer] = {
      status: s.status === 'ok' ? 'ok' : (s.failureReason ?? 'failed'),
      count: s.offerCount,
    }
  }

  const failures = trace.sources
    .filter((s) => s.status === 'failed')
    .map((s) => `[${s.retailer}] ${s.failureReason}: ${s.detail ?? ''}`.trim())

  return {
    store_results,
    total_stored: trace.totalOffers,
    duration_ms: trace.durationMs,
    error_log: failures.length > 0 ? failures.join('\n') : null,
  }
}
