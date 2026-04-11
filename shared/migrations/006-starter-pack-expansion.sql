-- Migration 006: Expand starter packs from 4 to 8
-- Adds: Studentenküche, Familientisch, Pflanzlich, Balkan & Türkisch, Fitness & Protein
-- Updates: Swiss Basics (add rüebli, bananen, remove shampoo), Mediterranean (add basilikum, zitronen, pelati)
-- Deactivates: General Mix (replaced by Studentenküche)

BEGIN;

-- ============================================================
-- 1. DEACTIVATE General Mix (replaced by Studentenküche)
-- ============================================================
UPDATE starter_packs
SET is_active = false
WHERE name = 'general';

-- ============================================================
-- 2. UPDATE Swiss Basics — add rüebli, bananen; remove shampoo
-- ============================================================
UPDATE starter_packs
SET
  items = '[
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch", "milch 1l", "drink milch"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast", "zopf", "weggli"]},
    {"keyword": "butter", "label": "Butter", "category": "fresh", "excludeTerms": ["guezli", "gipfel", "erdnuss", "cookie", "schokolade", "croissant", "cordon"], "preferTerms": ["bratbutter", "butter 250", "butter 200", "vorzugsbutter"]},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10", "bio eier"]},
    {"keyword": "käse", "label": "Cheese", "category": "fresh", "excludeTerms": ["schnitzel", "cordon"], "preferTerms": ["reibkäse", "gruyère", "emmentaler", "appenzeller"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature", "jogurt"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletflügeli", "pouletschnitzel"]},
    {"keyword": "rüebli", "label": "Carrots", "category": "fresh", "preferTerms": ["rüebli", "karotten"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "rispentomaten"]},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh", "excludeTerms": ["süsskartoffel", "cubes", "chips", "gratin", "rösti", "stock"], "preferTerms": ["kartoffeln", "festkochend", "mehligkochend"]},
    {"keyword": "bananen", "label": "Bananas", "category": "fresh"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "kaffee", "label": "Coffee", "category": "long-life", "excludeTerms": ["rahm", "glace"]},
    {"keyword": "schokolade", "label": "Chocolate", "category": "long-life"},
    {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"},
    {"keyword": "toilettenpapier", "label": "Toilet Paper", "category": "non-food"}
  ]'::jsonb,
  sort_order = 1
WHERE name = 'swiss-basics';

-- ============================================================
-- 3. UPDATE Mediterranean — replace brot/thunfisch with basilikum, zitronen, pelati
-- ============================================================
UPDATE starter_packs
SET
  items = '[
    {"keyword": "olivenöl", "label": "Olive Oil", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza", "bruschetta"], "preferTerms": ["olivenöl extra", "olivenöl 5", "olivenöl 1l"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry", "rispentomaten"]},
    {"keyword": "mozzarella", "label": "Mozzarella", "category": "fresh", "excludeTerms": ["schnitzel", "pizza", "panini"], "preferTerms": ["mozzarella ", "mini mozzarella", "burrata"]},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "knoblauch", "label": "Garlic", "category": "fresh", "excludeTerms": ["spiess", "crevette", "fleisch", "poulet", "wurst", "pizza", "brot"], "preferTerms": ["knoblauch ", "knoblauchzehen"]},
    {"keyword": "zucchetti", "label": "Zucchini", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "feta", "label": "Feta Cheese", "category": "fresh"},
    {"keyword": "oliven", "label": "Olives", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza"], "preferTerms": ["oliven ", "kalamata"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz"], "preferTerms": ["pouletbrust", "pouletflügeli"]},
    {"keyword": "salat", "label": "Salad Greens", "category": "fresh", "excludeTerms": ["schleuder", "schüssel", "besteck", "sauce"], "preferTerms": ["eisberg", "kopfsalat", "rucola", "nüsslisalat"]},
    {"keyword": "basilikum", "label": "Basil", "category": "fresh", "excludeTerms": ["sauce", "pesto", "pizza", "pasta"]},
    {"keyword": "zitronen", "label": "Lemons", "category": "fresh", "excludeTerms": ["saft", "sirup", "essig", "bonbon", "drops"], "preferTerms": ["zitronen", "bio zitronen"]},
    {"keyword": "pelati", "label": "Canned Tomatoes", "category": "long-life"},
    {"keyword": "wein", "label": "Wine", "category": "long-life", "excludeTerms": ["schwein", "essig"], "preferTerms": ["rotwein", "weisswein", "rosé", "prosecco"]}
  ]'::jsonb,
  sort_order = 4
