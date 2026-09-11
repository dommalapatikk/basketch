-- Component 3 — the fields `Offer` carries that `deals` cannot hold.
--
-- Component 1 produces an `Offer` with three things the table has nowhere to
-- put. Each is currently enforced as a domain invariant and then THROWN AWAY on
-- write, which is worse than not having the rule at all: the code looks careful
-- and the database is not.
--
--   priceBasis    the Lidl Plus flag. LIDL's JSON reports the member price with
--                 no indication that it is one. The adapter cross-checks the PDF
--                 and drops 117 offers a week because of it — then the survivors
--                 are written with no record of the basis at all.
--   CropRegion    {pageImageUrl, x, y, w, h} for Spar/Aldi/Migros flyer crops.
--                 Every one is lost today, so those retailers have no images.
--   Money         integer rappen. The table stores NUMERIC, so every price makes
--                 a float round-trip it does not need to.
--
-- Plus the two the classifier needs, and one the metadata work needs.
--
-- Additive and idempotent. Nothing is dropped; the existing columns keep working.

-- ============================================================
-- 1. UNCERTAINTY — the column that makes decision D3 real
-- ============================================================
-- `deals.category` is NOT NULL, so there is no way to record "we do not know".
-- The old pipeline resolved that by DELETING uncertain products (run.ts:169),
-- which is how tomato purée sat in fresh vegetables for months: nothing was ever
-- visibly unsure, so nothing was ever reviewed.
--
-- The bridge currently holds uncertain products back rather than filing them
-- under a guessed category — a guess would be worse than the bug being fixed.
-- These two columns let the offer be published with its price while its label
-- stays hidden, which is what D3 actually asks for.

ALTER TABLE deals ALTER COLUMN category DROP NOT NULL;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS is_uncertain BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN deals.category IS
  'Nullable since 2026-09-10. NULL means the classifier was not confident; the deal is still shown, without a category label. Never guess a value to fill this.';

COMMENT ON COLUMN deals.is_uncertain IS
  'Review queue. WHERE is_uncertain is the weekly list of products a human should look at.';

CREATE INDEX IF NOT EXISTS deals_uncertain_idx
  ON deals (updated_at DESC) WHERE is_uncertain;

-- ============================================================
-- 2. PRICE BASIS — the LIDL rule, persisted
-- ============================================================
-- A member-only price must always name its programme. Enforced in
-- createOffer(); until now, discarded on write.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS price_basis           TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS loyalty_programme     TEXT;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_price_basis_check;
ALTER TABLE deals ADD CONSTRAINT deals_price_basis_check
  CHECK (price_basis IN ('everyone', 'member-only'));

-- The LIDL rule as a database constraint, not just a domain one: a member price
-- can never be stored without naming its programme, whatever writes the row.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_member_price_names_programme;
ALTER TABLE deals ADD CONSTRAINT deals_member_price_names_programme
  CHECK (price_basis <> 'member-only' OR loyalty_programme IS NOT NULL);

COMMENT ON COLUMN deals.price_basis IS
  'everyone | member-only. Art. 3(1)(e) UWG: a price comparison must be objectively correct, so a Lidl Plus / Supercard / Cumulus price must never render as a normal one.';

-- ============================================================
-- 3. CROP REGION — flyer images without copying photographs
-- ============================================================
-- Art. 2 Abs. 3bis URG protects Swiss product photographs by default. So we
-- store COORDINATES, never pixels: the visitor's browser fetches the flyer page
-- from the retailer and crops it with CSS. The image is never reproduced on
-- basketch infrastructure.
--
-- Fractions (0..1), not pixels, so a crop survives the retailer re-rendering the
-- page at a different resolution.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS page_image_url TEXT,
  ADD COLUMN IF NOT EXISTS crop_x         NUMERIC,
  ADD COLUMN IF NOT EXISTS crop_y         NUMERIC,
  ADD COLUMN IF NOT EXISTS crop_w         NUMERIC,
  ADD COLUMN IF NOT EXISTS crop_h         NUMERIC;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_crop_fractions;
