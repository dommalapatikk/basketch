# Architecture Plan: Multi-Store Expansion (9 Stores)

**Status:** Draft — awaiting builder assignment
**Author:** Architect agent
**Date:** 2026-04-14
**Scope:** Expand from 2 hardcoded stores (Migros + Coop) to 9 stores via a unified aktionis.ch scraper

---

## Overview

basketch currently compares two stores: Migros (fetched via `migros-api-wrapper`) and Coop (scraped from aktionis.ch). The target state adds 8 more stores — all of which publish on aktionis.ch — and replaces the hardcoded 2-column design with an N-store architecture where each item shows a "best deal" badge and the split list groups by whichever store wins.

The Migros API integration will be archived (not deleted). All 9 stores will be scraped from aktionis.ch using a single parameterized scraper.

**Target stores and their aktionis.ch slugs:**

| Store | aktionis.ch slug | Brand color (bg) | Brand color (text) |
|-------|-----------------|------------------|--------------------|
| Coop | `coop` | `#007a3d` | `#006030` |
| Coop Megastore | `coop-megastore` | `#007a3d` | `#006030` |
| Migros | `migros` | `#e65100` | `#c54400` |
| LIDL | `lidl` | `#0050aa` | `#003d82` |
| ALDI | `aldi` | `#00529b` | `#003d73` |
| Denner | `denner` | `#e3000b` | `#b0000a` |
| SPAR | `spar` | `#007a3d` | `#005a2d` |
| OTTO'S | `ottos` | `#e2001a` | `#a80014` |
| Volg | `volg` | `#e30613` | `#aa0010` |

**Note:** The aktionis.ch URL slug for each store must be verified against the live site before implementation. The slugs above are based on current knowledge of the site structure. Run `curl -s https://aktionis.ch/ | grep -oP 'vendors/[a-z-]+' | sort -u` in CI to confirm them before the builder starts.

---

## Change Summary by Layer

| Layer | Scope | Risk |
|-------|-------|------|
| `shared/types.ts` | Expand `Store` union; generalize comparison types | Medium — many downstream consumers |
| `pipeline/aktionis/` | Rename + parameterize scraper | Low — isolated Python module |
| `pipeline/migros/` | Move to `pipeline/archive/migros/` | Low — only used by `run.ts` |
| `pipeline/run.ts` | Dynamic file discovery; N-store product resolution | Medium — core orchestration |
| `pipeline/store.ts` | `logPipelineRun` signature change | Low |
| Database | Migration: expand CHECK constraints; restructure `pipeline_runs` | High — live data |
| `web/src/lib/matching.ts` | N-store `matchFavorites`; best-price logic | High — core matching |
| `web/src/lib/queries.ts` | Remove store-specific fields; generic store queries | Medium |
| `web/src/pages/DealsPage.tsx` | Dynamic store tabs replacing 2-column layout | Medium |
| `web/src/pages/ComparisonPage.tsx` | N-store summary; best-deal display | Medium |
| `web/src/components/SplitList.tsx` | Group by N stores | Medium |
| `web/src/components/CompareCard.tsx` | Best-price badge; store badge | Low |
| `.github/workflows/pipeline.yml` | Matrix fetch jobs; unified process step | Low |
| `.github/workflows/ci.yml` | Update Python test path | Low |

---

## 1. Type System — `shared/types.ts`

### 1a. Expand `Store` union

**Line 9, current:**
```ts
export type Store = 'migros' | 'coop'
```

**Replace with:**
```ts
export type Store =
  | 'migros'
  | 'coop'
  | 'coop-megastore'
  | 'lidl'
  | 'aldi'
  | 'denner'
  | 'spar'
  | 'ottos'
  | 'volg'
```

### 1b. Add `STORE_META` constant

Add after the `Store` type definition. This replaces scattered color strings in components:

```ts
export interface StoreMeta {
  slug: Store
  label: string
  aktionisSlug: string       // URL slug on aktionis.ch
  colorBg: string            // Tailwind class for background
  colorText: string          // Tailwind class for text (WCAG AA on white)
  colorLight: string         // Tailwind class for light background tint
}

export const STORE_META: Record<Store, StoreMeta> = {
  'migros':        { slug: 'migros',        label: 'Migros',         aktionisSlug: 'migros',        colorBg: 'bg-migros',         colorText: 'text-migros-text',         colorLight: 'bg-migros-light' },
  'coop':          { slug: 'coop',          label: 'Coop',           aktionisSlug: 'coop',          colorBg: 'bg-coop',           colorText: 'text-coop-text',           colorLight: 'bg-coop-light' },
  'coop-megastore':{ slug: 'coop-megastore',label: 'Coop Megastore', aktionisSlug: 'coop-megastore',colorBg: 'bg-coop',           colorText: 'text-coop-text',           colorLight: 'bg-coop-light' },
  'lidl':          { slug: 'lidl',          label: 'LIDL',           aktionisSlug: 'lidl',          colorBg: 'bg-lidl',           colorText: 'text-lidl-text',           colorLight: 'bg-lidl-light' },
  'aldi':          { slug: 'aldi',          label: 'ALDI',           aktionisSlug: 'aldi',          colorBg: 'bg-aldi',           colorText: 'text-aldi-text',           colorLight: 'bg-aldi-light' },
  'denner':        { slug: 'denner',        label: 'Denner',         aktionisSlug: 'denner',        colorBg: 'bg-denner',         colorText: 'text-denner-text',         colorLight: 'bg-denner-light' },
  'spar':          { slug: 'spar',          label: 'SPAR',           aktionisSlug: 'spar',          colorBg: 'bg-spar',           colorText: 'text-spar-text',           colorLight: 'bg-spar-light' },
  'ottos':         { slug: 'ottos',         label: "OTTO'S",         aktionisSlug: 'ottos',         colorBg: 'bg-ottos',          colorText: 'text-ottos-text',          colorLight: 'bg-ottos-light' },
  'volg':          { slug: 'volg',          label: 'Volg',           aktionisSlug: 'volg',          colorBg: 'bg-volg',           colorText: 'text-volg-text',           colorLight: 'bg-volg-light' },
}

export const ALL_STORES = Object.keys(STORE_META) as Store[]
```

