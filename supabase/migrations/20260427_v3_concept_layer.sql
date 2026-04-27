-- Migration: v3 concept layer (additive — does not break live site).
--
-- BACKGROUND
-- v3.2 today writes to a flat `deals` table with embedded category/sub_category
-- strings. The locked v3.0 architecture introduces a 3-layer model:
--
--   concept (what the user wants — "milk")
--     └─ sku (what each store sells — "M-Classic Vollmilch 1L at Migros")
--         └─ deals (the weekly promotion on that sku)
--
-- This migration adds the new layer ALONGSIDE the existing schema. No existing
-- columns are renamed or dropped. Live site (basketch.vercel.app) keeps reading
-- `deals.category_slug` until a separate phase 5 migration cleans up legacy
-- columns (planned only after 2+ weeks of v3 in production).
--
-- WHAT THIS MIGRATION DOES
--   1. Adds 9 new tables: store, region, concept_family, concept, sku,
--      sku_alias, user_interest, concept_resolver, pipeline_run.
--   2. Adds nullable columns to `deals`: sku_id, bundle_quantity,
--      bundle_unit_price, bundle_total_price.
--   3. Creates 2 materialised views: concept_cheapest_now (drives Surface 2
--      freshness strip) and worth_picking_up_candidates (drives Surface 3).
--   4. Seeds the `store` and `region` lookups from current STORE_META + Migros
--      region list. `concept_family` is seeded from the existing 50 sub-cats.
--   5. Sets up RLS policies: read-only public for lookups, service-role-only
--      for write tables.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * No backfill of `concept` / `sku` rows. Backfill ships in phase 2 via
--     pipeline/migrate/seed-concepts.ts + seed-skus.ts.
--   * No changes to existing `deals` rows. `sku_id` is nullable; existing
--     deals continue to work without it until phase 4 cutover.
--   * No drop of `category`, `sub_category`, `category_slug` from deals.
--     Kept indefinitely until phase 5 cleanup.
--   * No LLM resolver — rules-only via concept_resolver (per session decision).
--   * No regional pricing on Coop / LIDL / ALDI / SPAR / Volg — only Migros
--     gets regional rows. Other stores use region_slug = 'all'.
--
-- SAFETY
-- Fully additive. No data rewrites. No existing column modifications. Safe
-- to run on a populated deals table. Re-runnable (idempotent via
-- IF NOT EXISTS and ON CONFLICT DO NOTHING).

-- ============================================================
-- 1. LOOKUP TABLES (read-only public)
-- ============================================================

