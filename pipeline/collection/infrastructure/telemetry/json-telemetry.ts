// JSON telemetry — structured, one event per line, to stdout.
//
// WHY stdout and not a service: GitHub Actions captures stdout for free and
// keeps it for 90 days. That is the whole observability budget basketch has,
// and it is enough to answer "which source broke, when, and by how much".
// A hosted collector can be added later by writing another Telemetry adapter;
// nothing else has to change.
//
// Infrastructure layer: implements a domain/application port. Nothing imports
// this from the domain.

import type { RunTrace, SourceSpan, Telemetry } from '../../application/telemetry'
import type { Retailer } from '../../domain/offer'
import type { IsoWeek } from '../../domain/offer-source'

type Sink = (line: string) => void

const defaultSink: Sink = (line) => {
  process.stdout.write(`${line}\n`)
}

/**
 * Emits newline-delimited JSON. Each line carries `runId` so a whole run can be
 * reassembled from the log with a single grep.
 */
export function createJsonTelemetry(sink: Sink = defaultSink): Telemetry {
  const emit = (event: Record<string, unknown>) => sink(JSON.stringify(event))

  return {
    runStarted(runId: string, week: IsoWeek, retailers: readonly Retailer[]) {
      emit({ event: 'collection.run.started', runId, week, retailers, sourceCount: retailers.length })
    },

    sourceFinished(runId: string, span: SourceSpan) {
      emit({
        event: 'collection.source.finished',
        runId,
        retailer: span.retailer,
        status: span.status,
        offerCount: span.offerCount,
        warningCount: span.warningCount,
        durationMs: span.durationMs,
        ...(span.failureReason ? { failureReason: span.failureReason, detail: span.detail } : {}),
        // Cap warnings: a badly broken parse can produce hundreds, and the log
        // should stay readable. The count above remains exact.
        ...(span.warnings.length > 0 ? { warnings: span.warnings.slice(0, 20) } : {}),
      })
    },

    runFinished(trace: RunTrace) {
      emit({
        event: 'collection.run.finished',
        runId: trace.runId,
        week: trace.week,
        status: trace.status,
        totalOffers: trace.totalOffers,
        durationMs: trace.durationMs,
        sources: trace.sources.map((s) => ({
          retailer: s.retailer,
          status: s.status,
          offerCount: s.offerCount,
          durationMs: s.durationMs,
          ...(s.failureReason ? { failureReason: s.failureReason } : {}),
        })),
      })
    },
  }
}

/** Fans out to several telemetry backends. */
export function combineTelemetry(...backends: readonly Telemetry[]): Telemetry {
  return {
    runStarted: (runId, week, retailers) => {
      for (const b of backends) b.runStarted(runId, week, retailers)
    },
    sourceFinished: (runId, span) => {
      for (const b of backends) b.sourceFinished(runId, span)
    },
    runFinished: (trace) => {
      for (const b of backends) b.runFinished(trace)
    },
  }
}

/**
 * Markdown table for the GitHub Actions run summary, so a failure is visible
 * without opening the log. Write to $GITHUB_STEP_SUMMARY.
 */
export function formatRunSummary(trace: RunTrace): string {
  const icon = { ok: '✅', degraded: '⚠️', failed: '❌' }[trace.status]
  const lines = [
    `## ${icon} Collection ${trace.status} — ${trace.week}`,
    '',
    `**${trace.totalOffers}** offers in ${(trace.durationMs / 1000).toFixed(1)}s · run \`${trace.runId}\``,
    '',
    '| Store | Status | Offers | Warnings | Time |',
    '|---|---|---:|---:|---:|',
  ]

  for (const s of trace.sources) {
    const status = s.status === 'ok' ? '✅ ok' : `❌ ${s.failureReason}`
    lines.push(
      `| ${s.retailer} | ${status} | ${s.offerCount} | ${s.warningCount} | ${(s.durationMs / 1000).toFixed(1)}s |`,
    )
  }

  const failed = trace.sources.filter((s) => s.status === 'failed')
  if (failed.length > 0) {
    lines.push('', '### Failures', '')
    for (const f of failed) lines.push(`- **${f.retailer}** — ${f.failureReason}: ${f.detail ?? ''}`)
  }

  return lines.join('\n')
}
