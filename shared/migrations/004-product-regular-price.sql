-- Migration 004: Add regular (shelf) price to products table
-- Enables price comparison even when no deal/promotion exists.

ALTER TABLE products
  ADD COLUMN regular_price NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN price_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Index for quick lookup of products with prices
CREATE INDEX idx_products_has_price ON products (store, product_group)
  WHERE regular_price IS NOT NULL;

COMMENT ON COLUMN products.regular_price IS 'Current regular shelf price (not promotion). Updated weekly by pipeline.';
COMMENT ON COLUMN products.price_updated_at IS 'When regular_price was last updated from the store API.';
