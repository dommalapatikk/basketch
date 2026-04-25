-- Migration: backfill deals.category_slug for the 1.4k existing rows.
-- Patch F step 3. Runs after step 1 (schema + alias seed) and step 2
-- (pipeline change so future ingest writes the new column too).
--
-- For every deal with NULL category_slug, look up its sub_category in
-- taxonomy_alias and copy the alias's category_slug across. Idempotent:
-- only touches rows where category_slug IS NULL, so re-running this on
-- an already-backfilled table is a no-op.
--
-- Rows with NULL sub_category stay at NULL category_slug — that's fine,
-- they were never categorised at the sub level by the pipeline either.
-- Rows whose sub_category isn't in taxonomy_alias also stay NULL — the
-- next pipeline run logs them via pipeline_unknown_tags so the operator
-- can add an alias row.

UPDATE deals d
SET    category_slug = a.category_slug
FROM   taxonomy_alias a
WHERE  a.source       = 'aktionis-internal'
  AND  a.source_tag   = LOWER(d.sub_category)
  AND  d.category_slug IS NULL
  AND  d.sub_category IS NOT NULL;