The Tailwind color classes (`bg-lidl`, `text-lidl-text`, etc.) must be added to `web/tailwind.config.js` for each new store, following the same pattern as `migros` and `coop`.

### 1c. Replace `FavoriteComparison` — store-generic

**Lines 524–532, current:**
```ts
export interface FavoriteComparison {
  favorite: BasketItem
  migrosDeal: DealRow | null
  coopDeal: DealRow | null
  migrosRegularPrice: RegularPrice | null
  coopRegularPrice: RegularPrice | null
  coopProductKnown: boolean
  recommendation: 'migros' | 'coop' | 'both' | 'none'
}
```

**Replace with:**
```ts
export interface StoreMatch {
  deal: DealRow | null
  regularPrice: RegularPrice | null
  productKnown: boolean   // true if product is in DB even without a current deal
}

export interface FavoriteComparison {
  favorite: BasketItem
  stores: Partial<Record<Store, StoreMatch>>
  bestStore: Store | 'tie' | 'none'   // store with the best deal this week
  bestDeal: DealRow | null             // the actual best deal row
}
```

**Migration note:** `CompareCard`, `SplitList`, `ComparisonPage`, `matching.ts`, and `matching.test.ts` all reference the old field names (`migrosDeal`, `coopDeal`, `migrosRegularPrice`, `coopRegularPrice`, `coopProductKnown`, `recommendation`). Every reference must be updated as part of this change.

### 1d. Replace `DealComparison` — store-generic

**Lines 537–545, current:**
```ts
export interface DealComparison {
  id: string
  label: string
  matchType: 'product-group' | 'name-similarity'
  category: Category | null
  migrosDeal: DealRow | null
  coopDeal: DealRow | null
  recommendation: 'migros' | 'coop' | 'both'
}
```

**Replace with:**
```ts
export interface DealComparison {
  id: string
  label: string
  matchType: 'product-group' | 'name-similarity'
  category: Category | null
  storeDeals: Partial<Record<Store, DealRow>>   // best deal per store for this item
  bestStore: Store | 'tie'
}
```

### 1e. Replace `DealComparisonResult` — store-generic

**Lines 550–554, current:**
```ts
export interface DealComparisonResult {
  matched: DealComparison[]
  unmatchedMigros: DealRow[]
  unmatchedCoop: DealRow[]
}
```

**Replace with:**
```ts
export interface DealComparisonResult {
  matched: DealComparison[]
  unmatched: DealRow[]   // deals not matched to any other store
}
```

### 1f. Replace `PipelineRun` — store-generic

**Lines 267–277, current:**
```ts
export interface PipelineRun {
  id: string
  run_at: string
  migros_status: 'success' | 'failed' | 'skipped'
  migros_count: number
  coop_status: 'success' | 'failed' | 'skipped'
  coop_count: number
  total_stored: number
  duration_ms: number
  error_log: string | null
}
```

**Replace with:**
```ts
export type PipelineStoreStatus = 'success' | 'failed' | 'skipped'

export interface PipelineRun {
  id: string
  run_at: string
  store_results: Partial<Record<Store, { status: PipelineStoreStatus; count: number }>>
  total_stored: number
  duration_ms: number
  error_log: string | null
}
```

**Note:** `store_results` maps to a JSONB column in Supabase. See database migration section.

### 1g. Replace `CategoryVerdict` and `WeeklyVerdict` — store-generic

**Lines 286–305.** The verdict system currently hardcodes `migrosScore`, `coopScore`, etc. These become store maps:

```ts
export interface CategoryVerdict {
  category: Category
  winner: Store | 'tie'
  scores: Partial<Record<Store, number>>      // 0-100 per store
  dealCounts: Partial<Record<Store, number>>
  avgDiscounts: Partial<Record<Store, number>>
}

export interface WeeklyVerdict {
  weekOf: string
  categories: CategoryVerdict[]
  dataFreshness: 'current' | 'stale' | 'partial'
  lastUpdated: string
}
```

**Note:** `verdict.ts` and `VerdictCard.tsx` and `VerdictBanner.tsx` consume these types and must be updated alongside the type change.

### 1h. Replace `SearchResult` — store-generic

**Lines 559–568.** The `migrosDeal`, `coopDeal`, `migrosRegularPrice`, `coopRegularPrice` fields become maps:

```ts
export interface SearchResult {
  productGroup: ProductGroupRow | null
  storeDeals: Partial<Record<Store, DealRow>>
  regularPrices: Partial<Record<Store, number>>
  label: string
  category: Category
  relevance: number
}
```

