-- Migration: classification cache + traceability (additive — nothing dropped).
--
-- BACKGROUND
-- Component 2 replaces the keyword categoriser (pipeline/categorize.ts) with a
-- model. Two things follow from that:
--
--   1. The same products recur every week, so classifying them repeatedly would
--      pay for the same answer over and over. This table is the memo.
--   2. A model's answer must be explainable. When a product turns up in the
--      wrong category, "why?" has to be answerable from stored data — without
--      re-running anything and without adding logging first. That is what
--      failed with the tomato-purée bug: the pipeline recorded that it ran, not
--      what it decided.
--
-- See docs/component-2-agent-design.md §7 (cache) and §7b (traceability).
--
-- NOT a checkpoint. Every run processes every offer; this only makes repeats
-- free. Checkpoint semantics would let a run that died between classification
-- and upsert mark a never-stored deal as done (§7.1).

-- ============================================================
-- 1. THE CACHE
-- ============================================================

CREATE TABLE IF NOT EXISTS product_classification_cache (
  -- normalised_name | taxonomy_version | prompt_version | schema_version
  --
  -- The versions are IN THE KEY on purpose. The classic cache bug is improving
  -- a prompt and then serving answers from the old one forever. Bumping a
  -- version misses every stale entry automatically — no manual flush, no
  -- mystery six weeks later.
  cache_key          TEXT PRIMARY KEY,

  -- Keyed on the product, NOT the retailer: Coca-Cola is Drinks whether Coop or
  -- Denner sells it. One entry serves all seven.
  normalised_name    TEXT        NOT NULL,

  category           TEXT        NOT NULL,
  sub_category       TEXT        NOT NULL,

  -- Category-specific fields (milk fat %, butter salted, wine vintage…).
  -- jsonb rather than 40 sparse columns: ~22 categories x ~8 attributes and
  -- still growing, and new attributes must not require a migration.
  attributes         JSONB       NOT NULL DEFAULT '{}'::JSONB,

  -- Recorded, not yet believed. Whether a model's self-reported confidence
  -- predicts correctness is an open question, to be calibrated against the
  -- Denner benchmark before it is trusted (§6.4).
  confidence         NUMERIC     NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Uncertainty is first-class. It hides the LABEL, never the OFFER (D3).
  -- `WHERE is_uncertain` is the weekly review queue.
  is_uncertain       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- TRACEABILITY. Which model decided, and at which rung of the ladder.
  -- Without these, a wrong category is unattributable.
  model              TEXT        NOT NULL,
  tier               SMALLINT    NOT NULL CHECK (tier IN (1, 2)),

  taxonomy_version   SMALLINT    NOT NULL,
  prompt_version     SMALLINT    NOT NULL,
  schema_version     SMALLINT    NOT NULL,

  -- Correlates every row back to the run that wrote it (§7b.2).
  run_id             TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The review queue. Partial index: only uncertain rows are ever queried this
-- way, and they should be a small minority.
CREATE INDEX IF NOT EXISTS pcc_uncertain_idx
  ON product_classification_cache (created_at DESC)
  WHERE is_uncertain;

-- Attribute lookups: "every milk at 3.5% fat".
CREATE INDEX IF NOT EXISTS pcc_attributes_gin
  ON product_classification_cache USING GIN (attributes);

-- "What did run X decide?" — debugging a single pipeline run.
CREATE INDEX IF NOT EXISTS pcc_run_idx
  ON product_classification_cache (run_id);

-- "How is tier 2 performing?" — is escalation earning its cost.
CREATE INDEX IF NOT EXISTS pcc_model_tier_idx
  ON product_classification_cache (model, tier);

COMMENT ON TABLE product_classification_cache IS
  'Memo of model classifications, keyed on normalised product name + versions. Also the traceability record: which model decided what, at which tier, under which prompt.';

-- ============================================================
-- 2. TRANSFORMATION TELEMETRY
-- ============================================================
-- pipeline_run already records collection. These columns record what component
-- 2 did. Generic metrics would not have caught the categorisation bug — that run
-- was fast, error-free and wrote thousands of rows. These are the domain signals
-- that make a silent failure legible (§7b.3).

ALTER TABLE pipeline_run
  ADD COLUMN IF NOT EXISTS cache_hits                INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_misses              INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier1_classified          INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier2_escalated           INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uncertain_count           INT     NOT NULL DEFAULT 0,
  -- Should sit at ~0. A rising number means the prompt and the taxonomy drifted
  -- apart — the model is naming categories that do not exist.
  ADD COLUMN IF NOT EXISTS invalid_category_rejected INT     NOT NULL DEFAULT 0,
  -- Tobacco (D10). Small and non-zero is healthy; zero may mean the block broke.
  ADD COLUMN IF NOT EXISTS blocked_count             INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_used               INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_rappen     INT     NOT NULL DEFAULT 0,
  -- THE REGRESSION GATE. Macro-averaged, not overall accuracy: beauty-hygiene
  -- alone is 66 of 291 benchmark rows, so an overall figure would flatter a
  -- model that only knows the big classes.
  ADD COLUMN IF NOT EXISTS benchmark_macro_f1        NUMERIC,
  -- Per-retailer share of offers arriving with published metadata. THE leading
  -- indicator of a source changing shape: if Denner's coverage falls from 1.0
  -- to 0 while offers still parse, offer counts look perfectly healthy.
  ADD COLUMN IF NOT EXISTS published_data_coverage   JSONB;

COMMENT ON COLUMN pipeline_run.benchmark_macro_f1 IS
  'Self-score against the Denner benchmark each run. A drop >0.10 vs the previous run means the classifier regressed — the alarm that did not exist when the keyword matcher broke.';

COMMENT ON COLUMN pipeline_run.published_data_coverage IS
  'Per-retailer ratio of offers carrying published metadata. Falling to 0 while offers>0 means that source changed shape.';

-- ============================================================
-- 3. DEAL -> CLASSIFICATION LINK
-- ============================================================
-- Closes the traceability chain (§7b.1):
--   deal -> classification_key -> model, tier, prompt version, confidence
--   deal -> run_id             -> when, which week, which source

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS classification_key TEXT,
  ADD COLUMN IF NOT EXISTS run_id             TEXT;

CREATE INDEX IF NOT EXISTS deals_classification_key_idx
  ON deals (classification_key);

COMMENT ON COLUMN deals.classification_key IS
  'FK-by-convention into product_classification_cache.cache_key. Answers "why is this product in this category?" without re-running anything.';

-- Deliberately NOT a hard FOREIGN KEY: bumping a taxonomy or prompt version
-- changes every cache_key, and a strict constraint would either block the bump
-- or cascade-delete live deals. The link is for debugging, not integrity.

-- ============================================================
-- 4. RLS
-- ============================================================
-- The cache is pipeline-internal. The service role writes it; the anon key used
-- by the frontend must never read it — it carries model internals, not product
-- data, and nothing on the site needs it.

ALTER TABLE product_classification_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcc_service_role_all ON product_classification_cache;
CREATE POLICY pcc_service_role_all
  ON product_classification_cache
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- No policy for anon or authenticated: with RLS on and no policy, access is
-- denied by default. That is the intent, stated explicitly rather than implied.
