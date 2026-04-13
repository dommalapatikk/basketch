-- basketch Supabase setup (v2.1)
-- Run this SQL in your Supabase dashboard: SQL Editor > New Query
-- This creates all tables, indexes, triggers, and RLS policies.
-- Source of truth: Technical Architecture v2.1, Sections 5.1-5.9

-- ============================================================
-- 1. HELPER FUNCTION (triggers use this)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- Product groups — links equivalent products across stores (~37 rows)
CREATE TABLE product_groups (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,
  search_keywords TEXT[] NOT NULL,
  exclude_keywords TEXT[] DEFAULT '{}',
  product_form    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Products — one real-world product at a specific store
CREATE TABLE products (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_name  TEXT NOT NULL,
  brand           TEXT,
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,
  quantity        DECIMAL(10, 2),
  unit            TEXT CHECK (unit IN ('ml', 'cl', 'dl', 'l', 'g', 'kg', 'pcs', 'pack')),
  is_organic      BOOLEAN DEFAULT false,
  product_group   TEXT REFERENCES product_groups(id),
  source_name     TEXT NOT NULL,
  regular_price   DECIMAL(10, 2),
  price_updated_at TIMESTAMPTZ,
  first_seen_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_product UNIQUE (store, source_name)
);

-- Deals — weekly promotional deals
CREATE TABLE deals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  product_name    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,
  original_price  DECIMAL(10, 2),
  sale_price      DECIMAL(10, 2) NOT NULL,
  discount_percent INTEGER NOT NULL,
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  image_url       TEXT,
  source_category TEXT,
  source_url      TEXT,
  product_id      UUID REFERENCES products(id),
  is_active       BOOLEAN DEFAULT true,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_deal UNIQUE (store, product_name, valid_from)
);

-- Pipeline run log
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

