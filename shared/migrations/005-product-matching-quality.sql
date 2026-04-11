-- Migration 005: Improve product matching quality
-- Adds exclude_keywords + product_form to product_groups,
-- product_form to products, splits ambiguous groups, adds new groups.

-- ============================================================
-- 1. SCHEMA CHANGES
-- ============================================================

-- Add exclude_keywords to product_groups (reject false matches at group level)
ALTER TABLE product_groups
  ADD COLUMN IF NOT EXISTS exclude_keywords TEXT[] NOT NULL DEFAULT '{}';

-- Add product_form to product_groups
ALTER TABLE product_groups
  ADD COLUMN IF NOT EXISTS product_form TEXT DEFAULT 'raw'
  CHECK (product_form IN ('raw', 'processed', 'ready-meal', 'canned', 'frozen', 'dried'));

-- Add product_form to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_form TEXT DEFAULT 'raw'
  CHECK (product_form IN ('raw', 'processed', 'ready-meal', 'canned', 'frozen', 'dried'));

-- ============================================================
-- 2. UPDATE EXISTING GROUPS WITH EXCLUDE KEYWORDS + PRODUCT FORM
-- ============================================================

-- Milk: exclude chocolate, coconut, plant-based, desserts
UPDATE product_groups SET
  exclude_keywords = ARRAY['schokolade', 'kokos', 'mandel', 'hafer', 'soja', 'reis', 'drink', 'pudding', 'dessert', 'glace', 'shake', 'caramel', 'branche'],
  product_form = 'raw'
WHERE id = 'milk-whole-1l';

-- Yogurt: exclude chocolate bars, candy
UPDATE product_groups SET
  exclude_keywords = ARRAY['twix', 'mars', 'snickers', 'riegel', 'schokolade'],
  product_form = 'raw'
WHERE id = 'yogurt-plain';

-- Butter: exclude pastries, spreads, cookies
UPDATE product_groups SET
  exclude_keywords = ARRAY['guezli', 'gipfel', 'erdnuss', 'cookie', 'schokolade', 'croissant', 'cordon', 'biscuit'],
  product_form = 'raw'
WHERE id = 'butter-250g';

-- Cheese: exclude schnitzel, cordon bleu
UPDATE product_groups SET
  exclude_keywords = ARRAY['schnitzel', 'cordon', 'fondue'],
  product_form = 'raw'
WHERE id = 'cheese-hard';

-- Chicken breast: exclude wings, nuggets, thigh, whole chicken
UPDATE product_groups SET
  search_keywords = ARRAY['pouletbrust', 'pouletbrustfilet', 'pouletschnitzel', 'pouletbrustschnitzel', 'poulet brust'],
  exclude_keywords = ARRAY['flügeli', 'flügel', 'wings', 'schenkel', 'nuggets', 'geschnetzeltes', 'whole', 'ganz'],
  product_form = 'raw'
WHERE id = 'chicken-breast';

-- Chicken wings: specific keywords only
UPDATE product_groups SET
  search_keywords = ARRAY['pouletflügeli', 'pouletflügel', 'chicken wings', 'poulet flügeli'],
  exclude_keywords = ARRAY['brust', 'schnitzel'],
  product_form = 'raw'
WHERE id = 'chicken-wings';

-- Eggs: exclude pasta, noodles
UPDATE product_groups SET
  exclude_keywords = ARRAY['nudeln', 'hörnli', 'penne', 'magronen', 'müscheli', 'spaghetti', 'teigwaren', 'pasta'],
  product_form = 'raw'
WHERE id = 'eggs-6pack';

-- Tomatoes fresh: exclude all processed forms
UPDATE product_groups SET
  exclude_keywords = ARRAY['püree', 'puree', 'sauce', 'mark', 'ketchup', 'sugo', 'passata', 'pelati', 'getrocknet', 'stücke', 'stucke', 'konzentrat', 'paste'],
  product_form = 'raw'
WHERE id = 'tomatoes-fresh';

-- Tomatoes canned: already specific
UPDATE product_groups SET
  exclude_keywords = ARRAY['frisch', 'cherry', 'rispen'],
  product_form = 'canned'
WHERE id = 'tomatoes-canned';

-- Potatoes: exclude all prepared forms
UPDATE product_groups SET
  exclude_keywords = ARRAY['cubes', 'gratin', 'rösti', 'stock', 'püree', 'puree', 'chips', 'frites', 'wedges', 'kroketten', 'gnocchi', 'smoky', 'country', 'hash'],
  product_form = 'raw'
WHERE id = 'potatoes';

-- Spinach: exclude dishes containing spinach
UPDATE product_groups SET
  exclude_keywords = ARRAY['tortelloni', 'ravioli', 'pizza', 'quiche', 'lasagne', 'plätzli', 'cannelloni'],
  product_form = 'raw'
WHERE id = 'spinach';

-- Garlic: exclude prepared dishes
UPDATE product_groups SET
  exclude_keywords = ARRAY['spiess', 'crevette', 'fleisch', 'poulet', 'wurst', 'pizza', 'brot', 'butter'],
  product_form = 'raw'
WHERE id = 'garlic';

-- Olive oil: exclude dishes
UPDATE product_groups SET
  exclude_keywords = ARRAY['piadina', 'brot', 'pizza', 'bruschetta'],
  product_form = 'processed'
WHERE id = 'olive-oil';

-- Coffee: exclude cream, ice cream
UPDATE product_groups SET
  exclude_keywords = ARRAY['rahm', 'glace', 'sirup', 'glacé'],
  product_form = 'processed'
WHERE id = 'coffee-assorted';

