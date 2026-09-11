-- BASELINE — the schema that existed before migrations were tracked.
--
-- THE PROBLEM THIS FIXES
-- Every migration in this folder is an INCREMENTAL change: add a column, add a
-- taxonomy table, add the concept layer. None of them creates `deals`,
-- `products`, `favorites`, `product_groups` or `starter_packs` — the tables the
-- site actually runs on. They were created by hand in the Supabase SQL editor
-- before the folder existed.
--
-- Consequence: if this project's Supabase instance were lost, THE REPOSITORY
-- COULD NOT REBUILD IT. Ten of twenty-five tables exist nowhere in version
-- control. That is a single point of failure with no backup in git.
--
-- HOW THIS WAS CAPTURED, and what that means for accuracy
-- `supabase db dump` requires Docker, which was unavailable. The schema was
-- instead introspected from the PostgREST OpenAPI descriptor served by the live
-- database on 2026-09-10, which gives columns, types, nullability and foreign
-- keys — but NOT indexes, check constraints, triggers or RLS policies.
--
-- So this file is FAITHFUL ABOUT SHAPE and INCOMPLETE ABOUT CONSTRAINTS. It is
-- enough to stand a working database up from nothing, which is the point. It is
-- not a byte-exact reproduction, and it should be replaced by a real
-- `supabase db dump` the first time Docker is available.
--
-- SAFE ON THE LIVE DATABASE: every statement is IF NOT EXISTS, so applying it
-- to the existing instance changes nothing.
--
-- Views (concept_cheapest_now, worth_picking_up_candidates, pipeline_runs_public)
-- are NOT recreated here — their definitions are not exposed by the descriptor.
-- They are listed at the end as known gaps.

-- ============================================================
-- 1. PRODUCT CATALOGUE
-- ============================================================

CREATE TABLE IF NOT EXISTS product_groups (
  id                TEXT PRIMARY KEY,
  label             TEXT        NOT NULL,
  category          TEXT        NOT NULL,
  sub_category      TEXT,
  search_keywords   TEXT[]      NOT NULL DEFAULT '{}',
  exclude_keywords  TEXT[]      NOT NULL DEFAULT '{}',
  product_form      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name     TEXT        NOT NULL,
  brand              TEXT,
  store              TEXT        NOT NULL,
  category           TEXT        NOT NULL,
  sub_category       TEXT,
  is_organic         BOOLEAN     NOT NULL DEFAULT FALSE,
  product_group      TEXT        REFERENCES product_groups(id),
  -- The retailer's own name, before normalisation. Kept so a product can be
  -- matched back to what the source actually published.
  source_name        TEXT        NOT NULL,
  product_form       TEXT,
  regular_price      NUMERIC,
  price_updated_at   TIMESTAMPTZ,
  offer_valid_from   DATE,
  offer_valid_to     DATE,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_store_source_name_idx ON products (store, source_name);
CREATE INDEX IF NOT EXISTS products_group_idx ON products (product_group);

-- ============================================================
-- 2. DEALS — the table the site reads
-- ============================================================

CREATE TABLE IF NOT EXISTS deals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store                 TEXT        NOT NULL,
  product_name          TEXT        NOT NULL,

  -- ⚠️ NOT NULL, and this is a live constraint on component 2.
  -- An uncertain classification has nowhere to go, so uncertain products are
  -- currently held back from the write rather than filed under a guessed
  -- category. Making this nullable and adding `is_uncertain` is what lets
  -- decision D3 be honoured in full — see docs/component-2-decisions.md.
  category              TEXT        NOT NULL,
  sub_category          TEXT,
  category_slug         TEXT,

  original_price        NUMERIC,
  sale_price            NUMERIC     NOT NULL,
  -- NOT NULL by policy: the pipeline computes it from prices when the source
  -- omits one — but only when an original price genuinely exists (the ALDI rule).
  discount_percent      INTEGER     NOT NULL DEFAULT 0,

  valid_from            DATE        NOT NULL,
  valid_to              DATE,

  image_url             TEXT,
  source_category       TEXT,
  source_url            TEXT,

  -- v4 format / canonical unit pricing
  format                TEXT,
  container             TEXT,
  pack_size             INTEGER,
  unit_volume_ml        NUMERIC,
  unit_weight_g         NUMERIC,
  unit_count            INTEGER,
  canonical_unit        TEXT,
  canonical_unit_value  NUMERIC,
  price_per_unit        NUMERIC,

  bundle_quantity       INTEGER,
  bundle_unit_price     NUMERIC,
  bundle_total_price    NUMERIC,

  taxonomy_confidence   NUMERIC     NOT NULL DEFAULT 0.3,

  product_id            UUID        REFERENCES products(id),
  sku_id                UUID,

  -- Added 2026-09-10 with the classification cache; repeated here so a fresh
  -- database built from this baseline alone is complete.
  classification_key    TEXT,
  run_id                TEXT,

  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The date filter safety net every deal query relies on (CLAUDE.md).
CREATE INDEX IF NOT EXISTS deals_active_valid_idx ON deals (is_active, valid_to);
CREATE INDEX IF NOT EXISTS deals_store_idx ON deals (store);
CREATE INDEX IF NOT EXISTS deals_category_idx ON deals (category, sub_category);
CREATE INDEX IF NOT EXISTS deals_product_idx ON deals (product_id);

-- ============================================================
-- 3. USER-FACING
-- ============================================================

CREATE TABLE IF NOT EXISTS favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorite_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_id       UUID        NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  keyword           TEXT        NOT NULL,
  label             TEXT        NOT NULL,
  category          TEXT        NOT NULL,
  exclude_terms     TEXT[],
  prefer_terms      TEXT[],
  product_group_id  TEXT        REFERENCES product_groups(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS favorite_items_favorite_idx ON favorite_items (favorite_id);

CREATE TABLE IF NOT EXISTS starter_packs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT,
  items       JSONB       NOT NULL DEFAULT '[]'::JSONB,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. LEGACY RUN LOG
-- ============================================================
-- Superseded by `pipeline_run` (20260427_v3_concept_layer.sql), which is
-- per-store. Kept because rows exist and the frontend reads the public view.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_stored  INTEGER     NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error_log     TEXT,
  store_results JSONB
);

-- ============================================================
-- 5. KNOWN GAPS IN THIS BASELINE
-- ============================================================
--
-- NOT captured, because the PostgREST descriptor does not expose them:
--
--   VIEWS        concept_cheapest_now, worth_picking_up_candidates,
--                pipeline_runs_public
--   RLS          policies on favorites / favorite_items
--                (20260416_secure_favorites_rls.sql covers those two)
--   TRIGGERS     whatever maintains updated_at
--   CHECKS       any CHECK constraints on the tables above
--   EXACT DEFAULTS  inferred from behaviour, not read from the catalogue
--
-- Replace this file with a real `supabase db dump --schema public` the first
-- time Docker is available. Until then it stands a working database up from
-- nothing, which is strictly better than the previous position of not being
-- able to rebuild at all.
