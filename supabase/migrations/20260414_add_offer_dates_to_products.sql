-- Migration: Data quality improvements + offer validity dates
-- 1. New product groups (berry splits, cheese varieties, drinks, pizza)
-- 2. Update old berries group
-- 3. Add offer validity date columns to products

-- ============================================================
-- 1. NEW PRODUCT GROUPS
-- ============================================================

-- Split berries into specific fruits
INSERT INTO product_groups (id, label, category, sub_category, search_keywords, exclude_keywords, product_form) VALUES
('strawberries',    'Strawberries',     'fresh', 'fruit',  ARRAY['erdbeeren', 'erdbeere'],                    ARRAY['konfitüre', 'marmelade', 'joghurt', 'müesli', 'drink', 'actimel', 'lc1', 'glacé', 'glace', 'sirup', 'cornet'], 'raw'),
('blueberries',     'Blueberries',      'fresh', 'fruit',  ARRAY['heidelbeeren', 'heidelbeere'],               ARRAY['konfitüre', 'marmelade', 'joghurt', 'müesli', 'drink', 'sirup'], 'raw'),
('raspberries',     'Raspberries',      'fresh', 'fruit',  ARRAY['himbeeren', 'himbeere'],                     ARRAY['konfitüre', 'marmelade', 'joghurt', 'müesli', 'drink', 'sirup'], 'raw')
ON CONFLICT (id) DO NOTHING;

-- Update old berries group to be a catch-all (excludes specific berries)
UPDATE product_groups SET
  search_keywords = ARRAY['beeren'],
  exclude_keywords = ARRAY['konfitüre', 'marmelade', 'joghurt', 'müesli', 'erdbeeren', 'himbeeren', 'heidelbeeren', 'preiselbeeren'],
  label = 'Mixed Berries'
WHERE id = 'berries';

-- Split cheese-hard into specific varieties
INSERT INTO product_groups (id, label, category, sub_category, search_keywords, exclude_keywords, product_form) VALUES
('gruyere',         'Gruyère',          'fresh', 'dairy',  ARRAY['gruyère', 'gruyere'],                        ARRAY['fondue'], 'raw'),
('emmentaler',      'Emmentaler',       'fresh', 'dairy',  ARRAY['emmentaler'],                                ARRAY['fondue'], 'raw'),
('appenzeller',     'Appenzeller',      'fresh', 'dairy',  ARRAY['appenzeller'],                               ARRAY['fondue', 'bärli', 'biber'], 'raw')
ON CONFLICT (id) DO NOTHING;

-- Update cheese-hard to exclude the specific varieties
UPDATE product_groups SET
  search_keywords = ARRAY['käse', 'reibkäse'],
  exclude_keywords = ARRAY['schnitzel', 'cordon', 'fondue', 'gruyère', 'gruyere', 'emmentaler', 'appenzeller']
WHERE id = 'cheese-hard';

-- Wine, beer, water, juice, pizza groups
INSERT INTO product_groups (id, label, category, sub_category, search_keywords, exclude_keywords, product_form) VALUES
('wine-rose',       'Rosé Wine',        'long-life', 'drinks', ARRAY['rosé', 'roséwein'],                      ARRAY['essig', 'creme', 'dusch'], 'processed'),
('beer',            'Beer',             'long-life', 'drinks', ARRAY['bier', 'lager', 'pils', 'feldschlösschen', 'calanda', 'quöllfrisch', 'eichhof', 'cardinal', 'chopfab'], ARRAY['essig', 'bierhefe'], 'processed'),
('mineral-water',   'Mineral Water',    'long-life', 'drinks', ARRAY['mineralwasser', 'henniez', 'valser', 'aproz', 'evian', 'volvic', 'contrex'], ARRAY[]::text[], 'processed'),
('juice',           'Juice',            'long-life', 'drinks', ARRAY['orangensaft', 'apfelsaft', 'multivitamin', 'fruchtsaft', 'nektar'], ARRAY[]::text[], 'processed'),
('frozen-pizza',    'Frozen Pizza',     'long-life', 'frozen', ARRAY['pizza', 'tiefkühlpizza', 'steinofenpizza'], ARRAY['sauce', 'gewürz', 'teig'], 'frozen')
ON CONFLICT (id) DO NOTHING;

-- Update existing wine-red with more grape varieties
UPDATE product_groups SET
  search_keywords = ARRAY['rotwein', 'primitivo', 'merlot', 'cabernet', 'pinot noir', 'tempranillo', 'chianti', 'rioja', 'barolo', 'barbera', 'amarone', 'montepulciano', 'sangiovese']
WHERE id = 'wine-red';

-- Update existing wine-white with more grape varieties
UPDATE product_groups SET
  search_keywords = ARRAY['weisswein', 'chardonnay', 'sauvignon blanc', 'riesling', 'pinot grigio', 'pinot gris', 'prosecco', 'grauburgunder', 'müller-thurgau', 'fendant', 'chasselas', 'aigle']
WHERE id = 'wine-white';

-- ============================================================
-- 2. REASSIGN PRODUCTS FROM OLD BERRIES TO SPECIFIC BERRY GROUPS
-- ============================================================

-- Strawberries
UPDATE products SET product_group = 'strawberries'
WHERE product_group = 'berries'
  AND source_name ~* '\m(erdbeeren?)\M';

-- Blueberries
UPDATE products SET product_group = 'blueberries'
WHERE product_group = 'berries'
  AND source_name ~* '\m(heidelbeeren?)\M';

-- Raspberries
UPDATE products SET product_group = 'raspberries'
WHERE product_group = 'berries'
  AND source_name ~* '\m(himbeeren?)\M';

-- ============================================================
-- 3. REASSIGN CHEESE FROM CHEESE-HARD TO SPECIFIC VARIETIES
-- ============================================================

UPDATE products SET product_group = 'gruyere'
WHERE product_group = 'cheese-hard'
  AND source_name ~* '\m(gruyère|gruyere)\M';

UPDATE products SET product_group = 'emmentaler'
WHERE product_group = 'cheese-hard'
  AND source_name ~* '\memmentaler\M';

UPDATE products SET product_group = 'appenzeller'
WHERE product_group = 'cheese-hard'
  AND source_name ~* '\mappenzeller\M'
  AND source_name !~* '(bärli|biber)';

-- ============================================================
-- 4. ADD OFFER VALIDITY DATE COLUMNS TO PRODUCTS
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS offer_valid_from date,
  ADD COLUMN IF NOT EXISTS offer_valid_to date;

CREATE INDEX IF NOT EXISTS idx_products_offer_valid_to
  ON products (offer_valid_to)
  WHERE offer_valid_to IS NOT NULL;

COMMENT ON COLUMN products.offer_valid_from IS 'Start date of the current/latest deal offer';
COMMENT ON COLUMN products.offer_valid_to IS 'End date of the current/latest deal offer';

-- Backfill offer dates from existing deals
UPDATE products p SET
  offer_valid_from = d.valid_from::date,
  offer_valid_to = d.valid_to::date
FROM (
  SELECT DISTINCT ON (product_id)
    product_id, valid_from, valid_to
  FROM deals
  WHERE product_id IS NOT NULL AND is_active = true
  ORDER BY product_id, valid_from DESC
) d
WHERE p.id = d.product_id;
