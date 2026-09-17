-- Migration: product_classification_cache.attributes_version (additive — nothing dropped).
--
-- ⚠️ APPLY THIS BEFORE DEPLOYING THE CODE THAT READS/WRITES attributes_version.
-- NO EXCEPTIONS. `supabase-classification-cache.ts` names this column in its
-- `.select(...)` list AND in every upsert row — not behind any column-exists
-- check. Deploying that code against a database that has not run this
-- migration makes PostgREST return a schema error (42703 / PGRST204) on
-- EVERY lookup and EVERY save, deterministically, every run, until this file
-- is applied. The save side is the dangerous one: this codebase's own rule
-- ("a failed write degrades to a miss, always") means every classification
-- the run just paid for is silently never cached — not a crash, a QUIET,
-- indefinite cold start. See "Deployment order" in
-- docs/decisions/2026-09-17-attributes-version.md for the full trace (WP-P9
-- code review MUST-FIX 2 — an earlier version of that ADR wrongly claimed
-- deploy order did not matter).
--
-- WP-P9 (RCA item 6, ruling D3). See docs/decisions/2026-09-17-attributes-version.md
-- for the full decision record — the timestamp design the Tech Lead first
-- proposed (`attributes_enriched_at`) was REPLACED by this one, because a
-- timestamp cannot represent "enriched, but Google refused every call" without
-- either marking the row done anyway (silent, worse than never asking) or
-- leaving the timestamp null forever regardless of outcome (which is just
-- `attributes = '{}'` under a different name — the exact defect this closes).
--
-- BACKGROUND
-- 82.6% of live deals have no attributes; 94.9% have no `storage` value, which
-- is why the Frozen/Chilled filter shows almost nothing. Two structural causes,
-- independent of the rate-limiting WP-P5's shared ModelGate already fixed:
--
--   1. "Enriched, nothing stated" could not be recorded. The enricher dropped
--      an empty result as "not worth storing", and `needsEnrichment` treated
--      `{}` as still owed — so a product whose name honestly states nothing
--      (D3's example: "Emmi Milch 1L") was re-requested every run, forever.
--   2. A rate-limited (429) product had no way to stay distinguishable from a
--      genuinely-empty one either — both were `{}`.
--
-- ============================================================
-- 1. THE COLUMN
-- ============================================================
--
-- SMALLINT, NOT a timestamp. `NULL` means "never resolved — still owed",
-- whatever `attributes` holds. Only a `stated` or `statedNothing` enricher
-- outcome may set it (`attributesVersionFor`,
-- pipeline/transformation/domain/classification-cache.ts); a `failed` outcome
-- — rate-limited or otherwise — MUST leave it NULL, so that product is asked
-- again next run instead of being silently marked done.
--
-- Deliberately NOT the same version as `schema_version` (already in
-- `cache_key`, above). Bumping `schema_version` forces every row to be
-- treated as an unseen product, which re-runs CLASSIFICATION from zero — a
-- full cold start (HANDOVER.md §5: "never bump taxonomyVersion / promptVersion
-- / schemaVersion casually"). `attributes_version` answers a narrower
-- question — "are this row's ATTRIBUTES stale" — without touching the
-- classification at all, so a schema change (a new attribute field) costs
-- only a metadata backfill, never a full re-classification.

ALTER TABLE product_classification_cache
  ADD COLUMN IF NOT EXISTS attributes_version SMALLINT;

COMMENT ON COLUMN product_classification_cache.attributes_version IS
  'NULL = still owed (never resolved, or the last attempt failed/was rate-limited). A non-null value is the attribute schema version (shared/attribute-schemas.ts CURRENT_ATTRIBUTE_SCHEMA_VERSION) the row was last successfully resolved under — set only by a stated or statedNothing enricher outcome, never by a failure. WP-P9, RCA item 6, ruling D3.';

-- ============================================================
-- 2. ONE-TIME BACKFILL — do not re-ask for answers we already have
-- ============================================================
--
-- Every row in this table predates this column, so every row currently reads
-- `attributes_version IS NULL` — "still owed" — regardless of whether it was
-- actually enriched. For a row that is genuinely empty (`attributes = '{}'`),
-- that is CORRECT and INTENTIONAL: this migration cannot tell "never asked"
-- apart from "asked, nothing stated" any better than the code it replaces
-- could, so those rows are asked ONE more time, and from then on the new code
-- records which case it was.
--
-- For a row that already carries REAL attributes, asking again would waste
-- quota re-deriving an answer already on the table. This UPDATE marks those
-- rows resolved under schema version 1 (CURRENT_ATTRIBUTE_SCHEMA_VERSION as of
-- this migration — see shared/attribute-schemas.ts) so the very first run
-- after this migration spends its quota on the 82.6% that have nothing yet,
-- not on re-confirming what is already correct.
--
-- Safe to re-run: only touches rows that are both non-empty and not yet
-- versioned, so a second run of this file is a no-op (idempotent, per this
-- repo's migration convention).

UPDATE product_classification_cache
SET attributes_version = 1
WHERE attributes_version IS NULL
  AND attributes IS NOT NULL
  AND attributes <> '{}'::JSONB;

-- ============================================================
-- 3. RELOAD POSTGREST'S SCHEMA CACHE
-- ============================================================
-- Without this, PostgREST keeps serving the pre-migration column list until
-- it restarts on its own, and a lookup/save that requests attributes_version
-- gets "column does not exist" until then.

NOTIFY pgrst, 'reload schema';
