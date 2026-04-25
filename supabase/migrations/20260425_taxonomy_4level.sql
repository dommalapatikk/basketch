-- Migration: 4-level taxonomy support (Patch F, revised per architect + team review).
--
-- BACKGROUND
-- Today the deals table is 2-level:
--   `category`     = the Type slug (fresh / long-life / non-food)
--   `sub_category` = a flat string conflating Category and Sub-category
-- Patch E (4-level UI) needs Type → Category → Sub-category → Stores. This
-- migration adds the missing mid-level Category dimension WITHOUT renaming
-- existing columns (per session decisions: keep `non-food → household`
-- boundary alias forever; no DB rename).
--
-- WHAT THIS MIGRATION DOES
--   1. Adds 4 reference tables: taxonomy_type, taxonomy_category,
--      taxonomy_subcategory, taxonomy_alias.
--   2. Adds `deals.category_slug TEXT NULL` referencing taxonomy_category.
--      Stays nullable until backfill + ETL change land in a follow-up patch.
--   3. Adds `pipeline_unknown_tags` so the scraper can log new tags it
--      can't map (operator adds an alias row, next run catches up).
--      Replaces the "Sentry deferred" path from Patch F with a
--      self-contained, RLS-friendly table.
--   4. Seeds the 3 type rows, 17 category rows, 50 subcategory rows
--      (Patch E §E3 dictionary, with Designer's `Sparkle → Gem` swap to
--      avoid the Sparkle/Sparkles visual collision).
--   5. Seeds taxonomy_alias with the 28 distinct sub_category strings the
--      pipeline currently emits, mapping each to its (category_slug,
--      subcategory_slug) tuple. NULL subcategory_slug is allowed when the
--      source tag is broader than any of our sub-cats (e.g. "snacks" maps
--      to category=snacks-sweets but no specific sub).
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * No backfill of existing deal rows. category_slug stays NULL until a
--     separate backfill SQL runs (planned for tomorrow with cron paused).
--   * No rename of `category` → `type_slug`. Decided to keep alias
--     `non-food → household` forever; rename was a one-way door touching
--     verdict tests + 8 other files.
--   * No drop of `sub_category`. Kept indefinitely until the new column
--     has been live for 2+ weeks (separate cleanup migration later).
--   * No materialised view for verdicts. Architect agreed: not needed at
--     1.4k rows.
--   * No DE/EN/FR/IT label columns on the taxonomy tables. Tech Lead
--     correctly called these out as belonging in next-intl JSON, not the
--     database.
--
-- SAFETY
-- Fully additive. No data rewrites. No existing column modifications.
-- Safe to run on a populated deals table. Re-runnable (all CREATE/INSERT
-- statements are idempotent via IF NOT EXISTS and ON CONFLICT DO NOTHING).