**Files consuming `SearchResult`:** `queries.ts` (lines 535–628), `ProductSearch.tsx`.

### 1i. Update `RegularPrice`

**Lines 513–518.** The `store` field is already typed as `Store`, so this only needs the union expanded — no structural change needed.

---

## 2. Scraper — `pipeline/aktionis/`

### 2a. Rename directory

Move `pipeline/coop/` to `pipeline/aktionis/`. Git rename (not copy):

```
git mv pipeline/coop pipeline/aktionis
```

Internal file names stay the same (`fetch.py`, `normalize.py`, `main.py`, `requirements.txt`, `test_fetch.py`).

### 2b. Parameterize `fetch.py`

**Current `pipeline/coop/fetch.py` line 17:**
```python
BASE_URL = "https://aktionis.ch/vendors/coop"
```

The new scraper accepts any store slug. Replace the module-level constant and function signature:

```python
# pipeline/aktionis/fetch.py

AKTIONIS_BASE = "https://aktionis.ch/vendors"
MAX_PAGES = 20
REQUEST_TIMEOUT = 15

def fetch_store_deals(store_slug: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """Fetch all deals for a given aktionis.ch store slug.

    Args:
        store_slug: aktionis.ch path segment, e.g. 'coop', 'lidl', 'migros'

    Returns list of dicts matching UnifiedDeal shape (camelCase keys).
    Never raises — catches and logs errors, returns empty list.
    """
    base_url = f"{AKTIONIS_BASE}/{store_slug}"
    # ... pagination logic unchanged, using base_url instead of BASE_URL
```

Keep `fetch_coop_deals()` as a thin alias for backward compatibility during transition:

```python
def fetch_coop_deals(max_pages: int = MAX_PAGES) -> list[dict]:
    """Deprecated alias. Use fetch_store_deals('coop') instead."""
    return fetch_store_deals('coop', max_pages)
```

### 2c. Parameterize `normalize.py`

**Current `pipeline/coop/normalize.py` line 175:**
```python
return {
    "store": "coop",
    ...
}
```

The store value must come from the caller, not be hardcoded:

```python
def normalize_aktionis_deal(raw_data: dict, store_slug: str) -> dict | None:
    """Map extracted card data to UnifiedDeal shape. store_slug becomes the store field."""
    ...
    return {
        "store": store_slug,
        "productName": normalize_product_name(name),
        ...
    }
```

Keep `normalize_coop_deal()` as a backward-compat alias:

```python
def normalize_coop_deal(raw_data: dict) -> dict | None:
    return normalize_aktionis_deal(raw_data, "coop")
```

### 2d. Parameterize `main.py` — CLI argument

**Current `pipeline/coop/main.py` lines 11–47:**

The entry point accepts an output file path as `sys.argv[1]`. Extend to accept store slug as `sys.argv[1]` and optional output path as `sys.argv[2]`:

```python
# pipeline/aktionis/main.py

def main() -> int:
    """Run the aktionis.ch scraper for a specific store.

    Usage:
        python main.py <store-slug>                     # writes JSON to stdout
        python main.py <store-slug> <output-path.json>  # writes JSON to file

    Examples:
        python main.py coop coop-deals.json
        python main.py lidl lidl-deals.json
        python main.py migros migros-deals.json
    """
    if len(sys.argv) < 2:
        print("[aktionis] [FATAL] Usage: python main.py <store-slug> [output.json]", file=sys.stderr)
        return 1

    store_slug = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    deals = fetch_store_deals(store_slug)
    # ... write logic unchanged
```

### 2e. Output file naming convention

Output file per store: `{store-slug}-deals.json`

Examples:
- `coop-deals.json`
- `lidl-deals.json`
- `migros-deals.json` (from aktionis, not the Migros API)
- `coop-megastore-deals.json`

### 2f. Update `test_fetch.py`

Rename test file to `test_aktionis.py`. Update imports and test function names. Add parametrized tests for multiple store slugs using `pytest.mark.parametrize`. Fixture files in `pipeline/aktionis/fixtures/` should cover at least `coop` and `lidl` card HTML.

---

## 3. Archive Migros API scraper

Move the Migros API integration out of active pipeline:

```
git mv pipeline/migros pipeline/archive/migros
```

This includes:
- `pipeline/migros/fetch.ts`
- `pipeline/migros/fetch-prices.ts`
- `pipeline/migros/normalize.ts`
- `pipeline/migros/normalize.test.ts`
- `pipeline/migros/fetch-integration.test.ts`
- `pipeline/migros/fixtures/`

Add a `README.md` inside `pipeline/archive/migros/` documenting why it was archived and when.

**Remove from `pipeline/run.ts`:**
- Line 14: `import { fetchMigrosRegularPrices } from './migros/fetch-prices'`
- Lines 145–146: the `fetchMigrosRegularPrices()` call and log

**Impact on `product-resolve.ts`:** None. Product resolution is already store-generic — it accepts any `Store` value and never imports from `pipeline/migros/`.

---

## 4. Pipeline Runner — `pipeline/run.ts`

This is the most significant pipeline change. The current file (183 lines) has Migros-specific logic baked in at multiple points.

### 4a. Dynamic deal file discovery

**Current lines 56–60** — hardcoded to two files:
```ts
const migrosRaw = readDealsFile('migros-deals.json')
let coopRaw = readDealsFile('coop-deals.json')
if (coopRaw.length === 0) {
  coopRaw = readDealsFile('coop/coop-deals.json')
}
```