WHERE name = 'mediterranean';

-- ============================================================
-- 4. UPDATE Indian Kitchen sort order (keep items unchanged)
-- ============================================================
UPDATE starter_packs SET sort_order = 6 WHERE name = 'indian-kitchen';

-- ============================================================
-- 5. INSERT NEW PACKS (ON CONFLICT for idempotency)
-- ============================================================

-- Pack: Familientisch
INSERT INTO starter_packs (name, label, description, items, sort_order, is_active) VALUES
(
  'familien',
  'Family Table',
  'Balanced meals and kids'' favourites for the whole family',
  '[
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch", "milch 1l"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast", "zopf"]},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletschnitzel"]},
    {"keyword": "rüebli", "label": "Carrots", "category": "fresh", "preferTerms": ["rüebli", "karotten"]},
    {"keyword": "äpfel", "label": "Apples", "category": "fresh", "excludeTerms": ["saft", "schorle", "essig", "mus", "strudel", "kuchen", "wähe", "kompott"], "preferTerms": ["gala", "braeburn"]},
    {"keyword": "bananen", "label": "Bananas", "category": "fresh"},
    {"keyword": "müesli", "label": "Muesli", "category": "long-life"},
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "fischstäbchen", "label": "Fish Fingers", "category": "long-life"},
    {"keyword": "cervelat", "label": "Cervelat", "category": "fresh", "preferTerms": ["cervelat"]},
    {"keyword": "ketchup", "label": "Ketchup", "category": "long-life", "excludeTerms": ["chips"]},
    {"keyword": "waschmittel", "label": "Laundry Detergent", "category": "non-food"},
    {"keyword": "windeln", "label": "Diapers", "category": "non-food"}
  ]'::jsonb,
  2,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  items = EXCLUDED.items,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Pack: Studentenküche (replaces General Mix)
INSERT INTO starter_packs (name, label, description, items, sort_order, is_active) VALUES
(
  'studenten',
  'Student Kitchen',
  'Budget-friendly staples for maximum meals per franc',
  '[
    {"keyword": "pasta", "label": "Pasta", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry"]},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "kartoffeln", "label": "Potatoes", "category": "fresh", "excludeTerms": ["süsskartoffel", "cubes", "chips", "gratin", "rösti", "stock"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz", "zweifel", "chörbli"], "preferTerms": ["pouletbrust", "pouletschnitzel"]},
    {"keyword": "milch", "label": "Milk", "category": "fresh", "excludeTerms": ["schokolade", "branche", "kokos", "glace", "shake", "dessert", "pudding", "caramel"], "preferTerms": ["vollmilch", "halbfettmilch"]},
    {"keyword": "käse", "label": "Cheese", "category": "fresh", "excludeTerms": ["schnitzel", "cordon"], "preferTerms": ["reibkäse", "gruyère"]},
    {"keyword": "chips", "label": "Chips", "category": "long-life", "excludeTerms": ["schoko"]},
    {"keyword": "bier", "label": "Beer", "category": "long-life", "excludeTerms": ["essig", "ingwer", "malz"]},
    {"keyword": "pizza", "label": "Frozen Pizza", "category": "long-life", "excludeTerms": ["pizzateig", "pizzaschaufel", "pizzastein"], "preferTerms": ["tiefkühlpizza", "pizza margherita", "pizza prosciutto"]},
    {"keyword": "müesli", "label": "Muesli", "category": "long-life"},
    {"keyword": "toilettenpapier", "label": "Toilet Paper", "category": "non-food"}
  ]'::jsonb,
  3,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  items = EXCLUDED.items,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Pack: Pflanzlich / Plant-Based
