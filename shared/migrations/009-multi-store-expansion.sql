-- Migration 009: Multi-store expansion
-- Expands store CHECK constraints from migros/coop to all 7 stores.
-- Adds store_results JSONB column to pipeline_runs (replaces named migros_*/coop_* columns).

-- 1. Expand deals table store constraint
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_store_check;
ALTER TABLE deals ADD CONSTRAINT deals_store_check
  CHECK (store IN ('migros', 'coop', 'lidl', 'aldi', 'denner', 'spar', 'volg'));

-- 2. Expand products table store constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_store_check;
ALTER TABLE products ADD CONSTRAINT products_store_check
  CHECK (store IN ('migros', 'coop', 'lidl', 'aldi', 'denner', 'spar', 'volg'));

-- 3. Add JSONB store_results column to pipeline_runs
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS store_results JSONB DEFAULT '{}';

-- 4. Migrate existing data: copy migros/coop columns into store_results
UPDATE pipeline_runs
SET store_results = jsonb_build_object(
  'migros', jsonb_build_object('status', COALESCE(migros_status, 'skipped'), 'count', COALESCE(migros_count, 0)),
  'coop', jsonb_build_object('status', COALESCE(coop_status, 'skipped'), 'count', COALESCE(coop_count, 0))
)
WHERE store_results = '{}' OR store_results IS NULL;

-- 5. Drop old named columns (after data migration)
ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS migros_status;
ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS migros_count;
ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS coop_status;
ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS coop_count;
