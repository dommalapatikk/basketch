-- Migration 008: Fix remaining product-group misassignments
-- Found by QA tester on 2026-04-11:
-- 1. "Gala 3-eier" pasta in apples (because "gala" is a search keyword for apples)
-- 2. "Granatapfel" yogurt in apples (because "apfel" substring)
-- 3. Baby food / snack bars in apples (because "apfel" substring)
-- 4. Baby food / protein bars / pastries in bananas group
-- 5. Shampoo / biscuits / baby food in milk-plant group (because "hafer" substring)

BEGIN;

-- ============================================================
-- 0. EXTEND EXCLUDE KEYWORDS to prevent recurrence
-- ============================================================

-- Apples: exclude pasta brand "gala 3-eier", "granatapfel" (pomegranate), baby food
UPDATE product_groups SET
  exclude_keywords = COALESCE(exclude_keywords, '{}') || ARRAY['3-eier', 'granatapfel', 'quetschie', 'riegel', 'freche freunde', 'actimel']
WHERE id = 'apples';

-- Bananas: extend excludes for baby food, protein bars, pastries, baby cereals
UPDATE product_groups SET
  exclude_keywords = exclude_keywords || ARRAY['strudel', 'barebells', 'dream', 'babybio', 'quetschbeutel', 'hipp', 'holle', 'milchbrei', 'brei', 'flips', 'banana bread']
WHERE id = 'bananas';

-- Milk-plant: exclude shampoo, biscuits, baby food
UPDATE product_groups SET
  exclude_keywords = COALESCE(exclude_keywords, '{}') || ARRAY['shampoo', 'maske', 'garnier', 'ultra doux', 'biscuit', 'milchbrei', 'brei']
WHERE id = 'milk-plant';

-- ============================================================
-- 1. CLEAR WRONG ASSIGNMENTS for apples group
-- ============================================================

-- Remove Gala 3-eier pasta from apples
UPDATE products SET product_group = NULL
WHERE product_group = 'apples'
  AND LOWER(source_name) LIKE '%3-eier%';

-- Remove Granatapfel products from apples
UPDATE products SET product_group = NULL
WHERE product_group = 'apples'
  AND LOWER(source_name) LIKE '%granatapfel%';

-- Remove baby food / snack bars from apples
UPDATE products SET product_group = NULL
WHERE product_group = 'apples'
  AND (LOWER(source_name) LIKE '%quetschie%'
    OR LOWER(source_name) LIKE '%riegel%'
    OR LOWER(source_name) LIKE '%freche freunde%'
    OR LOWER(source_name) LIKE '%actimel%');

-- ============================================================
-- 2. CLEAR WRONG ASSIGNMENTS for bananas group
-- ============================================================

-- Remove baby food, protein bars, pastries from bananas
UPDATE products SET product_group = NULL
WHERE product_group = 'bananas'
  AND (LOWER(source_name) LIKE '%strudel%'
    OR LOWER(source_name) LIKE '%barebells%'
    OR LOWER(source_name) LIKE '%babybio%'
    OR LOWER(source_name) LIKE '%quetschbeutel%'
    OR LOWER(source_name) LIKE '%hipp%'
    OR LOWER(source_name) LIKE '%holle%'
    OR LOWER(source_name) LIKE '%milchbrei%'
    OR LOWER(source_name) LIKE '%flips%'
    OR LOWER(source_name) LIKE '%banana bread%');

-- ============================================================
-- 3. CLEAR WRONG ASSIGNMENTS for milk-plant group
-- ============================================================

-- Remove shampoo, hair products, biscuits, baby food from milk-plant
UPDATE products SET product_group = NULL
WHERE product_group = 'milk-plant'
  AND (LOWER(source_name) LIKE '%garnier%'
    OR LOWER(source_name) LIKE '%shampoo%'
    OR LOWER(source_name) LIKE '%maske%'
    OR LOWER(source_name) LIKE '%biscuit%'
    OR LOWER(source_name) LIKE '%milchbrei%');

-- ============================================================
-- 4. RE-ASSIGN Gala pasta to pasta-assorted (if group exists)
-- ============================================================

UPDATE products SET product_group = 'pasta-assorted'
WHERE product_group IS NULL
  AND LOWER(source_name) LIKE '%gala 3-eier%';

COMMIT;
