// SupabaseRunHistory — the RunHistory port, persisted. WP-P7 / RCA item 2, T2.
//
// THE DEFECT THIS CLOSES: `RunSnapshot.previous` was hardcoded `null` in
// `run-pipeline.ts`, forever, because nothing ever saved a snapshot anywhere
// — the comment at the call site said "No previous run to compare against
// yet. Passing null is honest," with no end condition. That "yet" never
// ended, and it alone kept four alert rules dead, two of them critical
// (classifier-regression, source-shape-changed).
//
// STORAGE (T2, Tech Lead ruling): one `pipeline_runs.metrics jsonb` column,
// append-only — `save` INSERTs a NEW row carrying only `metrics`, it never
// touches the row `store.ts#logPipelineRun` already writes every run for
// `store_results`/`total_stored`. Two independent, append-only writers to the
// same table is deliberate: neither can corrupt the other, and `metrics` is
// explicitly excluded from the anon view (`pipeline_runs_public` lists its
// columns by name — a new column is invisible to it by construction, not by
// policy anyone has to remember).
//
// "lastSuccessful" reads the most recent row that HAS a `metrics` value —
// i.e. the most recent run whose snapshot was recorded at all, not
// necessarily one that passed every alert. That is the right comparison for
// week-over-week DRIFT (classifier-regression, cache-hit-rate-low): the
// question those rules ask is "what changed since last time", not "what was
// the last time everything was fine".
//
// Supabase vocabulary stops here. The domain sees RunSnapshot.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type Result, err, ok } from '../../collection/domain/result'
import type { RunSnapshot } from '../domain/alerts'
import type { RunHistory } from '../application/run-snapshot'

const TABLE = 'pipeline_runs'

export type SupabaseRunHistoryDeps = {
  readonly client: SupabaseClient
  /** Told about a read/write that degraded, so it is visible, not silent. */
  readonly onDegraded?: (operation: 'read' | 'save', detail: string) => void
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Untrusted JSON pulled back out of `jsonb` — the shape could drift (a
 * schema change, a hand-edited row, a row from a future version of this
 * file) between when it was written and when it is read. Reading it as a
 * `RunSnapshot` without checking is exactly the "a stored row is not
 * trusted" rule the collection ledger design already applies to reloaded
 * offers (`docs/rca/2026-09-15-architect-items-1-2-5.md` §1.4).
 */
function isMeasured(v: unknown): v is RunSnapshot['benchmarkMacroF1'] {
  if (typeof v !== 'object' || v === null) return false
  const kind = (v as { kind?: unknown }).kind
  if (kind === 'measured') return typeof (v as { value?: unknown }).value === 'number'
  if (kind === 'not-measured') return typeof (v as { reason?: unknown }).reason === 'string'
  return false
}

function isRunSnapshot(v: unknown): v is RunSnapshot {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.runId === 'string' &&
    typeof s.finishedAtMs === 'number' &&
    typeof s.totalProducts === 'number' &&
    typeof s.classified === 'number' &&
    typeof s.uncertain === 'number' &&
    typeof s.rejected === 'number' &&
    typeof s.invalidCategoryRejected === 'number' &&
    typeof s.cacheHits === 'number' &&
    typeof s.cacheMisses === 'number' &&
    typeof s.tokensUsed === 'number' &&
    typeof s.usdMicrosSpent === 'number' &&
    typeof s.spendNearCeiling === 'boolean' &&
    typeof s.spendUnguarded === 'boolean' &&
    typeof s.durationMs === 'number' &&
    isMeasured(s.benchmarkMacroF1) &&
    typeof s.publishedDataCoverage === 'object' &&
    s.publishedDataCoverage !== null &&
    (s.halted === null || typeof s.halted === 'string')
  )
}

type Row = { metrics: unknown }

export function createSupabaseRunHistory(deps: SupabaseRunHistoryDeps): RunHistory {
  const degraded = (op: 'read' | 'save', detail: string) => deps.onDegraded?.(op, detail)

  return {
    async lastSuccessful(): Promise<Result<RunSnapshot | null>> {
      const { data, error } = await deps.client
        .from(TABLE)
        .select('metrics')
        .not('metrics', 'is', null)
        .order('run_at', { ascending: false })
        .limit(1)

      if (error) {
        const detail = [error.message, error.details, error.hint].filter(Boolean).join(' | ')
        degraded('read', detail)
        return err(`pipeline_runs.metrics unreadable: ${detail}`)
      }

      const rows = (data ?? []) as Row[]
      if (rows.length === 0) return ok(null)

      const metrics = rows[0]?.metrics
      if (!isRunSnapshot(metrics)) {
        const detail = 'the most recent metrics row does not match the current RunSnapshot shape'
        degraded('read', detail)
        return err(detail)
      }
      return ok(metrics)
    },

    async save(snapshot: RunSnapshot): Promise<Result<void>> {
      try {
        const { error } = await deps.client.from(TABLE).insert({ metrics: snapshot })
        if (error) {
          degraded('save', error.message)
          return err(error.message)
        }
        return ok(undefined)
      } catch (e) {
        const detail = describeError(e)
        degraded('save', detail)
        return err(detail)
      }
    },
  }
}