**Replace with** a glob-based discovery that reads all `*-deals.json` files present in the working directory:

```ts
import { globSync } from 'node:fs'   // Node 22+; use glob package for Node 20

function discoverDealFiles(): string[] {
  // Finds all *-deals.json files in pipeline/ directory
  // CI downloads each artifact to pipeline/ so files will be: coop-deals.json, lidl-deals.json, etc.
  return globSync('*-deals.json', { cwd: process.cwd() })
}

function loadAllDeals(): Map<Store, UnifiedDeal[]> {
  const files = discoverDealFiles()
  const result = new Map<Store, UnifiedDeal[]>()

  for (const filename of files) {
    // Derive store slug from filename: "coop-deals.json" -> "coop"
    const slug = filename.replace(/-deals\.json$/, '') as Store
    if (!ALL_STORES.includes(slug)) {
      console.warn(`[pipeline] [WARN] Unrecognized store slug in filename: ${filename}`)
      continue
    }
    const deals = readDealsFile(filename)
    if (deals.length > 0) {
      result.set(slug, deals)
    }
  }

  return result
}
```

### 4b. N-store product resolution

**Current lines 105–122** — resolves migros and coop in parallel, merges into one map:
```ts
const migrosDeals = categorized.filter((d) => d.store === 'migros')
const coopDeals = categorized.filter((d) => d.store === 'coop')
const [migrosProducts, coopProducts] = await Promise.all([
  resolveProducts(migrosDeals, 'migros'),
  resolveProducts(coopDeals, 'coop'),
])
```

**Replace with** a generic loop over all stores present in the data:

```ts
// Group categorized deals by store
const dealsByStore = new Map<Store, Deal[]>()
for (const deal of categorized) {
  const arr = dealsByStore.get(deal.store) ?? []
  arr.push(deal)
  dealsByStore.set(deal.store, arr)
}

// Resolve products for all stores in parallel
const resolutionEntries = await Promise.all(
  [...dealsByStore.entries()].map(async ([store, storeDeals]) => {
    const resolved = await resolveProducts(storeDeals, store)
    return [store, resolved] as const
  })
)

// Merge all store product ID maps
const productIds = new Map<string, string>()
for (const [store, resolved] of resolutionEntries) {
  for (const [name, r] of resolved) {
    productIds.set(productLookupKey(store, name), r.productId)
  }
}
```

### 4c. Generic per-store logging

**Current lines 62–63 and 70–71** — store-specific status strings:
```ts
const migrosStatus = migrosRaw.length > 0 ? 'success' : 'failed'
const coopStatus = coopRaw.length > 0 ? 'success' : 'failed'
console.log(`[pipeline] [INFO] Read ${migrosRaw.length} Migros deals, ${coopRaw.length} Coop deals`)
```

**Replace with:**
```ts
const storeStatuses = new Map<Store, { status: PipelineStoreStatus; count: number }>()
for (const [store, deals] of allDealsByStore) {
  storeStatuses.set(store, {
    status: deals.length > 0 ? 'success' : 'failed',
    count: deals.length,
  })
}

// Log summary
for (const [store, { status, count }] of storeStatuses) {
  console.log(`[pipeline] [INFO] ${store}: ${count} deals (${status})`)
}
```

### 4d. Update `logPipelineRun` call

**Current lines 159–167:**
```ts
await logPipelineRun({
  migros_status: ...,
  migros_count: ...,
  coop_status: ...,
  coop_count: ...,
  total_stored: storedCount,
  duration_ms: durationMs,
  error_log: ...,
})
```

**Replace with:**
```ts
await logPipelineRun({
  store_results: Object.fromEntries(storeStatuses),
  total_stored: storedCount,
  duration_ms: durationMs,
  error_log: errors.length > 0 ? errors.join('; ') : null,
})
```

### 4e. Remove `fetchMigrosRegularPrices`

Remove the import on line 14 and the call on lines 145–146. Regular prices for non-Migros stores are not fetched for now — this is an acceptable MVP constraint.

---

## 5. Database Migration

This is the highest-risk change. Execute against the live Supabase instance via the SQL editor. Back up the current data before running.

### 5a. Migration file

Create `docs/supabase-migration-multi-store.sql`. Never modify the original `docs/supabase-setup.sql`.

### 5b. `deals` table — expand store CHECK constraint

**Current constraint (from `supabase-setup.sql`):**
```sql
store TEXT NOT NULL CHECK (store IN ('migros', 'coop'))
```

**New:**
```sql
ALTER TABLE deals
  DROP CONSTRAINT IF EXISTS deals_store_check;

ALTER TABLE deals
  ADD CONSTRAINT deals_store_check
  CHECK (store IN ('migros', 'coop', 'coop-megastore', 'lidl', 'aldi', 'denner', 'spar', 'ottos', 'volg'));
```

### 5c. `products` table — expand store CHECK constraint

Same pattern as deals:

```sql
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_store_check;

ALTER TABLE products
  ADD CONSTRAINT products_store_check
  CHECK (store IN ('migros', 'coop', 'coop-megastore', 'lidl', 'aldi', 'denner', 'spar', 'ottos', 'volg'));
```

### 5d. `pipeline_runs` table — replace store-specific columns with JSONB