-- User favorites lists (called "baskets" in the app)
CREATE TABLE favorites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Individual items in a favorites list
CREATE TABLE favorite_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  favorite_id     UUID NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  label           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  exclude_terms   TEXT[],
  prefer_terms    TEXT[],
  product_group_id TEXT REFERENCES product_groups(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_favorite_item UNIQUE (favorite_id, keyword)
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

-- Products
CREATE INDEX idx_products_group ON products (product_group) WHERE product_group IS NOT NULL;
CREATE INDEX idx_products_category ON products (category, sub_category);
CREATE INDEX idx_products_store ON products (store);

-- Deals
CREATE INDEX idx_deals_active_category ON deals (is_active, category, store)
  WHERE is_active = true;
CREATE INDEX idx_deals_valid_to ON deals (valid_to)
  WHERE is_active = true;
CREATE INDEX idx_deals_active_subcategory ON deals (is_active, sub_category, store)
  WHERE is_active = true;
CREATE INDEX idx_deals_product_id ON deals (product_id) WHERE product_id IS NOT NULL;

-- Product groups
CREATE INDEX idx_product_groups_category ON product_groups (category);

-- Favorites
CREATE UNIQUE INDEX idx_favorites_email ON favorites (email) WHERE email IS NOT NULL;
CREATE INDEX idx_favorite_items_favorite_id ON favorite_items (favorite_id);

-- ============================================================
-- 4. TRIGGERS (auto-update updated_at)
-- ============================================================

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. ROW-LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_items ENABLE ROW LEVEL SECURITY;

-- Public read access (no login required — anon key can SELECT)
CREATE POLICY "Public read deals" ON deals FOR SELECT USING (true);
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read product_groups" ON product_groups FOR SELECT USING (true);
CREATE POLICY "Public read pipeline_runs" ON pipeline_runs FOR SELECT USING (true);
CREATE POLICY "Public read starter_packs" ON starter_packs FOR SELECT USING (true);

-- Favorites: read/write via anon key (no auth for MVP)
CREATE POLICY "Public read favorites" ON favorites FOR SELECT USING (true);
CREATE POLICY "Public insert favorites" ON favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update favorites" ON favorites FOR UPDATE USING (true);
CREATE POLICY "Public read favorite_items" ON favorite_items FOR SELECT USING (true);
CREATE POLICY "Public insert favorite_items" ON favorite_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete favorite_items" ON favorite_items FOR DELETE USING (true);

-- Write to deals, products, product_groups, pipeline_runs: service role only (pipeline)
-- No INSERT/UPDATE/DELETE policies for anon key on these tables.
-- Pipeline uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.

-- ============================================================
-- 6. SEED STARTER PACKS
-- ============================================================

INSERT INTO starter_packs (name, label, description, items, sort_order) VALUES
(
  'swiss-basics',
  'Swiss Basics',
  'Everyday essentials for a Swiss household',
  '[
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch", "milch 1l", "drink milch"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast", "zopf", "weggli"]},
    {"keyword": "butter", "label": "Butter", "category": "fresh", "excludeTerms": ["guezli", "gipfel", "erdnuss", "cookie", "schokolade", "croissant", "cordon"], "preferTerms": ["bratbutter", "butter 250", "butter 200", "vorzugsbutter"]},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10", "bio eier"]},
    {"keyword": "käse", "label": "Cheese", "category": "fresh", "excludeTerms": ["schnitzel", "cordon"], "preferTerms": ["reibkäse", "gruyère", "emmentaler", "appenzeller"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature", "jogurt"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletflügeli", "pouletschnitzel"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "rispentomaten", "pelati", "tomatenpüree"]},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh", "excludeTerms": ["süsskartoffel", "cubes", "chips", "gratin", "rösti", "stock"], "preferTerms": ["kartoffeln", "festkochend", "mehligkochend"]},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "kaffee", "label": "Coffee", "category": "long-life", "excludeTerms": ["rahm", "glace"]},
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
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "pelati", "tomatenpüree"]},
    {"keyword": "knoblauch", "label": "Garlic", "category": "fresh", "excludeTerms": ["spiess", "crevette", "fleisch", "poulet", "wurst", "pizza", "brot"], "preferTerms": ["knoblauch ", "knoblauchzehen"]},
    {"keyword": "ingwer", "label": "Ginger", "category": "fresh"},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletflügeli", "pouletschnitzel"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature"]},
    {"keyword": "kokosmilch", "label": "Coconut Milk", "category": "long-life"},
    {"keyword": "linsen", "label": "Lentils", "category": "long-life"},
    {"keyword": "kichererbsen", "label": "Chickpeas", "category": "long-life"},
    {"keyword": "spinat", "label": "Spinach", "category": "fresh", "excludeTerms": ["tortelloni", "ravioli", "pizza", "quiche", "lasagne", "plätzli"], "preferTerms": ["blattspinat", "spinat "]},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh", "excludeTerms": ["süsskartoffel", "cubes", "chips", "gratin", "rösti", "stock"], "preferTerms": ["kartoffeln", "festkochend", "mehligkochend"]},
    {"keyword": "naan", "label": "Naan Bread", "category": "fresh"},
    {"keyword": "öl", "label": "Cooking Oil", "category": "long-life", "excludeTerms": ["flecken", "beckmann", "reinig", "pflege", "piadina", "brot"], "preferTerms": ["sonnenblumenöl", "rapsöl", "frittieröl", "olivenöl"]}
  ]'::jsonb,
  2
),
(
  'mediterranean',
  'Mediterranean',
  'Fresh ingredients for Mediterranean-style cooking',
  '[
    {"keyword": "olivenöl", "label": "Olive Oil", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza", "bruschetta"], "preferTerms": ["olivenöl extra", "olivenöl 5", "olivenöl 1l"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "pelati", "tomatenpüree"]},
    {"keyword": "mozzarella", "label": "Mozzarella", "category": "fresh", "excludeTerms": ["schnitzel", "pizza", "panini"], "preferTerms": ["mozzarella ", "mini mozzarella", "burrata"]},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "knoblauch", "label": "Garlic", "category": "fresh", "excludeTerms": ["spiess", "crevette", "fleisch", "poulet", "wurst", "pizza", "brot"], "preferTerms": ["knoblauch ", "knoblauchzehen"]},
    {"keyword": "zucchetti", "label": "Zucchini", "category": "fresh"},
    {"keyword": "aubergine", "label": "Eggplant", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "feta", "label": "Feta Cheese", "category": "fresh"},
    {"keyword": "oliven", "label": "Olives", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza"], "preferTerms": ["oliven ", "kalamata"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz"], "preferTerms": ["pouletbrust", "pouletflügeli"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ciabatta", "focaccia", "brot "]},
    {"keyword": "wein", "label": "Wine", "category": "long-life", "excludeTerms": ["schwein", "essig"], "preferTerms": ["rotwein", "weisswein", "rosé", "prosecco"]},
    {"keyword": "salat", "label": "Salad", "category": "fresh", "excludeTerms": ["schleuder", "schüssel", "besteck", "sauce"], "preferTerms": ["eisberg", "kopfsalat", "rucola", "nüsslisalat"]},
    {"keyword": "thunfisch", "label": "Tuna", "category": "long-life"}
  ]'::jsonb,
  3
),
(
  'studentenkueche',
  'Studentenküche',
  'Budget basics for students',
  '[
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10", "bio eier"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast", "zopf"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "pelati"]},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh", "excludeTerms": ["süsskartoffel", "cubes", "chips", "gratin", "rösti", "stock"], "preferTerms": ["kartoffeln", "festkochend", "mehligkochend"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletflügeli", "pouletschnitzel"]},
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch", "milch 1l"]},
    {"keyword": "käse", "label": "Cheese", "category": "fresh", "excludeTerms": ["schnitzel", "cordon"], "preferTerms": ["reibkäse", "gruyère", "emmentaler"]},
    {"keyword": "chips", "label": "Chips", "category": "long-life"},
    {"keyword": "bier", "label": "Beer", "category": "long-life"},
    {"keyword": "tiefkühlpizza", "label": "Frozen Pizza", "category": "long-life"},
    {"keyword": "müesli", "label": "Muesli", "category": "long-life"},
    {"keyword": "toilettenpapier", "label": "Toilet Paper", "category": "non-food"}
  ]'::jsonb,
  4
),
(
  'familientisch',
  'Familientisch',
  'Family meals, snacks, and bulk items',
  '[
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch", "milch 1l"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast", "zopf"]},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10", "bio eier"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletflügeli", "pouletschnitzel"]},
    {"keyword": "rüebli", "label": "Carrots", "category": "fresh"},
    {"keyword": "äpfel", "label": "Apples", "category": "fresh"},
    {"keyword": "bananen", "label": "Bananas", "category": "fresh"},
    {"keyword": "müesli", "label": "Muesli", "category": "long-life"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "fischstäbchen", "label": "Fish Fingers", "category": "fresh"},
    {"keyword": "cervelat", "label": "Cervelat", "category": "fresh"},
    {"keyword": "ketchup", "label": "Ketchup", "category": "long-life"},
    {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"},
    {"keyword": "windeln", "label": "Diapers", "category": "non-food"}
  ]'::jsonb,
  5
);