-- ============================================================
-- 1. REFERENCE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS taxonomy_type (
  slug          TEXT PRIMARY KEY,                                -- 'fresh' | 'long-life' | 'household'
  sort_order    INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taxonomy_category (
  slug          TEXT PRIMARY KEY,                                -- 'drinks', 'snacks-sweets', etc.
  type_slug     TEXT NOT NULL REFERENCES taxonomy_type(slug),
  icon_lucide   TEXT,                                            -- e.g. 'CupSoda', 'Cookie' — used by web IconHeading
  sort_order    INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taxonomy_subcategory (
  slug          TEXT PRIMARY KEY,                                -- 'wine', 'beer', 'chocolate', etc.
  category_slug TEXT NOT NULL REFERENCES taxonomy_category(slug),
  sort_order    INT  NOT NULL DEFAULT 0
);

-- Alias map keyed by the categorizer's CURRENT output (not source-native).
-- aktionis emits no native categories so source_tag is the value of
-- d.subCategory after categorize.ts runs. `source` is reserved for future
-- multi-source ingestion (e.g. when Migros source is re-introduced).
-- valid_from on the PK lets us re-key an alias without rewriting history.
CREATE TABLE IF NOT EXISTS taxonomy_alias (
  source            TEXT        NOT NULL DEFAULT 'aktionis-internal',
  source_tag        TEXT        NOT NULL,
  category_slug     TEXT REFERENCES taxonomy_category(slug),
  subcategory_slug  TEXT REFERENCES taxonomy_subcategory(slug),
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, source_tag, valid_from)
);

-- ============================================================
-- 2. OBSERVABILITY: unknown-tag log
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_unknown_tags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT        NOT NULL,
  source_tag    TEXT        NOT NULL,
  product_name  TEXT        NOT NULL,
  store         TEXT        NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_unknown_tags_unresolved_idx
  ON pipeline_unknown_tags (observed_at)
  WHERE resolved_at IS NULL;

-- ============================================================
-- 3. NEW DEALS COLUMN (additive, nullable)
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS category_slug TEXT REFERENCES taxonomy_category(slug);

CREATE INDEX IF NOT EXISTS deals_category_slug_idx
  ON deals (category_slug)
  WHERE is_active = true;

-- Composite index for the common drill-down: type → category → sub-category.
CREATE INDEX IF NOT EXISTS deals_type_cat_sub_idx
  ON deals (category, category_slug, sub_category)
  WHERE is_active = true;

-- ============================================================
-- 4. SEED: types
-- ============================================================

INSERT INTO taxonomy_type (slug, sort_order) VALUES
  ('fresh',     1),
  ('long-life', 2),
  ('household', 3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 5. SEED: categories per Patch E §E3
-- ============================================================

INSERT INTO taxonomy_category (slug, type_slug, icon_lucide, sort_order) VALUES
  -- Fresh
  ('vegetables-fruits', 'fresh',     'Apple',      1),
  ('meat-fish',         'fresh',     'Drumstick',  2),
  ('dairy-eggs',        'fresh',     'Milk',       3),
  ('bakery',            'fresh',     'Croissant',  4),
  ('prepared-meals',    'fresh',     'Soup',       5),
  -- Long-life
  ('pantry-canned',     'long-life', 'Package',    1),
  ('snacks-sweets',     'long-life', 'Cookie',     2),
  ('pasta-rice-grains', 'long-life', 'Wheat',      3),
  ('drinks',            'long-life', 'CupSoda',    4),
  ('coffee-tea',        'long-life', 'Coffee',     5),
  ('frozen',            'long-life', 'Snowflake',  6),
  -- Household
  ('home-cleaning',     'household', 'Sparkles',   1),
  ('laundry',           'household', 'Droplets',   2),
  ('paper-goods',       'household', 'FileText',   3),
  ('personal-care',     'household', 'HeartPulse', 4),
  ('beauty-hygiene',    'household', 'Gem',        5),  -- Designer's swap from Sparkle (visual collision with Sparkles)
  ('pet-supplies',      'household', 'PawPrint',   6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 6. SEED: subcategories per Patch E §E3
-- ============================================================

INSERT INTO taxonomy_subcategory (slug, category_slug, sort_order) VALUES
  -- pantry-canned
  ('condiments',        'pantry-canned',     1),
  ('canned-goods',      'pantry-canned',     2),
  ('oils-vinegars',     'pantry-canned',     3),
  ('sauces',            'pantry-canned',     4),
  ('baking',            'pantry-canned',     5),
  -- snacks-sweets
  ('chocolate',         'snacks-sweets',     1),
  ('cookies',           'snacks-sweets',     2),
  ('candy',             'snacks-sweets',     3),
  ('salty-snacks',      'snacks-sweets',     4),
  ('nuts-dried-fruit',  'snacks-sweets',     5),
  -- drinks
  ('soft-drinks',       'drinks',            1),
  ('water',             'drinks',            2),
  ('juice',             'drinks',            3),
  ('beer',              'drinks',            4),
  ('wine',              'drinks',            5),
  ('spirits',           'drinks',            6),
  ('energy-drinks',     'drinks',            7),
  -- coffee-tea
  ('coffee',            'coffee-tea',        1),
  ('tea',               'coffee-tea',        2),
  -- pasta-rice-grains
  ('pasta',             'pasta-rice-grains', 1),
  ('rice',              'pasta-rice-grains', 2),
  ('grains',            'pasta-rice-grains', 3),
  ('noodles',           'pasta-rice-grains', 4),
  -- vegetables-fruits
  ('vegetables',        'vegetables-fruits', 1),
  ('fruits',            'vegetables-fruits', 2),
  ('salads',            'vegetables-fruits', 3),
  ('herbs',             'vegetables-fruits', 4),
  -- meat-fish
  ('red-meat',          'meat-fish',         1),
  ('poultry',           'meat-fish',         2),
  ('fish-seafood',      'meat-fish',         3),
  ('cold-cuts',         'meat-fish',         4),
  ('vegan-substitutes', 'meat-fish',         5),
  -- dairy-eggs
  ('milk',              'dairy-eggs',        1),
  ('cheese',            'dairy-eggs',        2),
  ('yogurt',            'dairy-eggs',        3),
  ('butter',            'dairy-eggs',        4),
  ('eggs',              'dairy-eggs',        5),
  -- home-cleaning
  ('cleaning',          'home-cleaning',     1),
  ('kitchen',           'home-cleaning',     2),
  ('bathroom',          'home-cleaning',     3),
  ('air-care',          'home-cleaning',     4),
  -- laundry
  ('detergent',         'laundry',           1),
  ('softener',          'laundry',           2),
  ('stain-removal',     'laundry',           3),
  -- personal-care
  ('oral-care',         'personal-care',     1),
  ('hair-care',         'personal-care',     2),
  ('skin-care',         'personal-care',     3),
  ('deodorant',         'personal-care',     4),
  -- beauty-hygiene
  ('makeup',            'beauty-hygiene',    1),
  ('fragrance',         'beauty-hygiene',    2),
  ('bath-shower',       'beauty-hygiene',    3),
  ('feminine-care',     'beauty-hygiene',    4)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 7. SEED: alias map for the 28 sub_category values the pipeline emits today
-- ============================================================
--
-- Each row: (source, source_tag) → (category_slug, subcategory_slug).
-- subcategory_slug NULL when the categorizer's tag is broader than any
-- sub-category in §E3 (e.g. 'snacks' → snacks-sweets without picking
-- chocolate vs cookies).

INSERT INTO taxonomy_alias (source, source_tag, category_slug, subcategory_slug) VALUES
  ('aktionis-internal', 'beer',          'drinks',            'beer'),
  ('aktionis-internal', 'bread',         'bakery',            NULL),
  ('aktionis-internal', 'canned',        'pantry-canned',     'canned-goods'),
  ('aktionis-internal', 'chocolate',     'snacks-sweets',     'chocolate'),
  ('aktionis-internal', 'cleaning',      'home-cleaning',     'cleaning'),
  ('aktionis-internal', 'coffee',        'coffee-tea',        'coffee'),
  ('aktionis-internal', 'condiments',    'pantry-canned',     'condiments'),
  ('aktionis-internal', 'dairy',         'dairy-eggs',        NULL),
  ('aktionis-internal', 'deli',          'meat-fish',         'cold-cuts'),
  ('aktionis-internal', 'eggs',          'dairy-eggs',        'eggs'),
  ('aktionis-internal', 'fish',          'meat-fish',         'fish-seafood'),
  ('aktionis-internal', 'frozen',        'frozen',            NULL),
  ('aktionis-internal', 'fruit',         'vegetables-fruits', 'fruits'),
  ('aktionis-internal', 'household',     'home-cleaning',     NULL),
  ('aktionis-internal', 'juice',         'drinks',            'juice'),
  ('aktionis-internal', 'laundry',       'laundry',           NULL),
  ('aktionis-internal', 'meat',          'meat-fish',         'red-meat'),
  ('aktionis-internal', 'paper-goods',   'paper-goods',       NULL),
  ('aktionis-internal', 'pasta-rice',    'pasta-rice-grains', NULL),
  ('aktionis-internal', 'personal-care', 'personal-care',     NULL),
  ('aktionis-internal', 'poultry',       'meat-fish',         'poultry'),
  ('aktionis-internal', 'ready-meals',   'prepared-meals',    NULL),
  ('aktionis-internal', 'snacks',        'snacks-sweets',     NULL),
  ('aktionis-internal', 'soft-drinks',   'drinks',            'soft-drinks'),
  ('aktionis-internal', 'tea',           'coffee-tea',        'tea'),
  ('aktionis-internal', 'vegetables',    'vegetables-fruits', 'vegetables'),
  ('aktionis-internal', 'water',         'drinks',            'water'),
  ('aktionis-internal', 'wine',          'drinks',            'wine')
ON CONFLICT (source, source_tag, valid_from) DO NOTHING;

-- ============================================================
-- 8. RLS — anon read-only on reference tables, no anon access on alias/log
-- ============================================================
--
-- Reference tables ship to the client (next-intl labels are JSON-side, but
-- icon_lucide and ordering live here). Anon SELECT is safe.
-- taxonomy_alias and pipeline_unknown_tags are operator/back-office;
-- never expose to anon.

ALTER TABLE taxonomy_type        ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_category    ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_subcategory ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_alias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_unknown_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxonomy_type_anon_select        ON taxonomy_type;
DROP POLICY IF EXISTS taxonomy_category_anon_select    ON taxonomy_category;
DROP POLICY IF EXISTS taxonomy_subcategory_anon_select ON taxonomy_subcategory;

CREATE POLICY taxonomy_type_anon_select        ON taxonomy_type        FOR SELECT TO anon USING (true);
CREATE POLICY taxonomy_category_anon_select    ON taxonomy_category    FOR SELECT TO anon USING (true);
CREATE POLICY taxonomy_subcategory_anon_select ON taxonomy_subcategory FOR SELECT TO anon USING (true);
-- No anon policy on taxonomy_alias / pipeline_unknown_tags → service role only.
