-- Migration: v4 format + canonical unit + taxonomy confidence on deals.
-- Adds columns required by docs/v4-design-architecture.md §3, §13.
-- All new columns are nullable (additive) except taxonomy_confidence which
-- defaults to 0.3 for backfilled rows. The pipeline will overwrite the
-- default with real scores on the next run.
--
-- BACKFILL NOTE: existing rows land at taxonomy_confidence = 0.3, which is
-- below MIN_TAXONOMY_CONFIDENCE (0.4) enforced in pipeline/run.ts. That
-- threshold runs BEFORE upsert, not as a DB filter, so old-world rows stay
-- visible until they naturally roll over at the next weekly pipeline run.
-- Frontend queries must NOT filter by taxonomy_confidence until the backfill
-- is complete (one pipeline cycle after deploy).
--
-- Safe to run on a populated deals table: no data rewrites, no locks beyond
-- ALTER TABLE metadata changes.

-- ============================================================
-- 1. NEW COLUMNS
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS format                TEXT,
  ADD COLUMN IF NOT EXISTS container             TEXT,
  ADD COLUMN IF NOT EXISTS pack_size             INTEGER,
  ADD COLUMN IF NOT EXISTS unit_volume_ml        NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_weight_g         NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_count            INTEGER,
  ADD COLUMN IF NOT EXISTS canonical_unit        TEXT,
  ADD COLUMN IF NOT EXISTS canonical_unit_value  NUMERIC,
  ADD COLUMN IF NOT EXISTS price_per_unit        NUMERIC,
  ADD COLUMN IF NOT EXISTS taxonomy_confidence   NUMERIC NOT NULL DEFAULT 0.3;

-- ============================================================
-- 2. VALUE CONSTRAINTS
-- ============================================================

-- Restrict free text columns to the v4 unions defined in shared/types.ts.
ALTER TABLE deals
  DROP CONSTRAINT IF EXISTS deals_format_check,
  DROP CONSTRAINT IF EXISTS deals_container_check,
  DROP CONSTRAINT IF EXISTS deals_canonical_unit_check,
  DROP CONSTRAINT IF EXISTS deals_taxonomy_confidence_check;

ALTER TABLE deals
  ADD CONSTRAINT deals_format_check
    CHECK (format IS NULL OR format IN ('still','sparkling','lightly-sparkling','flavoured')),
  ADD CONSTRAINT deals_container_check
    CHECK (container IS NULL OR container IN ('pet','glass','can','carton','pouch')),
  ADD CONSTRAINT deals_canonical_unit_check
    CHECK (canonical_unit IS NULL OR canonical_unit IN ('L','kg','100g','piece')),
  ADD CONSTRAINT deals_taxonomy_confidence_check
    CHECK (taxonomy_confidence >= 0 AND taxonomy_confidence <= 1);

-- ============================================================
-- 3. INDEXES
-- ============================================================

-- Speed up sub-category drill-down pages sorted by price-per-unit.
CREATE INDEX IF NOT EXISTS deals_sub_category_ppu_idx
  ON deals (sub_category, price_per_unit)
  WHERE is_active = true;

-- Fast lookup of low-confidence rows for the "needs triage" queue.
CREATE INDEX IF NOT EXISTS deals_low_confidence_idx
  ON deals (taxonomy_confidence)
  WHERE taxonomy_confidence < 0.7 AND is_active = true;