-- Bread: exclude spreads, chips
UPDATE product_groups SET
  exclude_keywords = ARRAY['aufstrich', 'brotaufstrich', 'chips', 'stängel', 'crouton'],
  product_form = 'raw'
WHERE id = 'bread-assorted';

-- Salad: exclude dressing, tools
UPDATE product_groups SET
  exclude_keywords = ARRAY['schleuder', 'schüssel', 'besteck', 'sauce', 'dressing'],
  product_form = 'raw'
WHERE id = 'salad-greens';

-- Salmon: exclude smoked
UPDATE product_groups SET
  exclude_keywords = ARRAY['räucher', 'geräuchert'],
  product_form = 'raw'
WHERE id = 'salmon';

-- Minced beef: exclude dishes
UPDATE product_groups SET
  exclude_keywords = ARRAY['burger', 'bällchen', 'bolognese'],
  product_form = 'raw'
WHERE id = 'beef-minced';

-- Laundry detergent: specific
UPDATE product_groups SET product_form = 'processed' WHERE id = 'laundry-detergent';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'dish-soap';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'all-purpose-cleaner';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'shampoo';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'shower-gel';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'toothpaste';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'deodorant';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'toilet-paper';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'paper-towels';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'tissues';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'cooking-oil';

-- Pasta, rice, flour, sugar — dried/processed
UPDATE product_groups SET product_form = 'dried' WHERE id = 'pasta-assorted';
UPDATE product_groups SET product_form = 'dried' WHERE id = 'rice-assorted';
UPDATE product_groups SET product_form = 'dried' WHERE id = 'flour';
UPDATE product_groups SET product_form = 'processed' WHERE id = 'sugar';

-- Canned goods
UPDATE product_groups SET product_form = 'canned' WHERE id = 'coconut-milk';
UPDATE product_groups SET product_form = 'canned' WHERE id = 'lentils';
UPDATE product_groups SET product_form = 'canned' WHERE id = 'chickpeas';
UPDATE product_groups SET product_form = 'canned' WHERE id = 'olives';
UPDATE product_groups SET product_form = 'canned' WHERE id = 'tuna-canned';
UPDATE product_groups SET product_form = 'canned' WHERE id = 'beans-canned';

-- ============================================================
-- 3. ADD NEW PRODUCT GROUPS (split from ambiguous ones)
-- ============================================================

INSERT INTO product_groups (id, label, category, sub_category, search_keywords, exclude_keywords, product_form) VALUES
-- Chicken splits
('chicken-thigh',       'Chicken Thigh',         'fresh', 'poultry',    ARRAY['pouletschenkel', 'poulet schenkel', 'oberschenkel'], ARRAY['brust', 'flügeli'], 'raw'),
('chicken-nuggets',     'Chicken Nuggets',        'fresh', 'poultry',    ARRAY['poulet nuggets', 'chicken nuggets', 'poulet knusperli', 'poulet crispy'], ARRAY[]::TEXT[], 'ready-meal'),
('chicken-whole',       'Whole Chicken',          'fresh', 'poultry',    ARRAY['poulet ganz', 'ganzes poulet', 'bratpoulet'], ARRAY['brust', 'schnitzel', 'flügeli', 'schenkel'], 'raw'),

-- Tomato splits
('tomato-puree',        'Tomato Puree/Paste',     'long-life', 'canned', ARRAY['tomatenpüree', 'tomatenpuree', 'tomatenmark', 'tomatenkonzentrat', 'tomaten püree'], ARRAY[]::TEXT[], 'processed'),
('tomato-sauce',        'Tomato Sauce',           'long-life', 'canned', ARRAY['tomatensauce', 'tomatensugo', 'passata', 'sugo'], ARRAY['pizza'], 'processed'),

-- Potato splits
('potato-ready-meal',   'Potato Ready Meal',      'fresh', 'ready-meals', ARRAY['kartoffel cubes', 'kartoffelgratin', 'kartoffelstock', 'kartoffelpüree', 'rösti', 'kartoffel smoky', 'kartoffel country'], ARRAY[]::TEXT[], 'ready-meal'),
('fries-frozen',        'Frozen Fries',           'long-life', 'frozen',  ARRAY['pommes frites', 'kartoffel frites', 'wedges', 'frites'], ARRAY[]::TEXT[], 'frozen'),

-- Milk splits
('milk-plant',          'Plant Milk',             'fresh', 'dairy',      ARRAY['hafermilch', 'haferdrink', 'mandelmilch', 'sojamilch', 'reismilch', 'sojadrink'], ARRAY[]::TEXT[], 'processed'),

-- Other missing groups
('pork-minced',         'Minced Pork',            'fresh', 'meat',       ARRAY['schweinehackfleisch', 'schweinshack'], ARRAY[]::TEXT[], 'raw'),
('mixed-minced',        'Mixed Minced Meat',      'fresh', 'meat',       ARRAY['hackfleisch gemischt', 'rind und schwein'], ARRAY[]::TEXT[], 'raw'),
('salmon-smoked',       'Smoked Salmon',          'fresh', 'fish',       ARRAY['räucherlachs', 'lachs geräuchert', 'smoked salmon'], ARRAY[]::TEXT[], 'processed')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  search_keywords = EXCLUDED.search_keywords,
  exclude_keywords = EXCLUDED.exclude_keywords,
  product_form = EXCLUDED.product_form;

-- ============================================================
-- 4. UPDATE STARTER PACKS — add productGroupId for new split groups
-- ============================================================

-- Update starter pack items that reference tomato products
-- (tomatoes in starter packs should point to tomatoes-fresh, not the old generic group)
-- This is already handled by migration 003 which set productGroupId based on keyword mapping.
-- No changes needed here since the keyword 'tomaten' already maps to 'tomatoes-fresh'.