**Current columns (from `supabase-setup.sql`):**
```sql
migros_status TEXT NOT NULL CHECK (migros_status IN ('success', 'failed', 'skipped')),
migros_count  INTEGER NOT NULL DEFAULT 0,
coop_status   TEXT NOT NULL CHECK (coop_status IN ('success', 'failed', 'skipped')),
coop_count    INTEGER NOT NULL DEFAULT 0,
```

**Migration:**
```sql
-- Add new generic column
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS store_results JSONB DEFAULT '{}'::jsonb;

-- Migrate existing rows: pack old columns into JSONB
UPDATE pipeline_runs
SET store_results = jsonb_build_object(
  'migros', jsonb_build_object('status', migros_status, 'count', migros_count),
  'coop',   jsonb_build_object('status', coop_status,   'count', coop_count)
)
WHERE store_results = '{}'::jsonb OR store_results IS NULL;

-- Drop old columns (only after verifying migration above)
ALTER TABLE pipeline_runs
  DROP COLUMN IF EXISTS migros_status,
  DROP COLUMN IF EXISTS migros_count,
  DROP COLUMN IF EXISTS coop_status,
  DROP COLUMN IF EXISTS coop_count;
```

**Rollback plan:** Before running the DROP, confirm row count matches expectation:
```sql
SELECT COUNT(*) FROM pipeline_runs WHERE store_results != '{}'::jsonb;
```

### 5e. RLS policies

No RLS policy changes needed. The policies are on row identity, not store values.

### 5f. `pipeline_runs` TypeScript type alignment

After the DB migration, `store.ts`'s `logPipelineRun` must accept the new `PipelineRun` shape. The Supabase client will serialize `store_results` as JSONB automatically when passing a plain JS object.

---

## 6. Frontend

### 6a. Tailwind — add new store colors

In `web/tailwind.config.js`, extend the `colors` and `backgroundColor` sections. Following the existing Migros/Coop pattern:

```js
// web/tailwind.config.js (extend existing colors object)
lidl:   { DEFAULT: '#0050aa', text: '#003d82', light: '#e6f0ff' },
aldi:   { DEFAULT: '#00529b', text: '#003d73', light: '#e6f0f9' },
denner: { DEFAULT: '#e3000b', text: '#b0000a', light: '#fce6e7' },
spar:   { DEFAULT: '#007a3d', text: '#005a2d', light: '#e6f4ec' },
ottos:  { DEFAULT: '#e2001a', text: '#a80014', light: '#fce6ea' },
volg:   { DEFAULT: '#e30613', text: '#aa0010', light: '#fce6e8' },
```

Verify each color meets WCAG AA (4.5:1 contrast ratio) for text on white before shipping. The `*-text` variants are the accessible text colors; the `DEFAULT` variants are background-only.

### 6b. `web/src/lib/matching.ts` — N-store `matchFavorites`

**Current signature (line 324):**
```ts
export function matchFavorites(
  favorites: (FavoriteItemRow | BasketItem)[],
  deals: DealRow[],
  products?: ProductRow[],
): FavoriteComparison[]
```

**New signature and logic:**

```ts
export function matchFavorites(
  favorites: (FavoriteItemRow | BasketItem)[],
  deals: DealRow[],
  products?: ProductRow[],
  activeStores?: Store[],   // which stores to include; defaults to ALL_STORES
): FavoriteComparison[]
```

Internal changes:

1. **Remove** the hardcoded `migrosDeals` / `coopDeals` split (lines 329–330). Instead, group deals by store dynamically:
   ```ts
   const stores = activeStores ?? ALL_STORES
   const dealsByStore = new Map<Store, DealRow[]>()
   for (const store of stores) {
     dealsByStore.set(store, deals.filter((d) => d.store === store))
   }
   ```

2. **Replace** the per-item matching block (lines 335–371) to iterate over all stores:
   ```ts
   const storeMatches: Partial<Record<Store, StoreMatch>> = {}
   for (const store of stores) {
     const storeDeals = dealsByStore.get(store) ?? []
     let deal: DealRow | null = null
     if (item.productGroupId && products?.length) {
       deal = findBestMatchByProductGroup(item.productGroupId, storeDeals, products)
     } else {
       deal = findBestMatch(item.keyword, storeDeals, matchOptions)
     }
     const regularPrice = item.productGroupId && products?.length
       ? findRegularPrice(item.productGroupId, store, products)
       : null
     storeMatches[store] = {
       deal,
       regularPrice,
       productKnown: deal === null && regularPrice !== null,
     }
   }
   ```

3. **Add** a `findBestStore` helper:
   ```ts
   function findBestStore(
     storeMatches: Partial<Record<Store, StoreMatch>>,
   ): { bestStore: Store | 'tie' | 'none'; bestDeal: DealRow | null } {
     // Priority: store with deal → compare by discount → tiebreak by sale_price
     const storesWithDeals = Object.entries(storeMatches)
       .filter(([, m]) => m?.deal != null)
       .map(([s, m]) => ({ store: s as Store, deal: m!.deal! }))

     if (storesWithDeals.length === 0) {
       // Fall back to regular prices
       const storesWithPrices = Object.entries(storeMatches)
         .filter(([, m]) => m?.regularPrice != null)
         .map(([s, m]) => ({ store: s as Store, price: m!.regularPrice!.price }))
       if (storesWithPrices.length === 0) return { bestStore: 'none', bestDeal: null }
       storesWithPrices.sort((a, b) => a.price - b.price)
       const cheapest = storesWithPrices[0]!
       const isTie = storesWithPrices.filter((s) => s.price === cheapest.price).length > 1
       return { bestStore: isTie ? 'tie' : cheapest.store, bestDeal: null }
     }

     storesWithDeals.sort((a, b) => {
       const discountDiff = (b.deal.discount_percent ?? 0) - (a.deal.discount_percent ?? 0)
       if (discountDiff !== 0) return discountDiff
       return a.deal.sale_price - b.deal.sale_price
     })
     const best = storesWithDeals[0]!
     const isTie = storesWithDeals.filter(
       (s) => s.deal.discount_percent === best.deal.discount_percent &&
              s.deal.sale_price === best.deal.sale_price
     ).length > 1
     return {
       bestStore: isTie ? 'tie' : best.store,
       bestDeal: best.deal,
     }
   }
   ```