ALTER TABLE deals ADD CONSTRAINT deals_crop_fractions
  CHECK (
    (crop_x IS NULL AND crop_y IS NULL AND crop_w IS NULL AND crop_h IS NULL)
    OR (crop_x BETWEEN 0 AND 1 AND crop_y BETWEEN 0 AND 1
        AND crop_w > 0 AND crop_w <= 1 AND crop_h > 0 AND crop_h <= 1)
  );

-- ProductImage is exactly ONE of SourceUrl or CropRegion — a domain invariant,
-- now also a database one. A row carrying both is a bug that would otherwise
-- render two images.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_one_image_kind;
ALTER TABLE deals ADD CONSTRAINT deals_one_image_kind
  CHECK (NOT (image_url IS NOT NULL AND page_image_url IS NOT NULL));

COMMENT ON COLUMN deals.page_image_url IS
  'Flyer page the crop refers to. The browser fetches it from the retailer; basketch never stores the image (Art. 2 Abs. 3bis URG).';

-- ============================================================
-- 4. MONEY AS INTEGER RAPPEN
-- ============================================================
-- The domain models money as integer rappen precisely to avoid float error.
-- Writing to NUMERIC converts back and forth for no reason. These columns are
-- added alongside the existing ones — both are populated during cutover, and
-- the NUMERIC ones are retired only once the frontend reads the integers.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS sale_price_rappen     INTEGER,
  ADD COLUMN IF NOT EXISTS original_price_rappen INTEGER;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_rappen_positive;
ALTER TABLE deals ADD CONSTRAINT deals_rappen_positive
  CHECK (sale_price_rappen IS NULL OR sale_price_rappen > 0);

-- The ALDI rule, at the database level: no reference price means no discount.
-- Roughly 40 of ALDI's 44 flyer pages print no "statt" price at all, and
-- inventing one to fill the column would publish a fabricated saving.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_aldi_rule;
ALTER TABLE deals ADD CONSTRAINT deals_aldi_rule
  CHECK (original_price_rappen IS NULL OR original_price_rappen > sale_price_rappen);

-- ============================================================
-- 5. ATTRIBUTES — the metadata schema, as data
-- ============================================================
-- Per-category fields: milk fat %, butter salted, wine vintage, detergent wash
-- loads, toilet paper ply count.
--
-- WHY jsonb and not a column each: 22 categories x ~8 attributes is ~180 mostly
-- null columns, and every new attribute a retailer starts publishing would need
-- a migration and a deploy. The SHAPE is still defined and validated — in
-- shared/attribute-schemas.ts, where the agent reads it — and versioned through
-- schema_version in the cache key. Enforcement lives in the domain; storage is
-- flexible.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Makes attributes->>'fatPercent' = '3.5' fast.
CREATE INDEX IF NOT EXISTS deals_attributes_gin ON deals USING GIN (attributes);

COMMENT ON COLUMN deals.attributes IS
  'Per-sub-category metadata, shaped by shared/attribute-schemas.ts. A null field means the value was NOT STATED by the retailer — never that it is unknown-but-guessable. Extract only what is written.';

-- ============================================================
-- 6. STORAGE STATE — a facet, not a category (ADR-001)
-- ============================================================
-- Ice cream is a sweet that is frozen; frozen peas are vegetables that are
-- frozen. Modelling "frozen" as a category puts frozen mango nowhere near fresh
-- mango, so "cheapest mango" silently misses half the answer.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS storage TEXT;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_storage_check;
ALTER TABLE deals ADD CONSTRAINT deals_storage_check
  CHECK (storage IS NULL OR storage IN ('fresh', 'chilled', 'frozen', 'ambient'));

CREATE INDEX IF NOT EXISTS deals_storage_idx ON deals (storage) WHERE storage IS NOT NULL;

COMMENT ON COLUMN deals.storage IS
  'fresh | chilled | frozen | ambient. A FILTER, not a category — see docs/adr-001-category-regroup.md. The "Frozen food" browse tile is a saved filter over this column.';
