-- Migration 001: Product identity tables
-- Run this in Supabase SQL Editor AFTER the initial schema (supabase-setup.sql)
-- This is additive — no existing tables or data are modified destructively.

-- ============================================================
-- 1. PRODUCT GROUPS (reference data — defines what products exist)
-- ============================================================

CREATE TABLE product_groups (
  id            TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- slug format: "milk-whole-1l"
  label         TEXT NOT NULL,               -- "Whole Milk (1L)"
  category      TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category  TEXT,                        -- "dairy", "meat", "vegetables", etc.
  search_keywords TEXT[] NOT NULL DEFAULT '{}',  -- for future auto-suggest
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_groups_category ON product_groups (category);

-- ============================================================
-- 2. PRODUCTS (one row per real-world product at a specific store)
-- ============================================================

CREATE TABLE products (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_name  TEXT NOT NULL,              -- cleaned display name: "Bio Vollmilch 1L"
  brand           TEXT,                       -- "M-Budget", "Naturaplan", etc.
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,
  is_organic      BOOLEAN DEFAULT false,
  product_group   TEXT REFERENCES product_groups(id),  -- cross-store link
  source_name     TEXT NOT NULL,              -- raw product_name from deal (traceability)
  first_seen_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_product UNIQUE (store, source_name)
);

CREATE INDEX idx_products_group ON products (product_group) WHERE product_group IS NOT NULL;
CREATE INDEX idx_products_category ON products (category, sub_category);
CREATE INDEX idx_products_store ON products (store);

-- Auto-update updated_at (reuses existing function from supabase-setup.sql)
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. ADD FOREIGN KEYS TO EXISTING TABLES (nullable, non-breaking)
-- ============================================================

-- Deals: link to product (nullable — old deals stay product_id=NULL)
ALTER TABLE deals ADD COLUMN product_id UUID REFERENCES products(id);
CREATE INDEX idx_deals_product_id ON deals (product_id) WHERE product_id IS NOT NULL;

-- Favorite items: link to product group (nullable — old items stay product_group_id=NULL)
ALTER TABLE favorite_items ADD COLUMN product_group_id TEXT REFERENCES product_groups(id);
CREATE INDEX idx_favorite_items_product_group ON favorite_items (product_group_id)
  WHERE product_group_id IS NOT NULL;

-- ============================================================
-- 4. ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Product groups: public read (reference data)
CREATE POLICY "Public read product_groups" ON product_groups
  FOR SELECT USING (true);

-- Products: public read (metadata is not sensitive)
CREATE POLICY "Public read products" ON products
  FOR SELECT USING (true);

-- Write access: service role only (pipeline uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS)

-- ============================================================
-- 5. SEED PRODUCT GROUPS (~65 groups)
-- ============================================================

INSERT INTO product_groups (id, label, category, sub_category, search_keywords) VALUES
-- FRESH > dairy
('milk-whole-1l',       'Whole Milk (1L)',        'fresh', 'dairy',      ARRAY['milch', 'vollmilch', 'halbfettmilch']),
('yogurt-plain',        'Yogurt',                 'fresh', 'dairy',      ARRAY['joghurt', 'naturjoghurt', 'jogurt']),
('butter-250g',         'Butter (250g)',           'fresh', 'dairy',      ARRAY['butter', 'bratbutter', 'vorzugsbutter']),
('cheese-hard',         'Hard Cheese',             'fresh', 'dairy',      ARRAY['käse', 'gruyere', 'emmentaler', 'appenzeller', 'reibkäse']),
('mozzarella',          'Mozzarella',             'fresh', 'dairy',      ARRAY['mozzarella', 'burrata']),
('feta',                'Feta Cheese',             'fresh', 'dairy',      ARRAY['feta']),
('cream',               'Cream',                   'fresh', 'dairy',      ARRAY['rahm', 'sahne', 'halbrahm', 'vollrahm']),
('quark',               'Quark',                   'fresh', 'dairy',      ARRAY['quark']),

-- FRESH > eggs
('eggs-6pack',          'Eggs (6-pack)',           'fresh', 'eggs',       ARRAY['eier', 'freiland']),

-- FRESH > meat
('chicken-breast',      'Chicken Breast',          'fresh', 'poultry',    ARRAY['poulet', 'pouletbrust', 'pouletschnitzel']),
('chicken-wings',       'Chicken Wings',           'fresh', 'poultry',    ARRAY['pouletflügeli', 'chicken wings']),
('beef-minced',         'Minced Beef',             'fresh', 'meat',       ARRAY['hackfleisch', 'rindshackfleisch']),
('pork-schnitzel',      'Pork Schnitzel',          'fresh', 'meat',       ARRAY['schweineschnitzel', 'schnitzel']),
('salami',              'Salami',                  'fresh', 'deli',       ARRAY['salami', 'salametti']),
('ham',                 'Ham',                     'fresh', 'deli',       ARRAY['schinken', 'hinterschinken', 'kochschinken']),
('sausage',             'Sausages',                'fresh', 'deli',       ARRAY['wurst', 'cervelat', 'bratwurst', 'wienerli']),

-- FRESH > fish
('salmon',              'Salmon',                  'fresh', 'fish',       ARRAY['lachs', 'salmon']),
('shrimp',              'Shrimp',                  'fresh', 'fish',       ARRAY['crevetten', 'shrimp', 'garnelen']),
('tuna-fresh',          'Fresh Tuna',              'fresh', 'fish',       ARRAY['thunfisch']),

-- FRESH > bread
('bread-assorted',      'Bread',                   'fresh', 'bread',      ARRAY['brot', 'ruchbrot', 'toast', 'toastbrot']),
('zopf',                'Zopf',                    'fresh', 'bread',      ARRAY['zopf', 'butterzopf']),
('bread-rolls',         'Bread Rolls',             'fresh', 'bread',      ARRAY['brötchen', 'weggli', 'bürli']),
('naan-bread',          'Naan Bread',              'fresh', 'bread',      ARRAY['naan']),

-- FRESH > vegetables
('tomatoes-fresh',      'Tomatoes',                'fresh', 'vegetables', ARRAY['tomaten', 'cherry', 'rispentomaten']),
('onions',              'Onions',                  'fresh', 'vegetables', ARRAY['zwiebeln']),
('potatoes',            'Potatoes',                'fresh', 'vegetables', ARRAY['kartoffeln', 'festkochend']),
('garlic',              'Garlic',                  'fresh', 'vegetables', ARRAY['knoblauch', 'knoblauchzehen']),
('ginger',              'Ginger',                  'fresh', 'vegetables', ARRAY['ingwer']),
('spinach',             'Spinach',                 'fresh', 'vegetables', ARRAY['spinat', 'blattspinat']),
('bell-peppers',        'Bell Peppers',            'fresh', 'vegetables', ARRAY['peperoni']),
('zucchini',            'Zucchini',                'fresh', 'vegetables', ARRAY['zucchetti', 'zucchini']),
('eggplant',            'Eggplant',                'fresh', 'vegetables', ARRAY['aubergine', 'auberginen']),
('cucumber',            'Cucumber',                'fresh', 'vegetables', ARRAY['gurke', 'gurken', 'salatgurke']),
('carrots',             'Carrots',                 'fresh', 'vegetables', ARRAY['karotten', 'rüebli']),
('mushrooms',           'Mushrooms',               'fresh', 'vegetables', ARRAY['champignons', 'pilze']),
('salad-greens',        'Salad Greens',            'fresh', 'vegetables', ARRAY['salat', 'eisberg', 'rucola', 'nüsslisalat']),

-- FRESH > fruit
('bananas',             'Bananas',                 'fresh', 'fruit',      ARRAY['bananen']),
('apples',              'Apples',                  'fresh', 'fruit',      ARRAY['äpfel', 'apfel', 'gala', 'braeburn']),
('berries',             'Berries',                 'fresh', 'fruit',      ARRAY['erdbeeren', 'himbeeren', 'heidelbeeren', 'beeren']),

-- FRESH > ready meals
('hummus',              'Hummus',                  'fresh', 'ready-meals', ARRAY['hummus']),
('tofu',                'Tofu',                    'fresh', 'ready-meals', ARRAY['tofu']),

-- LONG-LIFE > pasta & rice
('pasta-assorted',      'Pasta',                   'long-life', 'pasta-rice',  ARRAY['pasta', 'spaghetti', 'penne', 'fusilli']),
('rice-assorted',       'Rice',                    'long-life', 'pasta-rice',  ARRAY['reis', 'basmati', 'jasmin']),

-- LONG-LIFE > canned
('coconut-milk',        'Coconut Milk',            'long-life', 'canned',      ARRAY['kokosmilch', 'kokosnussmilch']),
('lentils',             'Lentils',                 'long-life', 'canned',      ARRAY['linsen']),
('chickpeas',           'Chickpeas',               'long-life', 'canned',      ARRAY['kichererbsen']),
('olives',              'Olives',                  'long-life', 'canned',      ARRAY['oliven', 'kalamata']),
('tuna-canned',         'Canned Tuna',             'long-life', 'canned',      ARRAY['thunfisch']),
('tomatoes-canned',     'Canned Tomatoes',         'long-life', 'canned',      ARRAY['pelati', 'tomatenstücke', 'passata']),
('beans-canned',        'Canned Beans',            'long-life', 'canned',      ARRAY['bohnen', 'kidneybohnen']),

-- LONG-LIFE > condiments & oil
('olive-oil',           'Olive Oil',               'long-life', 'condiments',  ARRAY['olivenöl']),
('cooking-oil',         'Cooking Oil',             'long-life', 'condiments',  ARRAY['sonnenblumenöl', 'rapsöl']),
('flour',               'Flour',                   'long-life', 'condiments',  ARRAY['mehl', 'weissmehl', 'ruchmehl']),
('sugar',               'Sugar',                   'long-life', 'condiments',  ARRAY['zucker', 'rohrzucker']),

-- LONG-LIFE > drinks
('wine-red',            'Red Wine',                'long-life', 'drinks',      ARRAY['rotwein']),
('wine-white',          'White Wine',              'long-life', 'drinks',      ARRAY['weisswein']),
('coffee-assorted',     'Coffee',                  'long-life', 'coffee-tea',  ARRAY['kaffee', 'espresso']),
('tea-assorted',        'Tea',                     'long-life', 'coffee-tea',  ARRAY['tee']),

-- LONG-LIFE > snacks & chocolate
('chocolate-assorted',  'Chocolate',               'long-life', 'chocolate',   ARRAY['schokolade', 'tafelschokolade']),
('chips',               'Chips',                   'long-life', 'snacks',      ARRAY['chips']),
('muesli',              'Muesli',                  'long-life', 'snacks',      ARRAY['müesli', 'birchermüesli', 'müsli']),
('nuts',                'Nuts',                    'long-life', 'snacks',      ARRAY['nüsse', 'mandeln', 'cashew', 'erdnüsse']),

-- NON-FOOD > cleaning
('laundry-detergent',   'Laundry Detergent',       'non-food', 'laundry',       ARRAY['waschmittel', 'waschpulver']),
('dish-soap',           'Dish Soap',               'non-food', 'cleaning',      ARRAY['abwaschmittel', 'geschirrspüler', 'geschirrspülmittel']),
('all-purpose-cleaner', 'All-Purpose Cleaner',     'non-food', 'cleaning',      ARRAY['reiniger', 'allzweckreiniger', 'putzmittel']),

-- NON-FOOD > paper goods
('toilet-paper',        'Toilet Paper',            'non-food', 'paper-goods',   ARRAY['toilettenpapier', 'wc-papier']),
('paper-towels',        'Paper Towels',            'non-food', 'paper-goods',   ARRAY['küchenpapier', 'haushaltpapier']),
('tissues',             'Tissues',                 'non-food', 'paper-goods',   ARRAY['taschentücher', 'tempo']),

-- NON-FOOD > personal care
('shampoo',             'Shampoo',                 'non-food', 'personal-care', ARRAY['shampoo']),
('shower-gel',          'Shower Gel',              'non-food', 'personal-care', ARRAY['duschgel', 'shower']),
('toothpaste',          'Toothpaste',              'non-food', 'personal-care', ARRAY['zahnpasta', 'zahncreme']),
('deodorant',           'Deodorant',               'non-food', 'personal-care', ARRAY['deo', 'deodorant']);