INSERT INTO starter_packs (name, label, description, items, sort_order, is_active) VALUES
(
  'pflanzlich',
  'Plant-Based',
  'Vegetarian and vegan staples — protein-rich, no meat',
  '[
    {"keyword": "tofu", "label": "Tofu", "category": "fresh"},
    {"keyword": "hummus", "label": "Hummus", "category": "fresh"},
    {"keyword": "linsen", "label": "Lentils", "category": "long-life"},
    {"keyword": "kichererbsen", "label": "Chickpeas", "category": "long-life"},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "kokosmilch", "label": "Coconut Milk", "category": "long-life"},
    {"keyword": "avocado", "label": "Avocado", "category": "fresh"},
    {"keyword": "spinat", "label": "Spinach", "category": "fresh", "excludeTerms": ["tortelloni", "ravioli", "pizza", "quiche", "lasagne", "cannelloni"], "preferTerms": ["blattspinat", "spinat "]},
    {"keyword": "champignons", "label": "Mushrooms", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry"]},
    {"keyword": "nüsse", "label": "Nuts", "category": "long-life", "excludeTerms": ["butter", "creme", "aufstrich"]},
    {"keyword": "hafermilch", "label": "Oat Milk", "category": "fresh", "preferTerms": ["hafermilch", "haferdrink", "oat"]},
    {"keyword": "olivenöl", "label": "Olive Oil", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza"]},
    {"keyword": "brot", "label": "Bread", "category": "fresh", "excludeTerms": ["aufstrich", "brotaufstrich", "chips", "stängel"], "preferTerms": ["ruchbrot", "toast"]}
  ]'::jsonb,
  5,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  items = EXCLUDED.items,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Pack: Balkan & Türkisch
INSERT INTO starter_packs (name, label, description, items, sort_order, is_active) VALUES
(
  'balkan-tuerkisch',
  'Balkan & Turkish',
  'Staples for Turkish and Balkan home cooking',
  '[
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "hackfleisch", "label": "Minced Meat", "category": "fresh", "excludeTerms": ["burger", "bällchen", "bolognese"], "preferTerms": ["hackfleisch", "rindshack"]},
    {"keyword": "joghurt", "label": "Yogurt", "category": "fresh", "excludeTerms": ["twix", "mars", "snickers", "schokolade", "riegel"], "preferTerms": ["naturjoghurt", "joghurt nature"]},
    {"keyword": "tomaten", "label": "Tomatoes", "category": "fresh", "excludeTerms": ["erde", "hauert", "gnocchi", "gewürz"], "preferTerms": ["tomaten ", "cherry"]},
    {"keyword": "zwiebeln", "label": "Onions", "category": "fresh"},
    {"keyword": "peperoni", "label": "Bell Peppers", "category": "fresh"},
    {"keyword": "gurken", "label": "Cucumbers", "category": "fresh"},
    {"keyword": "fladenbrot", "label": "Flatbread", "category": "fresh", "excludeTerms": ["chips", "aufstrich"], "preferTerms": ["fladenbrot", "pide"]},
    {"keyword": "feta", "label": "Feta Cheese", "category": "fresh"},
    {"keyword": "oliven", "label": "Olives", "category": "long-life", "excludeTerms": ["piadina", "brot", "pizza"], "preferTerms": ["oliven ", "kalamata"]},
    {"keyword": "poulet", "label": "Chicken", "category": "fresh", "excludeTerms": ["chips", "bouillon", "geschmack", "aroma", "gewürz"], "preferTerms": ["pouletbrust", "pouletschnitzel"]},
    {"keyword": "aubergine", "label": "Eggplant", "category": "fresh"},
    {"keyword": "linsen", "label": "Lentils", "category": "long-life"},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"]},
    {"keyword": "sonnenblumenöl", "label": "Cooking Oil", "category": "long-life", "preferTerms": ["sonnenblumenöl", "rapsöl"]}
  ]'::jsonb,
  7,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  items = EXCLUDED.items,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Pack: Fitness & Protein