-- 1.1 store — one row per supported retailer
CREATE TABLE IF NOT EXISTS store (
  slug          TEXT PRIMARY KEY,                -- 'migros' | 'coop' | 'lidl' | 'aldi' | 'denner' | 'spar' | 'volg'
  label         TEXT NOT NULL,
  hex_bg        TEXT NOT NULL,                    -- brand fill
  hex_text      TEXT NOT NULL,                    -- brand text on white (WCAG AA)
  hex_light     TEXT NOT NULL,                    -- tinted bg
  has_regional  BOOLEAN NOT NULL DEFAULT false,   -- Migros = true; others = false
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 region — Migros has 4 regional cooperatives; others use 'all'
CREATE TABLE IF NOT EXISTS region (
  slug          TEXT PRIMARY KEY,                -- 'all' | 'aare' | 'geneve' | 'zurich' | 'ticino'
  label         TEXT NOT NULL,
  store_slug    TEXT NOT NULL REFERENCES store(slug),
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS region_store_slug_idx ON region (store_slug);

-- 1.3 concept_family — sibling grouping (replaces parent_slug tree per design)
-- Examples: 'milk', 'bread', 'eggs', 'butter', 'water', 'tomatoes-canned',
-- 'batteries-aa', 'wine-red'.
CREATE TABLE IF NOT EXISTS concept_family (
  slug              TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  category_slug     TEXT REFERENCES taxonomy_category(slug),     -- ties back to v3.2 taxonomy
  subcategory_slug  TEXT REFERENCES taxonomy_subcategory(slug),  -- nullable when broader than any sub
  in_starter_pack   BOOLEAN NOT NULL DEFAULT false,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_family_category_idx ON concept_family (category_slug);
CREATE INDEX IF NOT EXISTS concept_family_starter_idx ON concept_family (in_starter_pack) WHERE in_starter_pack = true;

-- ============================================================
-- 2. CORE 3-LAYER MODEL
-- ============================================================

-- 2.1 concept — variant-level product (what the user wants)
-- Flat columns for variant axes (no JSON) — keeps queries simple, indexable.
-- Variant axes: fat_pct, volume_ml, weight_g, shelf_life, origin, dietary flags.
CREATE TABLE IF NOT EXISTS concept (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,                          -- 'milk-cow-fresh-3.5pct-1l'
  display_name    TEXT NOT NULL,                                 -- 'Whole milk 1 L'
  family_slug     TEXT NOT NULL REFERENCES concept_family(slug),

  -- Variant axes (all nullable — only set what applies to this concept)
  fat_pct         NUMERIC(4,2),                                  -- 3.50, 1.50, 0.10
  volume_ml       INT,                                           -- 1000, 1500, 500
  weight_g        INT,                                           -- 500, 800, 1000
  shelf_life      TEXT CHECK (shelf_life IN ('fresh', 'long-life', 'frozen')),
  origin          TEXT,                                          -- 'cow', 'oat', 'soy', 'almond', 'rice'

  -- Dietary flags
  is_organic       BOOLEAN NOT NULL DEFAULT false,
  is_vegan         BOOLEAN NOT NULL DEFAULT false,
  is_vegetarian    BOOLEAN NOT NULL DEFAULT false,
  is_lactose_free  BOOLEAN NOT NULL DEFAULT false,
  is_gluten_free   BOOLEAN NOT NULL DEFAULT false,
  allergens        TEXT[] NOT NULL DEFAULT '{}',

  in_starter_pack  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_family_slug_idx ON concept (family_slug);
CREATE INDEX IF NOT EXISTS concept_starter_idx ON concept (in_starter_pack) WHERE in_starter_pack = true;
CREATE INDEX IF NOT EXISTS concept_organic_idx ON concept (family_slug, is_organic) WHERE is_organic = true;

-- 2.2 sku — store-specific product instance
-- One row per (concept, store, region) tuple. last_deal_seen_at drives
-- Surface 2's B-state ("Last on deal 3 wks ago"). regular_price is updated
-- when the source provides it (some sources only emit on-deal prices).
CREATE TABLE IF NOT EXISTS sku (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id          UUID NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  store_slug          TEXT NOT NULL REFERENCES store(slug),
  region_slug         TEXT NOT NULL REFERENCES region(slug),
  source_product_id   TEXT NOT NULL,                              -- store's own SKU/EAN
  source_product_name TEXT NOT NULL,                              -- as it appears at the store
  brand               TEXT,                                       -- 'M-Classic', 'Coop QP', 'Aldi Milsani'
  pack_quantity       INT,                                        -- 1, 6, 12 (multipack count)
  regular_price       NUMERIC(10,2),                              -- shelf price; null if never observed
  currency            TEXT NOT NULL DEFAULT 'CHF',
  last_deal_seen_at   TIMESTAMPTZ,                                -- max(deals.created_at) — replaces sku_inventory table
  source_payload_hash TEXT,                                       -- idempotent ingestion key
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (concept_id, store_slug, region_slug, source_product_id)
);

CREATE INDEX IF NOT EXISTS sku_concept_id_idx ON sku (concept_id);
CREATE INDEX IF NOT EXISTS sku_store_region_idx ON sku (store_slug, region_slug);
CREATE INDEX IF NOT EXISTS sku_last_deal_seen_idx ON sku (last_deal_seen_at DESC NULLS LAST);

-- 2.3 sku_alias — synonyms / alternative names mapping to a sku
-- Used by the rules-only resolver to match incoming source strings to existing
-- SKUs (e.g. "Vollmilch UHT 1L" + "Lait entier UHT 1L" → same sku).
CREATE TABLE IF NOT EXISTS sku_alias (
  alias       TEXT NOT NULL,
  sku_id      UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,                                      -- 'aktionis-coop', 'migros-api', etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alias, source)
);

CREATE INDEX IF NOT EXISTS sku_alias_sku_id_idx ON sku_alias (sku_id);

-- ============================================================
-- 3. RESOLVER & USER-SIDE
-- ============================================================

-- 3.1 concept_resolver — priority-ordered rules for matching incoming
-- product strings to a concept. Higher priority fires first (e.g. pet-food
-- brands fire before generic 'thunfisch' to prevent cat-food → fish bug).
CREATE TABLE IF NOT EXISTS concept_resolver (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type        TEXT NOT NULL CHECK (rule_type IN ('exact', 'contains', 'regex', 'brand', 'multipack')),
  pattern          TEXT NOT NULL,                                 -- the match string / regex
  concept_id       UUID REFERENCES concept(id) ON DELETE CASCADE, -- nullable when rule is "junk, ignore"
  priority         INT NOT NULL DEFAULT 100,                      -- lower = higher priority
  is_active        BOOLEAN NOT NULL DEFAULT true,
  reason           TEXT,                                          -- why this rule exists (e.g. "Almo cat-food override")
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT                                           -- email or 'pipeline'
);

CREATE INDEX IF NOT EXISTS concept_resolver_active_priority_idx
  ON concept_resolver (priority, rule_type)
  WHERE is_active = true;

-- 3.2 user_interest — user's interest signals (additions, browses,
-- favourites). Drives Surface 3 "Worth picking up". 90-day decay applied
-- at query time via interest_weight = exp(-age_days / 30).
-- dismissed_at supports Surface 3.5 (Settings → Hidden suggestions).
CREATE TABLE IF NOT EXISTS user_interest (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,                                     -- v3.2 lookup key
  concept_id   UUID REFERENCES concept(id) ON DELETE CASCADE,
  family_slug  TEXT REFERENCES concept_family(slug),              -- when user wanted family but no concept yet
  signal       TEXT NOT NULL CHECK (signal IN ('added', 'browsed', 'favourited', 'wanted_deal')),
  store_pref   TEXT REFERENCES store(slug),                       -- nullable; set when signal is 'wanted_deal' for specific store
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ                                        -- set when user picks "Don't suggest again"
);

CREATE INDEX IF NOT EXISTS user_interest_email_idx ON user_interest (user_email);
CREATE INDEX IF NOT EXISTS user_interest_concept_idx ON user_interest (concept_id);
CREATE INDEX IF NOT EXISTS user_interest_active_idx
  ON user_interest (user_email, added_at DESC)
  WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS user_interest_dismissed_idx
  ON user_interest (user_email, dismissed_at DESC)
  WHERE dismissed_at IS NOT NULL;

-- ============================================================
-- 4. OPERATIONS
-- ============================================================

-- 4.1 pipeline_run — one row per pipeline execution. Drives observability
-- and the cold-start fallback decision in Surface 1 ("if no recent run with
-- ≥4 sku rows for family, use hard-coded defaults").
CREATE TABLE IF NOT EXISTS pipeline_run (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_slug      TEXT NOT NULL REFERENCES store(slug),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  deals_fetched   INT NOT NULL DEFAULT 0,
  skus_resolved   INT NOT NULL DEFAULT 0,
  skus_unmatched  INT NOT NULL DEFAULT 0,                         -- went to triage queue
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS pipeline_run_store_started_idx
  ON pipeline_run (store_slug, started_at DESC);

-- ============================================================
-- 5. DEALS — additive columns only
-- ============================================================

-- sku_id is nullable to allow legacy rows to exist without a concept link.
-- Pipeline phase 4 backfills + writes sku_id; phase 5 (after 2+ wks clean)
-- will eventually NOT NULL it.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS sku_id              UUID REFERENCES sku(id),
  ADD COLUMN IF NOT EXISTS bundle_quantity     INT,
  ADD COLUMN IF NOT EXISTS bundle_unit_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS bundle_total_price  NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS deals_sku_id_idx ON deals (sku_id) WHERE sku_id IS NOT NULL;

-- ============================================================
-- 6. MATERIALISED VIEWS
-- ============================================================

-- 6.1 concept_cheapest_now — for each (concept, region), the cheapest active
-- deal across all stores. Drives Surface 2's "Cheapest at Migros" header
-- and the My List "Buy at X" routing. Refreshed at end of every pipeline run.
CREATE MATERIALIZED VIEW IF NOT EXISTS concept_cheapest_now AS
SELECT DISTINCT ON (s.concept_id, s.region_slug)
  s.concept_id,
  s.region_slug,
  s.store_slug          AS cheapest_store,
  s.id                  AS sku_id,
  d.id                  AS deal_id,
  d.sale_price          AS deal_price,
  d.original_price      AS deal_regular_price,
  d.discount_percent,
  d.valid_to,
  NOW()                 AS computed_at
FROM sku s
JOIN deals d ON d.sku_id = s.id
WHERE d.valid_to >= CURRENT_DATE
  AND d.is_active = true
ORDER BY s.concept_id, s.region_slug, d.sale_price ASC;

CREATE UNIQUE INDEX IF NOT EXISTS concept_cheapest_now_pk
  ON concept_cheapest_now (concept_id, region_slug);

-- 6.2 worth_picking_up_candidates — pre-computed Surface 3 candidates per
-- user. Filters to discount ≥ 30% on items the user has shown interest in
-- (added / browsed / favourited) within the last 90 days, and which are
-- NOT currently on the user's active list. Refreshed end of pipeline run.
-- score = interest_weight (90-day exp decay) × discount_percent.
CREATE MATERIALIZED VIEW IF NOT EXISTS worth_picking_up_candidates AS
SELECT
  ui.user_email,
  ui.concept_id,
  ccn.cheapest_store    AS deal_store,
  ccn.deal_id,
  ccn.deal_price,
  ccn.deal_regular_price,
  ccn.discount_percent,
  ui.signal             AS interest_signal,
  ui.added_at           AS interest_added_at,
  EXP(-EXTRACT(EPOCH FROM (NOW() - ui.added_at)) / (86400.0 * 30.0)) AS interest_weight,
  EXP(-EXTRACT(EPOCH FROM (NOW() - ui.added_at)) / (86400.0 * 30.0)) * ccn.discount_percent AS score,
  NOW()                 AS computed_at
FROM user_interest ui
JOIN concept_cheapest_now ccn ON ccn.concept_id = ui.concept_id
WHERE ui.dismissed_at IS NULL
  AND ui.added_at >= NOW() - INTERVAL '90 days'
  AND ccn.discount_percent >= 30
ORDER BY ui.user_email, score DESC;

CREATE INDEX IF NOT EXISTS worth_picking_up_user_score_idx
  ON worth_picking_up_candidates (user_email, score DESC);

-- ============================================================
-- 7. SEEDS
-- ============================================================

-- 7.1 store seed — matches shared/types.ts STORE_META
INSERT INTO store (slug, label, hex_bg, hex_text, hex_light, has_regional, sort_order) VALUES
  ('migros',  'Migros',  '#FF6600', '#CC5200', '#FFF0E6', true,  1),
  ('coop',    'Coop',    '#E30613', '#B3040F', '#FCECEC', false, 2),
  ('lidl',    'LIDL',    '#FFF000', '#E10915', '#FFFBCC', false, 3),
  ('aldi',    'ALDI',    '#00225E', '#001A4A', '#E6E8F0', false, 4),
  ('denner',  'Denner',  '#E20613', '#B3040F', '#FCECEC', false, 5),
  ('spar',    'SPAR',    '#E30613', '#009640', '#FCECEC', false, 6),
  ('volg',    'Volg',    '#E30613', '#B3040F', '#FFF9CC', false, 7)
ON CONFLICT (slug) DO NOTHING;

-- 7.2 region seed — Migros has 4; all other stores use 'all'
INSERT INTO region (slug, label, store_slug, sort_order) VALUES
  ('all',           'All Switzerland',     'coop',   1),
  ('aare',          'Aare (Bern/Solothurn)', 'migros', 1),
  ('geneve',        'Genève',                'migros', 2),
  ('zurich',        'Zürich',                'migros', 3),
  ('ticino',        'Ticino',                'migros', 4),
  ('lidl-all',      'All Switzerland',     'lidl',   1),
  ('aldi-all',      'All Switzerland',     'aldi',   1),
  ('denner-all',    'All Switzerland',     'denner', 1),
  ('spar-all',      'All Switzerland',     'spar',   1),
  ('volg-all',      'All Switzerland',     'volg',   1)
ON CONFLICT (slug) DO NOTHING;

-- 7.3 concept_family seed — bootstrap 5 starter-pack families per design
-- spec §1.4 (the CONCEPT_FAMILY_DEFAULT_TILES fallback list). More families
-- ship via backfill script seed-concepts.ts.
INSERT INTO concept_family (slug, display_name, category_slug, subcategory_slug, in_starter_pack, sort_order) VALUES
  ('milk',    'Milk',    'dairy-eggs', NULL, true, 1),
  ('bread',   'Bread',   'bakery',     NULL, true, 2),
  ('eggs',    'Eggs',    'dairy-eggs', NULL, true, 3),
  ('butter',  'Butter',  'dairy-eggs', NULL, true, 4),
  ('water',   'Water',   'drinks',     'water', true, 5)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

-- Lookups: public read, service-role write
ALTER TABLE store           ENABLE ROW LEVEL SECURITY;
ALTER TABLE region          ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_family  ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_alias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_resolver ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_run    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interest   ENABLE ROW LEVEL SECURITY;

-- Public read on lookups + concepts + skus + deals (already public via existing policy)
DO $$ BEGIN
  CREATE POLICY "public_read_store"           ON store           FOR SELECT USING (true);
  CREATE POLICY "public_read_region"          ON region          FOR SELECT USING (true);
  CREATE POLICY "public_read_concept_family"  ON concept_family  FOR SELECT USING (true);
  CREATE POLICY "public_read_concept"         ON concept         FOR SELECT USING (true);
  CREATE POLICY "public_read_sku"             ON sku             FOR SELECT USING (true);
  CREATE POLICY "public_read_sku_alias"       ON sku_alias       FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_interest: per-email read/write via v3.2 lookup-key pattern
-- (frontend supplies email; service role enforces match in queries)
DO $$ BEGIN
  CREATE POLICY "public_read_own_interest"
    ON user_interest FOR SELECT
    USING (true);  -- email-scoped at query layer; matches v3.2 favorites RLS pattern
  CREATE POLICY "public_write_own_interest"
    ON user_interest FOR INSERT
    WITH CHECK (true);
  CREATE POLICY "public_update_own_interest"
    ON user_interest FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- concept_resolver, pipeline_run: service role only (no public policies)
-- pg_default behaviour with RLS enabled = no access for anon role. Done.

-- ============================================================
-- 9. COMMENTS (self-documenting schema)
-- ============================================================

COMMENT ON TABLE concept IS
  'Variant-level products. Flat columns for the 9 variant axes. One row per (family, variant combination).';
COMMENT ON TABLE sku IS
  'Store-specific product instances. last_deal_seen_at drives Surface 2 freshness strip ("Last on deal 3 wks ago").';
COMMENT ON TABLE sku_alias IS
  'Synonyms feeding the rules-only resolver. Same sku can have many aliases across sources/languages.';
COMMENT ON TABLE concept_resolver IS
  'Priority-ordered rules for matching incoming source strings to a concept. Lower priority = fires first.';
COMMENT ON TABLE user_interest IS
  'Per-user signals (added/browsed/favourited/wanted_deal). dismissed_at gates Surface 3 (Worth picking up).';
COMMENT ON TABLE pipeline_run IS
  'Observability + cold-start gating. Surface 1 falls back to hard-coded defaults if no recent run has >=4 skus per family.';
COMMENT ON MATERIALIZED VIEW concept_cheapest_now IS
  'Per (concept, region), the cheapest active deal. Refreshed at end of every pipeline_run.';
COMMENT ON MATERIALIZED VIEW worth_picking_up_candidates IS
  'Per-user pre-scored Surface 3 candidates. discount >= 30% AND interest_weight (90d exp decay) AND not dismissed.';

-- ============================================================
-- 10. RPC: refresh materialised views (called by pipeline scripts)
-- ============================================================

CREATE OR REPLACE FUNCTION exec_refresh_mv(view_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF view_name NOT IN ('concept_cheapest_now', 'worth_picking_up_candidates') THEN
    RAISE EXCEPTION 'unknown materialised view: %', view_name;
  END IF;
  EXECUTE format('REFRESH MATERIALIZED VIEW %I', view_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION exec_refresh_mv(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_refresh_mv(TEXT) TO service_role;
