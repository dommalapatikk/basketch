-- Migration: pipeline_runs.metrics jsonb — WP-P7 (RCA 2026-09-15, item 2, T2).
--
-- BACKGROUND
-- run-pipeline.ts built the alert snapshot (RunSnapshot) from hardcoded
-- literals and always compared it against `previous: null`, because nothing
-- ever saved a snapshot anywhere. 8 of 9 alert rules could never fire in
-- production; only `uncertainty-spike` had real inputs. This migration adds
-- the ONE column the fix needs: `metrics jsonb`, so a run's snapshot can be
-- saved and the previous one read back for classifier-regression,
-- source-shape-changed and cache-hit-rate-low.
--
-- WHY ONE COLUMN ON pipeline_runs, NOT A NEW TABLE (Tech Lead ruling, T2)
-- `pipeline_runs` is already one row written every run (`store.ts`'s
-- `logPipelineRun`). The per-store `pipeline_run` metric columns proposed
-- earlier are a schema dead end (wrong shape for a RUN-level snapshot, one
-- row per STORE). `metrics` is a second, INDEPENDENT, append-only writer to
-- the same table (`SupabaseRunHistory#save` — see
-- transformation/infrastructure/supabase-run-history.ts) — it never updates
-- the row `logPipelineRun` already writes, so the two can never race or
-- corrupt each other.
--
-- WHY jsonb, NOT A TYPED COLUMN PER FIELD
-- `RunSnapshot` (transformation/domain/alerts.ts) is a TypeScript shape that
-- is expected to grow (WP-P9's enrichment stats, a future benchmark
-- producer for `benchmarkMacroF1`). jsonb lets the snapshot evolve without a
-- migration per field; `SupabaseRunHistory`'s own `isRunSnapshot` guard
-- re-validates a reloaded row against the CURRENT shape on read, so a schema
-- drift between what was written and what is read is refused, not trusted
-- silently (the same "a stored row is not trusted" rule the collection
-- ledger design applies to reloaded offers).
--
-- WHY THE CHECK CONSTRAINT
-- `jsonb_typeof(metrics) = 'object'` refuses a bare number, string or array
-- accidentally inserted as `metrics` — cheap insurance that costs nothing on
-- the read path (the application-level `isRunSnapshot` guard still does the
-- real validation).
--
-- KEPT OUT OF pipeline_runs_public ON PURPOSE
-- The anon-readable view (20260416_secure_favorites_rls.sql) lists its
-- columns EXPLICITLY:
--
--   CREATE OR REPLACE VIEW pipeline_runs_public AS
--     SELECT id, run_at, store_results, total_stored, duration_ms
--     FROM pipeline_runs;
--
-- A new column on the underlying table is invisible to an explicit column
-- list by construction — nobody has to remember to exclude `metrics`, and
-- this migration does not touch the view. `metrics` may carry internal
-- alert thresholds and cost figures that have no reason to be public.
--
-- SAFETY
-- Additive only: `ADD COLUMN IF NOT EXISTS` + a `NOT VALID` check added
-- separately and then validated, so an existing large table is never locked
-- for a full rewrite. Re-running this file is a no-op.
--
-- REVIEWER / PM — run AFTER applying:
--
-- 1. RELOAD POSTGREST'S SCHEMA CACHE:
--      NOTIFY pgrst, 'reload schema';
--
-- 2. CONFIRM pipeline_runs_public STILL EXCLUDES metrics, THROUGH POSTGREST,
--    WITH THE ANON KEY:
--      curl "$SUPABASE_URL/rest/v1/pipeline_runs_public?select=*&limit=1" -H "apikey: $ANON_KEY"
--    The returned row must show id/run_at/store_results/total_stored/duration_ms
--    only — no `metrics` key.
--
-- 3. CONFIRM THE SERVICE ROLE CAN WRITE metrics (the pipeline's own key):
--      INSERT INTO pipeline_runs (metrics) VALUES ('{"runId":"smoke-test"}'::jsonb);
--      SELECT metrics FROM pipeline_runs WHERE metrics->>'runId' = 'smoke-test';
--      DELETE FROM pipeline_runs WHERE metrics->>'runId' = 'smoke-test';

BEGIN;

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS metrics jsonb;

-- Added NOT VALID first so an ALTER on a table with existing rows never
-- takes a blocking full-table scan under the same transaction as the
-- ADD COLUMN above; VALIDATE CONSTRAINT below checks existing rows in a
-- separate, non-blocking pass. Every existing row has `metrics IS NULL`,
-- which passes the check trivially either way — this ordering is about lock
-- behaviour, not correctness.
ALTER TABLE pipeline_runs
  ADD CONSTRAINT pipeline_runs_metrics_is_object
    CHECK (metrics IS NULL OR jsonb_typeof(metrics) = 'object')
    NOT VALID;

ALTER TABLE pipeline_runs
  VALIDATE CONSTRAINT pipeline_runs_metrics_is_object;

COMMENT ON COLUMN pipeline_runs.metrics IS
  'WP-P7 (RCA 2026-09-15, item 2). One RunSnapshot (transformation/domain/alerts.ts), written by SupabaseRunHistory#save as a NEW row -- append-only, never an UPDATE of the row logPipelineRun writes. Read back by SupabaseRunHistory#lastSuccessful as the previous run for classifier-regression / source-shape-changed / cache-hit-rate-low. Deliberately excluded from pipeline_runs_public (that view lists its columns explicitly and is not touched by this migration).';

COMMIT;

-- ============================================================
-- Schema cache reload — run OUTSIDE the transaction above (NOTIFY takes
-- effect immediately regardless, but keeping it out of BEGIN/COMMIT makes it
-- unambiguous this is a signal to PostgREST, not a DDL step that could be
-- rolled back with the rest).
-- ============================================================

NOTIFY pgrst, 'reload schema';