INSERT INTO starter_packs (name, label, description, items, sort_order, is_active) VALUES
(
  'fitness',
  'Fitness & Protein',
  'High-protein staples for gym-goers and health-conscious shoppers',
  '[
    {"keyword": "pouletbrust", "label": "Chicken Breast", "category": "fresh", "excludeTerms": ["flügeli", "wings", "schenkel", "nuggets"], "preferTerms": ["pouletbrust", "pouletbrustfilet"]},
    {"keyword": "eier", "label": "Eggs", "category": "fresh", "excludeTerms": ["nudeln", "hörnli", "penne", "magronen", "müscheli", "spaghetti", "teigwaren", "pasta"], "preferTerms": ["freiland", "eier 6", "eier 10"]},
    {"keyword": "quark", "label": "Quark", "category": "fresh"},
    {"keyword": "lachs", "label": "Salmon", "category": "fresh", "excludeTerms": ["räucher", "geräuchert", "smoked"]},
    {"keyword": "reis", "label": "Rice", "category": "long-life"},
    {"keyword": "haferflocken", "label": "Oats", "category": "long-life", "excludeTerms": ["riegel", "cookie"]},
    {"keyword": "bananen", "label": "Bananas", "category": "fresh"},
    {"keyword": "spinat", "label": "Spinach", "category": "fresh", "excludeTerms": ["tortelloni", "ravioli", "pizza", "quiche", "lasagne", "cannelloni"], "preferTerms": ["blattspinat", "spinat "]},
    {"keyword": "avocado", "label": "Avocado", "category": "fresh"},
    {"keyword": "nüsse", "label": "Nuts", "category": "long-life", "excludeTerms": ["butter", "creme", "aufstrich"]},
    {"keyword": "tofu", "label": "Tofu", "category": "fresh"},
    {"keyword": "erdnussbutter", "label": "Peanut Butter", "category": "long-life", "preferTerms": ["erdnussbutter", "peanut butter"]},
    {"keyword": "thunfisch", "label": "Tuna", "category": "long-life", "excludeTerms": ["frisch", "steak"]},
    {"keyword": "süsskartoffel", "label": "Sweet Potatoes", "category": "fresh", "excludeTerms": ["chips", "frites", "pommes"]},
    {"keyword": "cottage cheese", "label": "Cottage Cheese", "category": "fresh"}
  ]'::jsonb,
  8,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  items = EXCLUDED.items,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ============================================================
-- 6. APPLY productGroupId TO ALL ACTIVE PACK ITEMS
-- ============================================================

CREATE TEMPORARY TABLE _keyword_to_group (keyword TEXT PRIMARY KEY, group_id TEXT NOT NULL);

INSERT INTO _keyword_to_group (keyword, group_id) VALUES
  ('milch', 'milk-whole-1l'),
  ('brot', 'bread-assorted'),
  ('butter', 'butter-250g'),
  ('eier', 'eggs-6pack'),
  ('käse', 'cheese-hard'),
  ('joghurt', 'yogurt-plain'),
  ('poulet', 'chicken-breast'),
  ('pouletbrust', 'chicken-breast'),
  ('tomaten', 'tomatoes-fresh'),
  ('zwiebeln', 'onions'),
  ('kartoffeln', 'potatoes'),
  ('pasta', 'pasta-assorted'),
  ('reis', 'rice-assorted'),
  ('kaffee', 'coffee-assorted'),
  ('schokolade', 'chocolate-assorted'),
  ('waschmittel', 'laundry-detergent'),
  ('toilettenpapier', 'toilet-paper'),
  ('knoblauch', 'garlic'),
  ('kokosmilch', 'coconut-milk'),
  ('linsen', 'lentils'),
  ('kichererbsen', 'chickpeas'),
  ('spinat', 'spinach'),
  ('peperoni', 'bell-peppers'),
  ('olivenöl', 'olive-oil'),
  ('mozzarella', 'mozzarella'),
  ('zucchetti', 'zucchini'),
  ('aubergine', 'eggplant'),
  ('feta', 'feta'),
  ('oliven', 'olives'),
  ('salat', 'salad-greens'),
  ('thunfisch', 'tuna-canned'),
  ('chips', 'chips'),
  ('hackfleisch', 'beef-minced'),
  ('nüsse', 'nuts'),
  ('tofu', 'tofu'),
  ('hummus', 'hummus'),
  ('champignons', 'mushrooms'),
  ('rüebli', 'carrots'),
  ('bananen', 'bananas'),
  ('äpfel', 'apples'),
  ('müesli', 'muesli'),
  ('quark', 'quark'),
  ('lachs', 'salmon'),
  ('gurken', 'cucumber'),
  ('hafermilch', 'milk-plant'),
  ('pelati', 'tomatoes-canned'),
  ('cervelat', 'sausage'),
  ('ingwer', 'ginger'),
  ('naan', 'naan-bread');

-- Apply productGroupId to all active starter pack items
UPDATE starter_packs
SET items = (
  SELECT jsonb_agg(
    CASE
      WHEN kg.group_id IS NOT NULL
      THEN jsonb_set(
        item - 'productGroupId',
        '{productGroupId}',
        to_jsonb(kg.group_id)
      )
      ELSE item - 'productGroupId'
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(starter_packs.items) WITH ORDINALITY AS t(item, ordinality)
  LEFT JOIN _keyword_to_group kg ON kg.keyword = item->>'keyword'
)
WHERE is_active = true;

DROP TABLE _keyword_to_group;

COMMIT;