4. **Update** `splitShoppingList` (lines 549–578). Replace the hardcoded `migros`/`coop`/`both`/`none` buckets with a dynamic store map:
   ```ts
   export function splitShoppingList(
     comparisons: FavoriteComparison[],
     stores: Store[],
   ): {
     byStore: Map<Store, FavoriteComparison[]>
     tie: FavoriteComparison[]
     none: FavoriteComparison[]
   } {
     const byStore = new Map<Store, FavoriteComparison[]>()
     for (const store of stores) byStore.set(store, [])
     const tie: FavoriteComparison[] = []
     const none: FavoriteComparison[] = []

     for (const comp of comparisons) {
       if (comp.bestStore === 'none') {
         none.push(comp)
       } else if (comp.bestStore === 'tie') {
         tie.push(comp)
       } else {
         byStore.get(comp.bestStore)?.push(comp)
       }
     }
     return { byStore, tie, none }
   }
   ```

5. **Update** `buildDealComparisons` (lines 386–543). The function currently builds `migrosGroupDeals` and `coopGroupDeals` maps — generalize to `storeGroupDeals: Map<Store, Map<string, DealRow[]>>`. The matching logic is otherwise unchanged.

### 6c. `web/src/lib/queries.ts` — remove hardcoded store fields

1. **`findBestDeal` (lines 457–481):** Function already accepts `store: Store` — no change to signature, but it remains useful for targeted lookups.

2. **`searchProducts` (lines 494–633):** Lines 572–585 hardcode `migrosDeal` / `coopDeal`:
   ```ts
   results.push({
     productGroup: group,
     migrosDeal: product.store === 'migros' ? deal : null,
     coopDeal: product.store === 'coop' ? deal : null,
     migrosRegularPrice: ...,
     coopRegularPrice: ...,
   ```
   Replace with the new `SearchResult` shape using `storeDeals` and `regularPrices` maps.

3. **`fetchLatestPipelineRun` (lines 366–379):** Return type changes to the new `PipelineRun` interface — the query itself is unchanged.

### 6d. `web/src/pages/DealsPage.tsx` — dynamic store tabs

**Current design (lines 382–399):** A fixed 2-column grid with one section per store.

**New design:** A scrollable horizontal store tab bar above the deal list. Selecting a tab shows that store's deals in a single-column list (or side-by-side if exactly 2 stores are selected).

Changes to `DealsPage.tsx`:

1. **Remove** the `StoreDealSection` component's hardcoded `store: 'migros' | 'coop'` prop (line 33). Make it accept `store: Store`.

2. **Remove** the hardcoded `filteredDeals.migros` / `filteredDeals.coop` split (lines 196–199):
   ```ts
   // Current:
   return {
     migros: filtered.filter((d) => d.store === 'migros'),
     coop: filtered.filter((d) => d.store === 'coop'),
   }
   // Replace with:
   const result = new Map<Store, DealRow[]>()
   for (const store of activeStores) {
     result.set(store, filtered.filter((d) => d.store === store))
   }
   return result
   ```

3. **Add** a store filter tab bar. Users can view all stores or filter to one. Default: all stores visible.

4. **Update** the 2-column grid (line 383 `md:grid-cols-2`) to render a `StoreDealSection` for each store present in the filtered data, inside a responsive grid that caps at 2 columns on desktop but stacks on mobile.

5. **Update** `StoreDealSection` header color (lines 41–42):
   ```ts
   // Current:
   const headerColor = store === 'migros' ? 'text-migros-text' : 'text-coop-text'
   // Replace with:
   const meta = STORE_META[store]
   const headerColor = meta.colorText
   ```

### 6e. `web/src/pages/ComparisonPage.tsx` — N-store summary

**Current (lines 108–130):** Hardcoded `migrosItems`, `coopItems`, `onSaleMigros`, `onSaleCoop`, `migrosTotal`, `coopTotal`.

**New approach:**

1. **Replace** the `migrosItems` / `coopItems` derivation with a generic store map computed from `splitShoppingList`:
   ```ts
   const { byStore, tie, none } = useMemo(() =>
     splitShoppingList(comparisons, presentStores),
     [comparisons, presentStores]
   )
   ```

2. **Replace** the 2-column summary grid (lines 203–215) with a dynamic grid where each cell is one store. Use `grid-cols-2` for 2 stores, `grid-cols-3` for 3, etc. — cap at `grid-cols-2` on mobile regardless.

3. **Remove** the hardcoded `onSaleMigros` / `onSaleCoop` count display (lines 155–165). Replace with a generic list of `{count} at {storeName}` strings derived from `storeStatuses`.

