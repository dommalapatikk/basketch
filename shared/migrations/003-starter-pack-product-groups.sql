-- Migration 003: Add productGroupId to starter pack items
-- Maps each starter pack item's keyword to its product_group.id.
-- This enables the exact product-group matching path for imported items.

-- Helper: update a single starter pack by matching keyword -> product group
-- We rebuild the items JSONB array, injecting productGroupId where a match exists.

-- Keyword-to-product-group mapping (covers all starter pack keywords)
CREATE TEMPORARY TABLE _keyword_to_group (keyword TEXT PRIMARY KEY, group_id TEXT NOT NULL);

INSERT INTO _keyword_to_group (keyword, group_id) VALUES
  ('milch', 'milk-whole-1l'),
  ('brot', 'bread-assorted'),
  ('butter', 'butter-250g'),
  ('eier', 'eggs-6pack'),
  ('käse', 'cheese-hard'),
  ('joghurt', 'yogurt-plain'),
  ('poulet', 'chicken-breast'),
  ('tomaten', 'tomatoes-fresh'),
  ('zwiebeln', 'onions'),
  ('kartoffeln', 'potatoes'),
  ('pasta', 'pasta-assorted'),
  ('reis', 'rice-assorted'),
  ('kaffee', 'coffee-assorted'),
  ('schokolade', 'chocolate-assorted'),
  ('waschmittel', 'laundry-detergent'),
  ('toilettenpapier', 'toilet-paper'),
  ('shampoo', 'shampoo'),
  ('knoblauch', 'garlic'),
  ('ingwer', 'ginger'),
  ('kokosmilch', 'coconut-milk'),
  ('linsen', 'lentils'),
  ('kichererbsen', 'chickpeas'),
  ('spinat', 'spinach'),
  ('peperoni', 'bell-peppers'),
  ('naan', 'naan-bread'),
  ('olivenöl', 'olive-oil'),
  ('mozzarella', 'mozzarella'),
  ('zucchetti', 'zucchini'),
  ('aubergine', 'eggplant'),
  ('feta', 'feta'),
  ('oliven', 'olives'),
  ('salat', 'salad-greens'),
  ('thunfisch', 'tuna-canned'),
  ('chips', 'chips'),
  ('zahnpasta', 'toothpaste'),
  ('hackfleisch', 'beef-minced');

-- For each starter pack, update items array to include productGroupId
UPDATE starter_packs
SET items = (
  SELECT jsonb_agg(
    CASE
      WHEN kg.group_id IS NOT NULL
      THEN item || jsonb_build_object('productGroupId', kg.group_id)
      ELSE item
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(starter_packs.items) WITH ORDINALITY AS t(item, ordinality)
  LEFT JOIN _keyword_to_group kg ON kg.keyword = item->>'keyword'
);

DROP TABLE _keyword_to_group;
