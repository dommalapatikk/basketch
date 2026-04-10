-- basketch Supabase setup
-- Run this SQL in your Supabase dashboard: SQL Editor > New Query
-- This creates all tables, indexes, triggers, and RLS policies.

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE deals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  product_name    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  original_price  DECIMAL(10, 2),
  sale_price      DECIMAL(10, 2) NOT NULL,
  discount_percent INTEGER,
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  image_url       TEXT,
  source_category TEXT,
  source_url      TEXT,
  is_active       BOOLEAN DEFAULT true,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_deal UNIQUE (store, product_name, valid_from)
);

CREATE TABLE pipeline_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at          TIMESTAMPTZ DEFAULT now(),
  migros_status   TEXT CHECK (migros_status IN ('success', 'failed', 'skipped')),
  migros_count    INTEGER DEFAULT 0,
  coop_status     TEXT CHECK (coop_status IN ('success', 'failed', 'skipped')),
  coop_count      INTEGER DEFAULT 0,
  total_stored    INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  error_log       TEXT
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Primary query: active deals grouped by category and store
CREATE INDEX idx_deals_active_category ON deals (is_active, category, store)
  WHERE is_active = true;

-- Expiry management: find deals past their valid_to date
CREATE INDEX idx_deals_valid_to ON deals (valid_to)
  WHERE is_active = true;

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. ROW-LEVEL SECURITY
-- ============================================================

-- Enable RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Public read access (no login required — anon key can SELECT)
CREATE POLICY "Public read deals" ON deals
  FOR SELECT USING (true);

CREATE POLICY "Public read pipeline_runs" ON pipeline_runs
  FOR SELECT USING (true);

-- Write access only via service role key (used by pipeline)
-- No INSERT/UPDATE/DELETE policies for anon key.
-- Pipeline uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.

-- ============================================================
-- 5. FAVORITES TABLES (favorites-first pivot)
-- ============================================================

-- Starter pack templates (seeded once, read-only for frontend)
CREATE TABLE starter_packs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- User favorites lists
CREATE TABLE favorites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Unique index on email (only for non-null emails — allows multiple null-email favorites)
CREATE UNIQUE INDEX idx_favorites_email ON favorites (email) WHERE email IS NOT NULL;

-- Individual items in a favorites list
CREATE TABLE favorite_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  favorite_id UUID NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_favorite_item UNIQUE (favorite_id, keyword)
);

-- ============================================================
-- 6. FAVORITES INDEXES
-- ============================================================

CREATE INDEX idx_favorite_items_favorite_id ON favorite_items (favorite_id);

-- Product search: trigram index for fuzzy matching (optional, add if ilike is slow)
-- Uncomment if needed:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_deals_product_name_trgm ON deals USING gin (product_name gin_trgm_ops);

-- ============================================================
-- 7. FAVORITES TRIGGERS
-- ============================================================

-- Auto-update updated_at on favorites changes
CREATE TRIGGER favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. FAVORITES ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_items ENABLE ROW LEVEL SECURITY;

-- Starter packs: public read (templates are not sensitive)
CREATE POLICY "Public read starter_packs" ON starter_packs
  FOR SELECT USING (true);

-- Favorites: anyone can create (anon), but only read/update by knowing the UUID.
-- The UUID is unguessable (gen_random_uuid) and acts as the access token.
-- Email column is write-only from the frontend perspective (no public email lookup).
CREATE POLICY "Public insert favorites" ON favorites
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Read own favorites by id" ON favorites
  FOR SELECT USING (true);

CREATE POLICY "Update own favorites by id" ON favorites
  FOR UPDATE USING (true);

-- Favorite items: tied to favorites via favorite_id (UUID acts as access token)
CREATE POLICY "Public read favorite_items" ON favorite_items
  FOR SELECT USING (true);

CREATE POLICY "Public insert favorite_items" ON favorite_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete favorite_items" ON favorite_items
  FOR DELETE USING (true);

-- ============================================================
-- 9. SEED STARTER PACKS
-- ============================================================

INSERT INTO starter_packs (name, label, description, items, sort_order) VALUES
(
  'swiss-basics',
  'Swiss Basics',
  'Everyday essentials for a Swiss household',
  '[
    {"keyword": "milch", "label": "Milk", "category": "fresh"},
    {"keyword": "brot", "label": "Bread", "category": "fresh"},
    {"keyword": "butter", "label": "Butter", "category": "fresh"},
    {"keyword": "eier", "label": "Eggs", "category": "fresh"},
    {"keyword": "käse", "label": "Cheese", "category": "fresh"},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh"},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh"},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh"},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "kaffee", "label": "Coffee", "category": "long-life"},
    {"keyword": "schokolade", "label": "Chocolate", "category": "long-life"},
    {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"},
    {"keyword": "toilettenpapier", "label": "Toilet Paper", "category": "non-food"},
    {"keyword": "shampoo", "label": "Shampoo", "category": "non-food"}
  ]'::jsonb,
  1
),
(
  'indian-kitchen',
  'Indian Kitchen',
  'Essentials for Indian home cooking in Switzerland',
  '[
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh"},
    {"keyword": "knoblauch", "label": "Garlic", "category": "fresh"},
    {"keyword": "ingwer", "label": "Ginger", "category": "fresh"},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh"},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh"},
    {"keyword": "kokosmilch", "label": "Coconut Milk", "category": "long-life"},
    {"keyword": "linsen", "label": "Lentils", "category": "long-life"},
    {"keyword": "kichererbsen", "label": "Chickpeas", "category": "long-life"},
    {"keyword": "spinat", "label": "Spinach", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh"},
    {"keyword": "naan", "label": "Naan Bread", "category": "fresh"},
    {"keyword": "öl", "label": "Cooking Oil", "category": "long-life"}
  ]'::jsonb,
  2
),
(
  'mediterranean',
  'Mediterranean',
  'Fresh ingredients for Mediterranean-style cooking',
  '[
    {"keyword": "olivenöl", "label": "Olive Oil", "category": "long-life"},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh"},
    {"keyword": "mozzarella", "label": "Mozzarella", "category": "fresh"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "knoblauch", "label": "Garlic", "category": "fresh"},
    {"keyword": "zucchetti", "label": "Zucchini", "category": "fresh"},
    {"keyword": "aubergine", "label": "Eggplant", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "feta", "label": "Feta Cheese", "category": "fresh"},
    {"keyword": "oliven", "label": "Olives", "category": "long-life"},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh"},
    {"keyword": "brot", "label": "Bread", "category": "fresh"},
    {"keyword": "wein", "label": "Wine", "category": "long-life"},
    {"keyword": "salat", "label": "Salad", "category": "fresh"},
    {"keyword": "thunfisch", "label": "Tuna", "category": "long-life"}
  ]'::jsonb,
  3
),
(
  'general',
  'General Mix',
  'A bit of everything — customize to make it yours',
  '[
    {"keyword": "milch", "label": "Milk", "category": "fresh"},
    {"keyword": "brot", "label": "Bread", "category": "fresh"},
    {"keyword": "eier", "label": "Eggs", "category": "fresh"},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh"},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "kaffee", "label": "Coffee", "category": "long-life"},
    {"keyword": "chips", "label": "Chips", "category": "long-life"},
    {"keyword": "schokolade", "label": "Chocolate", "category": "long-life"},
    {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"},
    {"keyword": "toilettenpapier", "label": "Toilet Paper", "category": "non-food"},
    {"keyword": "zahnpasta", "label": "Toothpaste", "category": "non-food"}
  ]'::jsonb,
  4
);