4. **Update** the "Coop transparency label" (lines 188–190). The existing note about Coop not tracking all products extends to all new stores — change to a generic "Some stores may not list all products" note, only shown when any store has items with `productKnown = false`.

### 6f. `web/src/components/SplitList.tsx` — N-store sections

**Current (lines 15–66):** Hardcoded sections for Migros, Coop, Either, No Deals.

**New:**

```tsx
export function SplitList(props: {
  comparisons: FavoriteComparison[]
  stores: Store[]
}) {
  const { byStore, tie, none } = splitShoppingList(props.comparisons, props.stores)

  return (
    <div>
      {props.stores.map((store) => {
        const items = byStore.get(store) ?? []
        if (items.length === 0) return null
        const meta = STORE_META[store]
        return (
          <section key={store}>
            <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
              <span className={`size-3 rounded-full ${meta.colorBg}`} />
              Buy at {meta.label} ({items.length})
            </h2>
            {items.map((c) => <CompareCard key={c.favorite.id} comparison={c} />)}
          </section>
        )
      })}

      {tie.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-success" />
            Same deal at multiple stores ({tie.length})
          </h2>
          {tie.map((c) => <CompareCard key={c.favorite.id} comparison={c} />)}
        </section>
      )}

      {none.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-muted" />
            No price data ({none.length})
          </h2>
          {/* same collapsed list as current */}
        </section>
      )}
    </div>
  )
}
```

Pass `stores` down from `ComparisonPage` — derive it from `Object.keys(STORE_META)` filtered to stores that have at least one active deal in the current run.

### 6g. `web/src/components/CompareCard.tsx` — best-price badge

The card currently shows Migros vs Coop side by side. With N stores, it shows:

- The **best deal** prominently (store badge + sale price + discount %)
- A collapsed "also on sale at" list for secondary stores
- Regular price fallback if no deals exist

The `comparison` prop changes from the old `FavoriteComparison` shape to the new one. Key changes:

1. Use `comparison.bestDeal` and `STORE_META[comparison.bestStore]` for the primary display.
2. Secondary deals: iterate `comparison.stores` entries where `deal !== null` and `store !== bestStore`.
3. Replace the current hardcoded Migros/Coop color references with `STORE_META[store].colorBg` etc.

### 6h. `web/src/lib/verdict.ts` — N-store verdict

The verdict system (`verdict.ts`, `VerdictBanner.tsx`, `VerdictCard.tsx`) computes weekly winners. Currently hardcoded to Migros vs Coop.

The scope of the verdict system for this release is **deferred**. The existing 2-store verdict logic can remain functional for now — it reads `DealRow[]` and filters by store, so it will naturally show only Migros and Coop deals in the verdict even when other stores are in the DB.

A proper N-store verdict (ranking all 9 stores by category) is a follow-on feature. The `CategoryVerdict` and `WeeklyVerdict` type changes in section 1g should still be made to avoid a second migration, but the verdict UI can continue showing only the top 2 stores for this release.

---

## 7. CI — `.github/workflows/pipeline.yml`

### 7a. Matrix strategy for store fetching

Replace the two separate `fetch-migros` and `fetch-coop` jobs with a single matrix job:

```yaml
fetch-store:
  name: Fetch ${{ matrix.store }} Deals
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false   # one store failing must not cancel others
    matrix:
      store:
        - coop
        - coop-megastore
        - migros
        - lidl
        - aldi
        - denner
        - spar
        - ottos
        - volg
  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-python@v5
      with:
        python-version: '3.13'

    - name: Install dependencies
      run: pip install -r pipeline/aktionis/requirements.txt

    - name: Fetch ${{ matrix.store }} deals
      run: |
        cd pipeline/aktionis && python3 main.py ${{ matrix.store }} ${{ matrix.store }}-deals.json

    - name: Upload artifact
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: ${{ matrix.store }}-deals
        path: pipeline/aktionis/${{ matrix.store }}-deals.json
        retention-days: 7
        if-no-files-found: ignore
```

### 7b. `process-and-store` job

```yaml
process-and-store:
  name: Categorize & Store Deals
  runs-on: ubuntu-latest
  needs: [fetch-store]
  if: always() && needs.fetch-store.result != 'skipped'
  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
        cache-dependency-path: pipeline/package-lock.json

    - name: Install dependencies
      run: cd pipeline && npm ci

    - name: Download all store artifacts
      uses: actions/download-artifact@v4
      with:
        path: pipeline/        # downloads all artifacts into pipeline/
        pattern: '*-deals'     # matches coop-deals, lidl-deals, etc.
        merge-multiple: true   # flatten into pipeline/ without subdirs
      continue-on-error: true

    - name: List discovered deal files
      run: ls pipeline/*-deals.json 2>/dev/null || echo "No deal files found"

    - name: Validate JSON contracts
      run: |
        for f in pipeline/*-deals.json; do
          [ -f "$f" ] || continue
          node --input-type=module -e "
            import { readFileSync } from 'node:fs';
            const data = JSON.parse(readFileSync('$f', 'utf8'));
            if (!Array.isArray(data)) { console.error('$f: not an array'); process.exit(1); }
            const required = ['productName', 'store', 'salePrice', 'discountPercent'];
            for (const deal of data.slice(0, 5)) {
              for (const field of required) {
                if (deal[field] === undefined) {
                  console.error('$f: missing field: ' + field); process.exit(1);
                }
              }
            }
            console.log('$f: valid (' + data.length + ' deals)');
          "
        done

    - name: Categorize and store
      run: cd pipeline && npx tsx run.ts
```

**Key point:** `merge-multiple: true` on `actions/download-artifact@v4` flattens all artifacts into the target `path`. This means `coop-deals.json`, `lidl-deals.json`, etc. all land in `pipeline/` and are discovered by `globSync('*-deals.json')` in `run.ts`.

### 7c. `ci.yml` — update Python test path

**Current line (ci.yml):**
```yaml
- name: Run Coop tests
  run: cd pipeline/coop && python -m pytest
```

**Replace with:**
```yaml
- name: Run aktionis scraper tests
  run: cd pipeline/aktionis && python -m pytest
```

Also update the `pip install` step to reference the new path:
```yaml
- name: Install dependencies
  run: pip install -r pipeline/aktionis/requirements.txt pytest
```

---

## 8. Build Order

Execute in this order to avoid breaking the running system mid-migration:

1. **Database migration** (step 5) — expand constraints first so new store slugs can be written
2. **`shared/types.ts`** (step 1) — type system must be updated before any code that uses it
3. **`pipeline/aktionis/`** (step 2) — rename + parameterize the scraper
4. **Archive `pipeline/migros/`** (step 3) — remove active references
5. **`pipeline/run.ts`** and **`pipeline/store.ts`** (step 4) — update pipeline orchestration
6. **`web/src/lib/matching.ts`** (step 6b) — core frontend logic
7. **`web/src/lib/queries.ts`** (step 6c) — data layer
8. **`web/src/components/`** — `CompareCard`, `SplitList` (steps 6f, 6g)
9. **`web/src/pages/`** — `DealsPage`, `ComparisonPage` (steps 6d, 6e)
10. **Tailwind config** (step 6a) — add store colors
11. **CI** (step 7) — update workflows last, after pipeline code is deployed

---

## 9. Test Checklist

### Pipeline
- [ ] `python main.py coop coop-deals.json` produces valid JSON with `store: "coop"`
- [ ] `python main.py lidl lidl-deals.json` produces valid JSON with `store: "lidl"`
- [ ] `python main.py migros migros-deals.json` produces valid JSON with `store: "migros"` (from aktionis)
- [ ] `python main.py` (no args) exits with code 1 and a usage message
- [ ] `run.ts` with 3 deal files present resolves products for all 3 stores
- [ ] `run.ts` with 1 deal file present does not fail for missing stores
- [ ] DB constraint accepts `store = 'lidl'` on insert
- [ ] DB constraint rejects `store = 'unknown'` on insert

### Frontend
- [ ] `matchFavorites` with 3 stores returns `bestStore` from among all 3
- [ ] `splitShoppingList` with 3 stores produces 3 store buckets + tie + none
- [ ] `SplitList` renders correct store names and colors for LIDL, ALDI, Denner
- [ ] `DealsPage` with 9 stores in DB does not break the tab bar on mobile
- [ ] `ComparisonPage` store totals grid does not overflow on mobile with 4+ stores
- [ ] `STORE_META['ottos'].label` renders as `OTTO'S` (apostrophe in store name)
- [ ] All new store color classes pass WCAG AA check (use browser dev tools or axe)

### CI
- [ ] `matrix.store = 'lidl'` job runs independently — LIDL failure does not cancel Coop fetch
- [ ] `process-and-store` runs when at least one fetch job succeeds
- [ ] `process-and-store` runs when all fetch jobs fail (`if: always()` guard)
- [ ] Artifact download with `merge-multiple: true` produces flat `pipeline/*.json` files

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| aktionis.ch changes HTML structure for new stores | Medium | Pipeline broken for that store | Scraper returns empty array on parse failure — system degrades gracefully |
| New store slugs incorrect (site uses different URL paths) | High | Zero deals fetched | Verify slugs against live site before first CI run (see note in section 2) |
| DB migration drops pipeline_runs columns while pipeline still uses old schema | High | Pipeline log writes fail | Deploy pipeline code before running DROP COLUMN; run DROP COLUMN after confirming new writes succeed |
| `FavoriteComparison` shape change breaks all downstream consumers simultaneously | High | Frontend broken at compile time | TypeScript strict mode will surface all errors before deploy — fix all at once |
| `merge-multiple: true` on artifact download lands files in unexpected subdirs | Medium | `run.ts` discovers zero files | Add the `ls pipeline/*.json` debug step to CI; abort if count is 0 |
| Coop Megastore deals are duplicates of Coop deals (same items, same prices) | Medium | Inflated deal counts, user confusion | Detect duplicates in `run.ts` by product_name + valid_from — dedupe across stores |
| 9 parallel CI fetch jobs hit aktionis.ch rate limits | Low | Some stores return 429 | Add `REQUEST_TIMEOUT` backoff; accept partial failures via `fail-fast: false` |

---

## 11. Out of Scope for This Release

- Full N-store verdict UI (comparing all 9 stores by category) — deferred
- Migros regular price fetching for the Migros aktionis deals — deferred (was only used for shelf-price fallback)
- Store availability filters in the basket editor (e.g., "I don't have a LIDL nearby") — deferred
- Historical price tracking across stores — deferred
- Coop Megastore deduplication logic — noted as a risk, handled by the existing product dedup in `store.ts` for now
