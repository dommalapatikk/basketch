# Technical Architecture: basketch (v2.1)

**Author:** Architect Agent
**Date:** 12 April 2026
**Version:** 2.1 (revised 12 April 2026)
**Status:** Draft
**Inputs:** PRD v2.0, Use Cases v2.0, product-data-architecture.md, shared/types.ts, technical-architecture v2.0, architecture-challenge-v2.md, architecture-challenge-v2.1.md, pm-coach-review-favorites-data-gap.md, lenny-review-favorites.md, whatsapp-sharing-guide.md, coding-standards.md
**Changes from v2.0:** Verdict-first feature sequencing, Wordle card component (primary growth mechanism), two-tier Coop status logic, OG middleware fixed for Vite (was Next.js), Web Share API, starter pack validation process, `discount_percent` NOT NULL enforced, `updated_at` trigger added, React Query decision resolved (use simple fetch+cache), cron off-peak timing, date filter safety net, kill criteria monitoring, pre-launch pipeline requirement.
**Fixes from v2.1 challenge (2 must-do, 3 adjust):**
- **Must-Do 1:** OG tags changed from API route (`web/api/og.ts`) to Vercel Middleware (`web/middleware.ts`) so crawlers hitting normal URLs get OG tags (Section 9.2, ADR-003)
- **Must-Do 2:** `BROWSE_CATEGORIES` explicit mapping table added -- 23 DB sub-categories to 11 browse categories (Section 4.10)
- **Adjust:** Coop red contrast ratios corrected to actual values (Section 4.16)
- **Adjust:** html2canvas lazy-load note added to keep initial bundle under 100KB (Section 4.17)
- **Adjust:** Note added that coding-standards.md Section 4 must be updated to reflect ADR-005 decision (Section 10, ADR-005)
**Changes from v1.1:** Products/product_groups tables, metadata extraction pipeline, 5 starter packs, deals browsing page, dual return paths (URL + email both primary), verdict formula with transparency, OG meta tags, WCAG 2.1 AA, 404/error pages, 30-item basket cap, store colors, stale data warnings, kill criteria. No MVP phasing -- build everything.

---

## 1. Context & Scope (C4 Level 1)

```
                          +-----------+
                          |  Shopper  |
                          | (mobile)  |
                          +-----+-----+
                                |
                    HTTPS (Vercel CDN)
                                |
                          +-----v-----+
                          | basketch  |
                          |  Web App  |
                          +-----------+
                                |
                    Supabase JS client
                                |
                          +-----v-----+
                          | Supabase  |
                          | (Postgres)|
                          +-----+-----+
                                ^
                                |
                    Supabase service role
                                |
                       +--------+--------+
                       | Weekly Pipeline |
                       | (GitHub Actions)|
                       +--------+--------+
                               / \
                              /   \
               +-------------+     +------------+
               | migros-api- |     | aktionis.ch|
               | wrapper     |     | (Coop)     |
               +-------------+     +------------+
```

### What's in scope
- Weekly verdict + deals browsing (first-visit experience -- aha moment, zero setup, symmetric data)
- Wordle card (shareable verdict visual -- primary WhatsApp growth mechanism)
- Personal favorites comparison (retention feature -- requires setup, asymmetric data)
- Two-tier Coop status messages on favorites comparison
- Deals browsing by sub-category with store grouping
- Weekly verdict with transparency formula
- Dual return paths (bookmark URL + email lookup)
- Data pipeline with metadata extraction (brand, quantity, organic, sub-category)
- Products and product groups tables for cross-store matching
- OG meta tags for WhatsApp/social sharing (Vite-compatible)
- Web Share API for native sharing
- WCAG 2.1 AA accessibility
- 404 and error pages
- Data freshness warnings
- Pre-launch starter pack validation
- Kill criteria monitoring

### What's out of scope
- Other retailers (Aldi, Lidl, Denner)
- Price history / trend tracking
- Email notifications (future)
- Native app / PWA
- German UI (English V1)
- Regular-price comparison (deal-only in V1)

---

## 2. Goals and Non-Goals

### Goals (ordered by feature sequencing)
1. Any first-time visitor sees the weekly verdict and can browse deals with zero setup (aha moment)
2. The weekly verdict answers "Migros or Coop?" in 5 seconds with an explanation
3. The Wordle card makes the verdict screenshot-shareable in WhatsApp groups (primary growth)
4. Any shopper can browse all deals by sub-category with Migros vs Coop grouping
5. A shopper sets up favorites in under 60 seconds using a starter pack (retention hook)
6. A returning shopper sees their personalized comparison in under 30 seconds
7. Data is fresh every Thursday by 20:00 CET
8. Shared links show rich previews in WhatsApp

### Non-Goals
1. Not a price comparison engine (deals only, not shelf prices)
2. Not a recipe or meal planning tool
3. Not an app store product (web only)
4. Not multilingual (English UI, German product names from source)
5. Not enterprise scale (10-50 users)

---

## 3. Container Design (C4 Level 2)

### Deployment Model

| Component | Runs on | Trigger |
|-----------|---------|---------|
| Migros source | GitHub Actions (Node.js 20) | Cron: Wednesday 21:17 UTC |
| Coop source | GitHub Actions (Python 3.12) | Cron: Wednesday 21:17 UTC |
| Categorizer + Metadata Extractor + Product Resolver + Storage | GitHub Actions (Node.js 20) | After both sources complete |
| Verification fetch | GitHub Actions (Node.js 20 + Python 3.12) | Cron: Thursday 06:17 UTC |
| Supabase | Supabase cloud (free tier) | Always on |
| Frontend | Vercel (free tier, global CDN) | Auto-deploy on push to main |

### Three Data Paths

| Path | What | Who triggers | Frequency |
|------|------|-------------|-----------|
| **A: Pipeline** | Fetches deals, extracts metadata, resolves products, upserts deals + products | GitHub Actions cron | Weekly (Wednesday + Thursday) |
| **B: User favorites** | User selects starter pack, customizes, saves with email or bookmark | Frontend (user interaction) | On demand |
| **C: Deals browsing** | User browses all deals by sub-category | Frontend (read-only) | On demand |

### Feature Sequencing Rationale (v2.1)

The verdict and deals browsing are the **first-visit experience** (aha moment). Favorites are the **retention feature**. The architecture reflects this priority in component design, data layer, and build order.

| Dimension | Verdict + Deals Browsing | Favorites Comparison |
|-----------|------------------------|---------------------|
| **Data confidence** | Symmetric -- both stores provide promotional data | Asymmetric -- Migros full catalog, Coop promotions only |
| **Setup friction** | Zero -- works on first visit | Requires setup (starter pack selection) |
| **Time to value** | Instant -- open the page, see verdict in 5 seconds | 60 seconds setup + comparison |
| **Shareability** | High -- Wordle card works for everyone | Low -- personal favorites are not shareable |
| **Data asymmetry risk** | None -- uses deals that exist in both sources | High -- depends on product catalog completeness |

**Design implication:** The Home page leads with the verdict banner and Wordle card. The "Track your items" CTA for favorites setup is secondary. The comparison page layers on two-tier Coop status messages to handle the asymmetric data honestly. See Lenny review (`docs/lenny-review-favorites.md`) for the full rationale.

### Pipeline Data Flow (v2 -- with metadata extraction)

```
Raw API/HTML
  --> normalize (lowercase, collapse whitespace, standardize units)
  --> extract metadata (brand, quantity, unit, organic flag)
  --> categorize (category + sub_category)
  --> resolve product (find or create in products table, assign product_group if known)
  --> upsert deal with product_id
  --> log pipeline run
```

### Mixed-Language Decision (unchanged)

TypeScript for Migros (migros-api-wrapper is npm-only). Python for Coop (requests + BeautifulSoup). Orchestrated via GitHub Actions with JSON artifacts as the cross-language contract.

---

## 4. Module Design

### 4.1 Pipeline: Migros Source (unchanged from v1.1)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Fetch current Migros promotions, output normalized deal JSON |
| **Language** | TypeScript (Node.js 20) |
| **Key dependency** | `migros-api-wrapper` (npm) |
| **Interface** | `fetchMigrosDeals(): Promise<UnifiedDeal[]>` |
| **Error handling** | Return empty array on failure. Log error. Pipeline continues with Coop only. |

### 4.2 Pipeline: Coop Source (unchanged from v1.1)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Scrape current Coop promotions from aktionis.ch |
| **Language** | Python 3.12 |
| **Key dependencies** | `requests`, `beautifulsoup4` |
| **Interface** | `fetch_coop_deals() -> list[dict]` (JSON matching UnifiedDeal shape) |
| **Error handling** | Return empty list on failure. Log error. Pipeline continues with Migros only. |

### 4.3 Pipeline: Metadata Extractor (NEW)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Extract structured metadata from product names: brand, quantity/unit, organic flag |
| **Language** | TypeScript |
| **Location** | `pipeline/metadata.ts` |
| **Interface** | `extractMetadata(productName: string, store: Store): ProductMetadata` |
| **Pure function** | No side effects. Deterministic extraction via regex and keyword lists. |

**Extraction logic:**

| Field | Method |
|-------|--------|
| **brand** | Match against hardcoded Swiss brand list (M-Budget, Naturaplan, Prix Garantie, M-Classic, Karma, Betty Bossi, Emmi, Zweifel, etc.). Check if name starts with or contains known brand. |
| **quantity + unit** | Regex: `(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)`, multi-pack: `(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(g|ml|l)`, piece count: `(\d+)\s*(?:stück|stk|pcs)` |
| **is_organic** | Name contains any of: "bio", "naturaplan", "demeter", "knospe", "organic" |
| **product_form** | Detect "tiefgekühlt"/"frozen" -> frozen, "dose"/"büchse" -> canned, etc. Default: "raw" |

**Testing:** Unit tests with 30+ fixture product names covering all extraction paths, edge cases (multi-pack, no quantity, unknown brand).

### 4.4 Pipeline: Categorizer (EXTENDED)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Map each deal to category (fresh/long-life/non-food) AND sub_category |
| **Language** | TypeScript |
| **Interface** | `categorizeDeal(deal: UnifiedDeal): { category: Category, subCategory: string | null }` |
| **Change from v1.1** | Now also returns `subCategory`. Category rules extended with sub-category field. |

Updated rules structure:
```typescript
const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ['milch', 'joghurt', 'rahm', 'quark', 'käse', 'butter'], category: 'fresh', subCategory: 'dairy' },
  { keywords: ['poulet', 'fleisch', 'hackfleisch', 'rind'], category: 'fresh', subCategory: 'meat' },
  { keywords: ['gemüse', 'tomaten', 'zwiebeln', 'kartoffeln', 'salat'], category: 'fresh', subCategory: 'vegetables' },
  { keywords: ['waschmittel', 'waschpulver'], category: 'non-food', subCategory: 'laundry' },
  { keywords: ['shampoo', 'zahnpasta', 'duschgel'], category: 'non-food', subCategory: 'personal-care' },
  // ... full list in shared/category-rules.ts
]
```

Default: `{ category: 'long-life', subCategory: null }` for unmapped products.

### 4.5 Pipeline: Product Resolver (NEW)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Find or create a product row for each deal. Assign product_group if match exists. |
| **Language** | TypeScript |
| **Location** | `pipeline/resolve-product.ts` |
| **Interface** | `resolveProduct(deal: Deal, metadata: ProductMetadata): Promise<string>` (returns product_id) |

**Logic:**
1. Look up `products` by `(store, source_name)` where `source_name = deal.productName`
2. If found: return existing `product_id`, update metadata if changed
3. If not found: create new product row with extracted metadata
4. If `product_group` is null: attempt auto-match by `sub_category + quantity + unit` against `product_groups` table (optional, best-effort)
5. Return `product_id`

**Dependencies:** Supabase client (service role key). Runs in pipeline context only.

**Logging (v2.1):** After processing all deals, log a summary line: "Products: X new, Y updated, Z auto-matched to groups." This gives the PM a dashboard signal in GitHub Actions logs when product creation is unexpectedly high (indicating potential duplicate source names).

### 4.6 Pipeline: Storage (EXTENDED)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Write categorized deals to Supabase with product_id. Mark old deals inactive. Log pipeline run. |
| **Change from v1.1** | Deals now include `product_id` and `sub_category`. Pipeline also upserts to `products` table. |
| **Interface** | `storeDeals(deals: Deal[], productIds: Map<string, string>): Promise<void>` |
| **Upsert logic** | Match on `store + product_name + valid_from`. Set `product_id` and `sub_category` on new and updated rows. |

### 4.7 Pipeline: Orchestrator (EXTENDED)

Same GitHub Actions workflow structure. The `process-and-store` job now runs:
1. Read JSON artifacts from both sources
2. Validate against UnifiedDeal schema (trust boundary)
3. Extract metadata for each deal
4. Categorize (category + sub_category)
5. Resolve product (find/create in products table)
6. Upsert deals with product_id
7. Log pipeline run

### 4.8 Frontend: Data Layer (EXTENDED)

| Function | Returns | New/Changed |
|----------|---------|-------------|
| `getActiveDeals()` | All active deals | Unchanged |
| `getDealsByCategory(category)` | Deals for one category | Unchanged |
| `getDealsBySubCategory(subCategory)` | Deals for one sub-category | **NEW** |
| `getDealsBrowse(browseCategory)` | Deals for a browse category (maps to sub_categories) | **NEW** |
| `getLatestPipelineRun()` | Latest pipeline run record | Unchanged |
| `getStarterPacks()` | Active starter packs | Unchanged |
| `searchProducts(query)` | Matching product names/groups | **CHANGED** -- now also searches product_groups |
| `saveFavorites(items, email?)` | Saved favorite record | Unchanged |
| `getFavoritesByEmail(email)` | Favorite with items | Unchanged |
| `getFavoriteById(favoriteId)` | Favorite with items | **NEW** -- for bookmark return path |
| `getComparisonForFavorites(favoriteId)` | Matched favorites with deals | **CHANGED** -- now uses product_group matching when available |
| `getProductGroups()` | All product groups | **NEW** -- for favorites editor |

**Caching (v2.1):** Custom `useCachedQuery` hook with `localStorage` + 1-hour stale time. See ADR-005. React Query removed -- too heavy for weekly-updating data.

### 4.9 Frontend: Verdict (EXTENDED)

| Attribute | Detail |
|-----------|--------|
| **Formula** | `(0.4 * dealCountShare) + (0.6 * avgDiscountShare)` per category per store |
| **Tie threshold** | 5% -- if stores are within 5% of each other, verdict is "tie" |
| **Minimum threshold** | If a category has fewer than 3 deals from a store, show "Not enough data" for that category |
| **Transparency** | Show explanation line: "Based on 12 Migros deals (avg 28% off) vs 8 Coop deals (avg 22% off)" |
| **Store colors** | Migros orange (#FF6600), Coop red (#E10A0A) in verdict text |
| **Change from v1.1** | Added minimum threshold (3 deals), added explanation line, added store colors |

**Verdict states:**

| State | Display |
|-------|---------|
| Normal | "This week: Migros for Fresh, Coop for Household" -- store names in store colors |
| Tie | "It's a tie this week!" |
| Stale data (> 7 days) | Verdict shown + amber warning: "Deals may be outdated -- last updated [date]" |
| Partial data (one store missing) | "Partial data -- [store] unavailable this week" |
| No data | Verdict banner not shown |
| Category below threshold | "Not enough data" for that category |

### 4.10 Frontend: Deals Browsing Page (NEW, v2.1 clarification)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Browse all deals by sub-category with Migros vs Coop grouping |
| **Route** | `/deals` |
| **Components** | `DealsPage`, `CategoryFilterPills`, `StoreGroup`, `DealCard` |

**Behavior:**
- 11 browsable sub-categories (plus "All"): defined in `BROWSE_CATEGORIES` constant in `shared/types.ts`
- **Explicit mapping (v2.1 challenge fix):**

| Browse Category | DB `sub_category` values |
|----------------|--------------------------|
| Fruits & Vegetables | `fruit`, `vegetables` |
| Meat & Fish | `meat`, `poultry`, `fish` |
| Dairy & Eggs | `dairy`, `eggs` |
| Bakery | `bread` |
| Snacks & Sweets | `snacks`, `chocolate` |
| Pasta, Rice & More | `pasta-rice` |
| Drinks | `drinks`, `coffee-tea` |
| Ready Meals & Frozen | `ready-meals`, `frozen`, `deli` |
| Pantry & Canned | `canned`, `condiments` |
| Home & Cleaning | `cleaning`, `laundry`, `paper-goods`, `household` |
| Beauty & Hygiene | `personal-care` |

This maps all 23 DB sub-categories to 11 browse categories. The `BROWSE_CATEGORIES` constant in `shared/types.ts` must implement this exact mapping. Deals with `sub_category = null` (unmapped products) appear only in the "All" view.

- Category filter via pill-style toggles (horizontal scrollable on mobile)
- Deals grouped by store within selected category
- Desktop: side-by-side columns (Migros left, Coop right)
- Mobile: stacked sections (Migros section, then Coop section)
- Sorted by discount % descending within each store group
- 50-deal display cap per store group, with "Show more" expansion
- **Empty category (v2.1):** If a store has zero deals in a selected category, show "No [Store] deals in this category this week" in that store's column/section. Do not collapse the empty column.

**Query pattern:**
```typescript
// Get deals for a browse category
const browseCategory = BROWSE_CATEGORIES.find(c => c.id === selected)
const { data } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .in('sub_category', browseCategory.subCategories)
  .order('discount_percent', { ascending: false })
```

### 4.11 Frontend: Onboarding Flow (EXTENDED)

| Attribute | Detail |
|-----------|--------|
| **Change from v1.1** | Now 5 starter packs (was 4). 30-item soft cap. |
| **5 packs** | Swiss Basics, Indian Kitchen, Mediterranean, Studentenküche, Familientisch |
| **30-item cap** | At 30 items, show warning: "Your list is getting long -- shorter lists give better results." Allow adding beyond 30 but discourage it. |

### 4.12 Frontend: Comparison View (EXTENDED -- v2.1 adds two-tier Coop status)

| Attribute | Detail |
|-----------|--------|
| **Change from v1.1** | Now uses product_group matching when available (falls back to keyword). Shows data freshness indicator. "Save this list" section prominently displays URL. |
| **Change from v2.0** | Adds two-tier Coop status messages. Adds Coop transparency label. |
| **Matching priority** | 1. product_group_id match (exact). 2. Keyword match (fallback). |
| **Data freshness** | Always shows "Deals updated: [date]". If > 7 days: amber warning. |
| **Coop transparency label** | Permanent one-line label at top of comparison: "Coop: showing promotions found. Not all Coop products are tracked yet." |

**Two-tier Coop status messages:**

When a favorite item has no active Coop deal, the component must distinguish between two states:

| Tier | Condition | Message | Meaning |
|------|-----------|---------|---------|
| **Tier 1** | Product keyword or product_group_id has at least one Coop product in `products` table (has been seen in a promotion before) | "Not on promotion at Coop this week" | Confident -- we know this Coop product exists, it is just not on sale right now |
| **Tier 2** | Product keyword or product_group_id has NEVER had a Coop product in `products` table | "No Coop data yet" | Honest -- we have never seen this product at Coop |

**Note:** Migros ALWAYS gets confident statements ("Not on promotion at Migros this week" or sale price) because we have full catalog access.

**Implementation:** The `getComparisonForFavorites` query function returns a `coopProductKnown: boolean` flag per favorite item. The component uses this flag to select the correct message.

**Query logic (in `queries.ts`):**
```typescript
// For each favorite_item, check if Coop has ever had this product
async function checkCoopProductExists(
  productGroupId: string | null,
  keyword: string
): Promise<boolean> {
  if (productGroupId) {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('product_group', productGroupId)
      .eq('store', 'coop')
      .limit(1)
    return (data?.length ?? 0) > 0
  }
  // Fallback: keyword search in products table
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('store', 'coop')
    .ilike('canonical_name', `%${keyword}%`)
    .limit(1)
  return (data?.length ?? 0) > 0
}
```

**Display states per favorite item:**

| Migros | Coop | Display |
|--------|------|---------|
| Sale price + discount | Sale price + discount | Both on sale -- show both |
| Sale price + discount | Known product, no deal | Migros deal + "Not on promotion at Coop this week" |
| Sale price + discount | Unknown product | Migros deal + "No Coop data yet" |
| Not on sale | Sale price + discount | "Not on promotion at Migros this week" + Coop deal |
| Not on sale | Known product, no deal | "Not on promotion this week" (both stores) |
| Not on sale | Unknown product | "Not on promotion at Migros this week" + "No Coop data yet" |

**Sort order:** Items with both-store matches first, then single-store matches, then no matches. Within each group, sort by discount percentage descending.

### 4.13 Frontend: Dual Return Paths (CLARIFIED)

Both return paths are primary. Neither is a fallback.

**Path A: Bookmark / saved link**
- Route: `/compare/:favoriteId`
- `favoriteId` is UUID -- unguessable
- Works across devices if user shares the link
- "Save this list" section with Copy + Share buttons shown prominently

**Path B: Email lookup**
- Component: `EmailLookup` on home page
- "Already have a list?" with email input
- Retrieves favorite by email, redirects to `/compare/:favoriteId`
- If not found: "No list found for this email. Try creating a new one."
- If multiple lists: return most recently created

### 4.14 Frontend: Error Pages (NEW)

| Route | Behavior |
|-------|----------|
| `/*` (catch-all) | "Page not found" with link to home. Consistent header/footer. |
| `/compare/:id` with invalid UUID | "This comparison list wasn't found" with link to create new list. |

Implementation: React Router catch-all route + error boundary in Compare page.

### 4.15 Frontend: OG Meta Tags (UPDATED v2.1 -- fixed for Vite)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Set Open Graph meta tags per page for WhatsApp/social sharing |
| **Browser implementation** | `react-helmet-async`. Set tags in each page component. |
| **Crawler implementation** | Vercel Middleware at `web/middleware.ts` -- intercepts all requests, serves OG HTML to crawlers. See Section 9.2. |

**Tags per page:**

| Page | og:title | og:description |
|------|----------|----------------|
| `/` (Home) | "basketch -- Migros vs Coop deals this week" | "See which store has better deals this week. Migros vs Coop, compared." |
| `/compare/:id` | "My grocery deals -- basketch" | "See your personalized Migros vs Coop comparison" |
| `/deals` | "All deals this week -- basketch" | "Browse Migros and Coop deals side by side" |
| `/onboarding` | "Set up your list -- basketch" | "Pick your regular groceries and compare deals" |

All pages also set: `og:url`, `og:image` (1200x630px static image with basketch branding), `twitter:card` ("summary_large_image"), `theme-color` ("#1a1a2e"), `canonical` URL, `apple-touch-icon`.

**SPA limitation:** OG tags set client-side via `react-helmet-async` work in browsers but are NOT picked up by WhatsApp/social crawlers (which don't execute JS). Mitigation: Vercel Middleware (`web/middleware.ts`) that intercepts ALL incoming requests, checks the user agent, and returns minimal HTML with correct OG tags for crawlers. Regular users pass through to the SPA. See Section 9.2.

**Comparison page OG tags (v2.1 decision):** Use static OG tags for `/compare/:id` ("See your personalized Migros vs Coop comparison") rather than dynamic counts. Dynamic OG would require the edge function to query Supabase for each crawler request -- unnecessary complexity. The Wordle card (screenshot sharing) is the primary sharing mechanism for personalized content, not link previews.

### 4.16a Frontend: Web Share API (NEW v2.1)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Native share button using the Web Share API |
| **Component** | `ShareButton.tsx` |
| **API** | `navigator.share()` -- opens the phone's native share menu (WhatsApp, Messages, etc.) |

**Implementation:**
```typescript
async function handleShare(title: string, text: string, url: string) {
  if (navigator.share) {
    await navigator.share({ title, text, url })
  } else {
    // Fallback: copy URL to clipboard
    await navigator.clipboard.writeText(url)
    // Show "Link copied!" toast
  }
}
```

**Where it appears:**
- Home page verdict section: shares the basketch URL with verdict text
- Comparison page: shares the `/compare/:favoriteId` URL
- Wordle card: shares the home URL (the card itself is shared as a screenshot)

**Browser support:** `navigator.share()` works on mobile Safari, Chrome Android, and Edge. Falls back to clipboard copy on desktop browsers and unsupported mobile browsers.

### 4.16 Frontend: Accessibility (NEW -- cross-cutting)

WCAG 2.1 AA compliance across all components:

| Requirement | Implementation |
|-------------|---------------|
| 4.5:1 contrast ratio (normal text) | Verified against store colors: white text on #FF6600 fails (3.1:1). Use dark text on orange backgrounds, or use darker orange. White on #E10A0A: ~4.0:1 -- fails AA normal text (4.5:1 threshold) but passes large text (3:1 threshold). Use #B80909 for normal red text on white. |
| 3:1 contrast ratio (large text) | Checked for headings, verdict banner text |
| 44x44px touch targets | All buttons, links, filter pills, deal cards |
| Keyboard accessible | Tab navigation through all interactive elements. Enter/Space to activate. |
| Focus states | Visible focus ring (2px solid, offset) on all interactive elements |
| Screen reader support | Semantic HTML (nav, main, section, article). aria-labels on icon buttons. Store identity via aria-label, not just color. |
| No color-only information | Store-colored elements always have text labels ("Migros", "Coop") |

**Contrast note:** Migros orange (#FF6600) on white has a 3.13:1 ratio -- fails WCAG AA for normal text. Options:
1. Use #CC5200 (darker orange, passes at 4.6:1) for text
2. Keep #FF6600 for backgrounds/badges with dark text on top
3. Always pair with text label "Migros" so color is supplementary

Decision: Use #FF6600 for badges/backgrounds with dark text. Use #CC5200 for orange text on white backgrounds. Coop red (#E10A0A) has ~4.0:1 contrast against white -- passes AA for large text (3:1 threshold) but fails for normal text (4.5:1 threshold). Use #B80909 for normal-size red text on white backgrounds.

### 4.17 Frontend: Verdict Card / Wordle Card (NEW v2.1)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Render the weekly verdict as a standalone visual card optimized for WhatsApp screenshot sharing |
| **Component** | `VerdictCard.tsx` |
| **Why this matters** | The Wordle card is the **primary growth mechanism**. It creates ambient awareness in WhatsApp groups without requiring recipients to visit the site. See `docs/whatsapp-sharing-guide.md` for the full concept. |

**Design requirements:**
- **Self-contained:** Readable without visiting basketch. Someone seeing only the screenshot understands: which store is winning, in what category, by how much.
- **Dimensions:** Fixed aspect ratio (approximately 400x500px or similar portrait format). Must look good on phone screens.
- **High contrast:** Survives WhatsApp image compression (which reduces quality significantly). Use bold colors, large fonts, minimal fine detail.
- **Branding:** Include "basketch.ch" and tagline at the bottom. This is the only bridge back to the website from a screenshot.
- **Readable at small sizes:** WhatsApp shrinks images in group chats. Text must remain legible at 50% zoom.
- **Works on light and dark backgrounds:** The card should have its own background color, not rely on the page background.

**Card content:**
```
+----------------------------------------------+
|                                              |
|  basketch -- This Week's Verdict             |
|  Week of [date]                              |
|                                              |
|  [Migros color] MIGROS leads Fresh           |
|     12 deals  |  avg 28% off                 |
|                                              |
|  [Coop color] COOP leads Household           |
|     8 deals  |  avg 35% off                  |
|                                              |
|  Tied on Snacks & Drinks                     |
|     5 deals each                             |
|                                              |
|  basketch.ch -- your weekly grocery deals    |
|                                              |
+----------------------------------------------+
```

**Rendering approach:** HTML/CSS with fixed dimensions. Use CSS `aspect-ratio`, large fonts (18px+ body, 24px+ headings), and solid background colors. No gradients or fine borders that compress poorly. Store colors: Migros orange (#FF6600) for backgrounds/badges, Coop red (#E10A0A) for backgrounds/badges, always with text labels.

**"Copy card" button:**
1. Use `html2canvas` library (~40KB) to render the card DOM element as a canvas image. **Important: lazy-load html2canvas via dynamic `import()` on button click** -- do not include it in the main bundle. This keeps the initial JS bundle under the 100KB gzipped target (see Section 11).
2. Convert canvas to blob: `canvas.toBlob()`
3. Copy to clipboard: `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`
4. Show "Card copied!" confirmation toast
5. **Fallback (if clipboard write fails):** Download the image as `basketch-verdict.png` via `<a download>` link

**Browser support for copy-to-clipboard:**
- `navigator.clipboard.write()` with image support: Chrome 76+, Edge 79+, Safari 13.1+
- Falls back to download on Firefox (which does not support writing images to clipboard)

**Accessibility:** The card must have an `aria-label` describing the verdict in text form. The "Copy card" button must have clear button text ("Copy verdict card") and keyboard accessibility.

### 4.18 Frontend: Starter Pack Validation (NEW v2.1 -- pre-launch)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Validate that starter pack items have sufficient both-store coverage before sharing with friends |
| **When** | After the pipeline has run 2-3 times (pre-launch requirement) |
| **Type** | One-off validation script or Supabase SQL query (not a runtime feature) |

**Pre-launch requirement:** The pipeline MUST run 2-3 weeks before sharing with friends to accumulate Coop product history. Without this, most Coop items show "No Coop data yet" -- poisoning the first impression.

**Validation query (run in Supabase SQL editor):**
```sql
-- For each starter pack, check which items have Coop product history
SELECT
  sp.name AS pack_name,
  item->>'keyword' AS keyword,
  item->>'productGroupId' AS product_group_id,
  EXISTS(
    SELECT 1 FROM products p
    WHERE p.store = 'coop'
    AND (
      p.product_group = item->>'productGroupId'
      OR p.canonical_name ILIKE '%' || (item->>'keyword') || '%'
    )
  ) AS has_coop_history,
  EXISTS(
    SELECT 1 FROM products p
    WHERE p.store = 'migros'
    AND (
      p.product_group = item->>'productGroupId'
      OR p.canonical_name ILIKE '%' || (item->>'keyword') || '%'
    )
  ) AS has_migros_history
FROM starter_packs sp,
     jsonb_array_elements(sp.items) AS item
WHERE sp.is_active = true
ORDER BY sp.name, (item->>'keyword');
```

**Decision criteria:**
- If a pack has more than 3 items with `has_coop_history = false`, swap those items for ones that DO have Coop history
- Items with both-store coverage should appear first in the pack's item array (reorder `starter_packs.items` JSONB)
- Do NOT permanently remove items based on data availability -- the packs are designed around shopping habits. But for launch, put the best foot forward.

### 4.19 Frontend: Kill Criteria Monitoring (NEW v2.1)

| Attribute | Detail |
|-----------|--------|
| **Responsibility** | Track signals for the 8 kill criteria defined in the PRD |
| **Approach** | Lightweight -- use existing tools (Vercel Analytics, Supabase queries, manual observation). No custom analytics infrastructure for 10-50 users. |

**Monitoring plan for each kill criterion:**

| Kill Signal | How to Measure | Tool |
|-------------|---------------|------|
| Data quality (< 70% correctly categorized) | Manual spot-check: sample 20 deals, verify categories | Supabase SQL query |
| Friends beta retention (< 3/10 return in week 2) | Track unique visitors per week via Vercel Analytics | Vercel Analytics |
| PMF survey (< 20% "Very Disappointed") | Send Sean Ellis survey at week 8 via WhatsApp/email | Manual survey (Google Forms or similar) |
| Verdict trust (3+ users say "felt wrong") | Ask friends directly during beta. Log in a simple spreadsheet. | Manual feedback collection |
| Pipeline reliability (2+ consecutive failed fetches) | GitHub Actions email notifications + `pipeline_runs` table | GitHub Actions + Supabase |
| Onboarding drop-off (> 60% leave before starter pack) | Vercel Analytics: compare `/onboarding` page views to `favorites` table row count | Vercel Analytics + Supabase |
| Coop false negatives (3+ reports of missed deals) | Ask friends to report when Coop had a deal basketch missed | Manual feedback collection |
| Favorites ignored (80%+ traffic to /deals vs /compare) | Vercel Analytics page views: `/deals` vs `/compare/*` | Vercel Analytics |

**Implementation cost:** Zero additional code. All signals are measurable through existing tools (Vercel Analytics free tier, Supabase SQL editor, manual feedback from 10-50 friends).

**North Star metric tracking:** "% of active baskets that viewed a comparison this week" can be approximated by comparing Vercel Analytics page views for `/compare/*` against the count of rows in the `favorites` table. For 10-50 users, this approximation is sufficient. A dedicated `comparison_views` table is not needed at this scale.

---

## 5. Data Architecture

### 5.1 Table: `products` (NEW)

```sql
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

CREATE INDEX idx_products_group ON products (product_group) WHERE product_group IS NOT NULL;
CREATE INDEX idx_products_category ON products (category, sub_category);
CREATE INDEX idx_products_store ON products (store);
```

### 5.2 Table: `product_groups` (NEW)

```sql
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

CREATE INDEX idx_product_groups_category ON product_groups (category);
```

Seeded with ~37 product groups from starter pack items (see product-data-architecture.md appendix).

### 5.3 Table: `deals` (EXTENDED)

```sql
CREATE TABLE deals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),
  product_name    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,                    -- NEW: for deals browsing
  original_price  DECIMAL(10, 2),
  sale_price      DECIMAL(10, 2) NOT NULL,
  discount_percent INTEGER NOT NULL,       -- v2.1: NOT NULL enforced. Pipeline calculates from prices if source doesn't provide it. Deals without calculable discount are excluded.
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  image_url       TEXT,
  source_category TEXT,
  source_url      TEXT,
  product_id      UUID REFERENCES products(id),  -- NEW: link to product identity
  is_active       BOOLEAN DEFAULT true,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_deal UNIQUE (store, product_name, valid_from)
);

-- Existing indexes
CREATE INDEX idx_deals_active_category ON deals (is_active, category, store)
  WHERE is_active = true;
CREATE INDEX idx_deals_valid_to ON deals (valid_to)
  WHERE is_active = true;

-- NEW: sub-category index for deals browsing
CREATE INDEX idx_deals_active_subcategory ON deals (is_active, sub_category, store)
  WHERE is_active = true;

-- NEW: product_id index for product-based matching
CREATE INDEX idx_deals_product_id ON deals (product_id) WHERE product_id IS NOT NULL;

-- v2.1: Auto-update updated_at on row changes (v1 challenge finding, now resolved)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
```

### 5.4 Table: `pipeline_runs` (unchanged)

```sql
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
```

### 5.5 Table: `starter_packs` (unchanged)

```sql
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
```

Now seeded with 5 packs: Swiss Basics, Indian Kitchen, Mediterranean, Studentenküche, Familientisch.

### 5.6 Table: `favorites` (unchanged)

```sql
CREATE TABLE favorites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_favorites_email ON favorites (email) WHERE email IS NOT NULL;
```

### 5.7 Table: `favorite_items` (EXTENDED)

```sql
CREATE TABLE favorite_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  favorite_id     UUID NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  label           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  exclude_terms   TEXT[],                    -- kept for backward compat
  prefer_terms    TEXT[],                    -- kept for backward compat
  product_group_id TEXT REFERENCES product_groups(id),  -- NEW: preferred matching path
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_favorite_item UNIQUE (favorite_id, keyword)
);

CREATE INDEX idx_favorite_items_favorite_id ON favorite_items (favorite_id);
```

### 5.8 Entity Relationship Diagram

```
product_groups (reference data, ~37 rows)
  |
  |-- 1:N --> products (one group has Migros + Coop variants)
  |              |
  |              |-- 1:N --> deals (one product has many weekly deals)
  |
  |-- 1:N --> favorite_items (user favorites link to product groups)
  |
  |-- referenced by --> starter_packs.items[].productGroupId

favorites
  |
  |-- 1:N --> favorite_items

pipeline_runs (independent log table)
```

### 5.9 Row-Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_items ENABLE ROW LEVEL SECURITY;

-- Public read access (no login required)
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
-- No INSERT/UPDATE/DELETE policies for anon key on these tables
```

**Known limitation (v2.1):** Favorites are effectively public -- anyone who knows a UUID can read or modify that list. The UPDATE and DELETE policies on favorites/favorite_items are wide-open. This is acceptable for 10-50 trusted users (friends). Document this if scaling beyond the friend group.

### 5.10 Data Lifecycle

| Event | Action |
|-------|--------|
| Pipeline runs (Wed + Thu) | Upsert deals + products. Mark `valid_to < now()` deals as `is_active = false`. |
| Frontend deal queries | Filter `WHERE is_active = true`. |
| Frontend favorites queries | Retrieve by ID or email. No expiry. |
| Data retention | Keep expired deals and all products indefinitely. |
| Free tier limit | 500MB / 50K rows. Products: ~1000 (grows slowly). Deals: ~300/week = ~15K/year. Product groups: ~37. Favorites: ~50. Favorite items: ~1000. Total well within limits for 3+ years. |

---

## 6. Security Architecture

### 6.1 Authentication: None (by design)

No login, no accounts. Favorites accessed via UUID (unguessable) or email lookup. Acceptable because:
- No sensitive data (product keywords + optional email)
- No financial transactions
- No PII beyond optional email
- 10-50 users (friends)

### 6.2 Authorization: RLS

| Table | Anon key (frontend) | Service role (pipeline) |
|-------|--------------------|-----------------------|
| deals | SELECT | ALL |
| products | SELECT | ALL |
| product_groups | SELECT | ALL |
| pipeline_runs | SELECT | ALL |
| starter_packs | SELECT | ALL (seeded manually) |
| favorites | SELECT, INSERT, UPDATE | ALL |
| favorite_items | SELECT, INSERT, DELETE | ALL |

### 6.3 Secrets Management

| Secret | Stored in | Exposed to |
|--------|----------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secrets | Pipeline only. NEVER in frontend code. |
| `SUPABASE_URL` | GitHub Actions secrets + `.env` | Both (not secret -- just a URL) |
| `VITE_SUPABASE_ANON_KEY` | `.env` (frontend) | Browser (read-only via RLS) |

### 6.4 Input Validation

| Boundary | Validation |
|----------|-----------|
| Pipeline: Coop JSON from Python | Validate against UnifiedDeal schema before processing. Skip invalid entries. |
| Frontend: email input | Basic format check. No verification (no auth). |
| Frontend: search input | Sanitize for Supabase `ilike` (escape `%` and `_`). Max 100 chars. |
| Frontend: favorite item count | Soft cap at 30 items (warning, not block). |

### 6.5 OWASP Top 10 (relevant items)

| Risk | Mitigation |
|------|-----------|
| Injection | Supabase client uses parameterized queries. No raw SQL from user input. |
| Broken access control | RLS enforces read-only on deal tables. No admin endpoints. |
| Security misconfiguration | Service role key only in GitHub Actions secrets. Anon key has read-only access via RLS. |
| Sensitive data exposure | Only optional email stored. No passwords, no payment info. |

---

## 7. Observability

### 7.1 Logging

| Component | How | Retention |
|-----------|-----|-----------|
| Pipeline (GitHub Actions) | `console.log` / `console.error`. Captured by Actions. | 90 days (free tier) |
| Pipeline (Supabase) | `pipeline_runs` table with source statuses, counts, duration, errors | Indefinite |
| Frontend | Browser console only. No external logging service. | Session only |

### 7.2 Monitoring

| What | How | Cost |
|------|-----|------|
| Pipeline failure | GitHub Actions email notification (built-in) | Free |
| Data freshness | Frontend checks `pipeline_runs.run_at`. Warning if > 7 days old. | Free |
| Uptime | Vercel basic monitoring | Free |
| Performance | Lighthouse CI (manual) + Vercel Analytics (free tier) | Free |

### 7.3 Health Indicators

| Indicator | Check |
|-----------|-------|
| Pipeline ran this week | `pipeline_runs` has entry with `run_at` within 7 days |
| Both stores have data | Latest pipeline run has `migros_status = 'success'` AND `coop_status = 'success'` |
| Deals are current | Active deals exist with `valid_from` within 7 days |
| Frontend is up | Vercel deployment active, no build errors |

---

## 8. API Contracts

### 8.1 TypeScript Interfaces

All types defined in `shared/types.ts`. Key types and what changed from v1.1:

**Unchanged:** `Store`, `Category`, `UnifiedDeal`, `Deal`, `PipelineRun`, `CategoryVerdict`, `WeeklyVerdict`, `StarterPack`, `Favorite`

**New in v2:**
- `BrowseCategory` -- union type for 11 browsable sub-categories + "all"
- `BrowseCategoryInfo` -- metadata for each browse category (label, emoji, sub-categories)
- `BROWSE_CATEGORIES` -- constant array mapping browse categories to DB sub_categories
- `ProductRow` -- product identity (canonical name, brand, store, metadata, product_group FK)
- `ProductGroupRow` -- cross-store matching reference (id, label, search keywords)
- `ProductMetadata` -- extracted metadata from product names (brand, organic, form)
- `ProductForm` -- union type: 'raw' | 'processed' | 'ready-meal' | 'canned' | 'frozen' | 'dried'
- `SearchResult` -- unified search result combining product groups, deals, and regular prices
- `DealComparison` -- side-by-side comparison of equivalent deals at both stores

**Extended:**
- `DealRow` -- added `product_id` (nullable), `sub_category` (nullable)
- `FavoriteItem` -- type definition expanded (implementation adds `product_group_id`)
- `FavoriteItemRow` -- added `exclude_terms`, `prefer_terms`, `product_group_id`
- `StarterPackItem` -- added optional `excludeTerms`, `preferTerms`, `productGroupId`
- `FavoriteComparison` -- added `migrosRegularPrice`, `coopRegularPrice`
- `CategoryRule` -- added `subCategory` field

### 8.2 Supabase Query Patterns (new queries)

```typescript
// Get deals by browse category (NEW -- deals browsing page)
const browseCategory = BROWSE_CATEGORIES.find(c => c.id === selected)
const { data } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .in('sub_category', browseCategory.subCategories)
  .order('discount_percent', { ascending: false })
  .limit(100)  // 50 per store, 2 stores

// Get favorite by ID (NEW -- bookmark return path)
const { data } = await supabase
  .from('favorites')
  .select('*, favorite_items(*)')
  .eq('id', favoriteId)
  .single()

// Match favorites using product_group (NEW -- improved matching)
// For each favorite_item with product_group_id:
const { data: products } = await supabase
  .from('products')
  .select('id')
  .eq('product_group', productGroupId)

const { data: deals } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .in('product_id', products.map(p => p.id))

// Get product groups (NEW -- for favorites editor)
const { data } = await supabase
  .from('product_groups')
  .select('*')
  .order('label')

// Upsert product (NEW -- pipeline)
const { data } = await supabase
  .from('products')
  .upsert({
    store, canonical_name, brand, category, sub_category,
    quantity, unit, is_organic, product_group, source_name
  }, {
    onConflict: 'store,source_name',
    ignoreDuplicates: false,
  })
  .select('id')
  .single()

// v2.1: Check if Coop product exists (two-tier status)
const { data: coopProduct } = await supabase
  .from('products')
  .select('id')
  .eq('product_group', productGroupId)
  .eq('store', 'coop')
  .limit(1)
// coopProduct.length > 0 = Tier 1 ("Not on promotion at Coop this week")
// coopProduct.length === 0 = Tier 2 ("No Coop data yet")

// v2.1: Date filter safety net for frontend deal queries
// Added to all deal queries to prevent showing expired deals if pipeline fails
const today = new Date().toISOString().split('T')[0]
const { data } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .gte('valid_to', today)  // Safety net: only show deals still valid
  .order('discount_percent', { ascending: false })
```

---

## 9. Infrastructure

### 9.1 GitHub Actions Workflow (EXTENDED)

Same structure as v1.1. The `process-and-store` job now includes metadata extraction and product resolution steps. No new jobs needed.

```yaml
# .github/workflows/pipeline.yml
name: Weekly Deal Pipeline

on:
  schedule:
    - cron: '17 21 * * 3'  # Wednesday 21:17 UTC (off-peak minute to avoid GH Actions congestion)
    - cron: '17 6 * * 4'   # Thursday 06:17 UTC (verification, off-peak)
  workflow_dispatch:

env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

jobs:
  fetch-migros:
    # ... unchanged from v1.1
  fetch-coop:
    # ... unchanged from v1.1
  process-and-store:
    needs: [fetch-migros, fetch-coop]
    if: always() && (needs.fetch-migros.result == 'success' || needs.fetch-coop.result == 'success')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd pipeline && npm ci
      - uses: actions/download-artifact@v4
        with:
          path: artifacts/
      - run: >
          npx tsx pipeline/run.ts
          --migros-file=artifacts/migros-deals/migros-deals.json
          --coop-file=artifacts/coop-deals/coop-deals.json
          --migros-status=${{ needs.fetch-migros.result }}
          --coop-status=${{ needs.fetch-coop.result }}
      - name: Keep Supabase alive
        run: |
          npx tsx -e "
            import { createClient } from '@supabase/supabase-js';
            const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
            const { data } = await sb.from('pipeline_runs').select('id').limit(1);
            console.log('Keep-alive ping OK:', data?.length, 'row(s)');
          "
```

### 9.2 Vercel Configuration (EXTENDED)

```json
// vercel.json (in web/)
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**NEW: OG Meta Tag Middleware (v2.1 -- fixed for Vite, routing fixed per v2.1 challenge)**

**Why middleware, not an API route:** Crawlers (WhatsApp, Facebook, Twitter) visit the actual page URLs (`/`, `/deals`, `/compare/abc`), NOT `/api/og`. An API route at `/api/og` would never be reached by crawlers. Vercel Middleware intercepts ALL incoming requests before they reach the SPA, checks the user agent, and returns OG HTML for crawlers. Regular users pass through to the SPA unchanged.

Vercel supports `middleware.ts` for any framework (not just Next.js). The API surface uses standard `Request`/`Response` objects.

```typescript
// web/middleware.ts (Vercel Middleware -- runs on every request)
import { next } from '@vercel/edge'

const CRAWLER_USER_AGENTS = ['WhatsApp', 'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'Slackbot']

const OG_TAGS: Record<string, { title: string, description: string }> = {
  '/': {
    title: 'basketch -- Migros vs Coop deals this week',
    description: 'See which store has better deals this week. Migros vs Coop, compared.',
  },
  '/deals': {
    title: 'All deals this week -- basketch',
    description: 'Browse Migros and Coop deals side by side',
  },
  '/onboarding': {
    title: 'Set up your list -- basketch',
    description: 'Pick your regular groceries and compare deals',
  },
}

// Default for /compare/:id and unknown paths
const DEFAULT_OG = {
  title: 'My grocery deals -- basketch',
  description: 'See your personalized Migros vs Coop comparison',
}

export default function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent') || ''
  const isCrawler = CRAWLER_USER_AGENTS.some(bot => userAgent.includes(bot))

  if (!isCrawler) {
    // Not a crawler -- pass through to the SPA
    return next()
  }

  // Skip static assets -- crawlers requesting .js, .css, images should pass through
  const url = new URL(request.url)
  if (url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return next()
  }

  const path = url.pathname
  const og = OG_TAGS[path] || DEFAULT_OG
  const imageUrl = `${url.origin}/og-image.png`

  return new Response(
    `<!DOCTYPE html><html><head>
      <meta property="og:title" content="${og.title}" />
      <meta property="og:description" content="${og.description}" />
      <meta property="og:image" content="${imageUrl}" />
      <meta property="og:url" content="${url.href}" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="theme-color" content="#1a1a2e" />
    </head><body></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
```

**Vercel routing (vercel.json):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

No `/api/og` rewrite is needed. The middleware runs automatically on all matched requests before the SPA rewrite. Crawlers get OG HTML; regular users get the SPA.

OG tags for `/compare/:id` are static (no Supabase query needed) -- the Wordle card handles personalized sharing via screenshots.

**Alternative considered:** Pre-render all pages at build time using `vite-plugin-ssr` or migrate to Astro. Rejected for now because the middleware approach is simpler and sufficient for social sharing. Migration to Astro remains the plan for SEO (Phase 2+).

### 9.3 Supabase Setup

1. Create project on supabase.com (free tier)
2. Run SQL: create `product_groups` table first (referenced by others)
3. Run SQL: create `products` table
4. Run SQL: create `deals` table (with product_id FK)
5. Run SQL: create `pipeline_runs`, `starter_packs`, `favorites`, `favorite_items` tables
6. Run SQL: create all indexes
7. Run SQL: enable RLS + create all policies
8. Seed `product_groups` with ~37 rows
9. Seed `starter_packs` with 5 packs
10. Copy credentials to `.env` and GitHub Actions secrets

### 9.4 Environment Variables (unchanged from v1.1)

| Variable | Used by | Secret? |
|----------|---------|---------|
| `SUPABASE_URL` | Pipeline + Frontend | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline only | Yes |
| `VITE_SUPABASE_URL` | Frontend only | No |
| `VITE_SUPABASE_ANON_KEY` | Frontend only | No |

---

## 10. Technology Decisions

### ADR-001: Products Table for Product Identity (NEW)

**Status:** Accepted
**Date:** 2026-04-12

**Context:** The deals table stores product names as free text. There is no stable product identity across weeks or stores. Favorites matching relies on keyword hacks with exclude/prefer terms.

**Decision:** Introduce a `products` table that gives each real-world product a stable identity separate from weekly deals. Deals reference products via FK. Product groups link equivalent products across stores.

**Alternatives Considered:**
1. *Metadata columns on deals table.* Simpler migration but no stable identity, no cross-store matching, duplicated metadata across weeks. Rejected.
2. *AI/LLM-based matching.* Non-deterministic, costs money, overkill for 30-40 key products. Rejected.
3. *Fuzzy string matching.* German compound words break similarity scores. False positives worse than false negatives. Rejected.

**Consequences:**
- Easier: Cross-store matching, favorites matching, sub-category filtering, future price history
- Harder: Pipeline is more complex (metadata extraction + product resolution). Migration needs careful ordering.

### ADR-002: Manual Product Groups with Path to Automation (NEW)

**Status:** Accepted
**Date:** 2026-04-12

**Context:** Need to match "Migros Bio Vollmilch 1L" with "Coop Naturaplan Bio Milch 1 Liter" as the same product.

**Decision:** Product groups are manually curated reference data (~37 groups seeded from starter pack items). Automated matching (by sub_category + quantity + unit) is a future enhancement.

**Alternatives Considered:**
1. *Fully automated matching from day one.* Higher build effort, lower reliability for German compound words. Rejected for V1 scope.
2. *No cross-store matching.* Simpler but defeats the purpose of comparison. Rejected.

**Consequences:**
- Easier: Reliable matching for the products users care about (starter pack items)
- Harder: New products not in any group fall back to keyword matching. Group maintenance is manual.

### ADR-003: Vercel Middleware for OG Tags (UPDATED v2.1 -- fixed for Vite, routing fixed per v2.1 challenge)

**Status:** Accepted (updated implementation)
**Date:** 2026-04-12

**Context:** React SPA sets OG tags client-side via react-helmet-async. Social crawlers (WhatsApp, Facebook) don't execute JavaScript, so shared links appear as bare URLs. The v2.0 architecture incorrectly used Next.js middleware imports. The v2.1 initial approach used an API route at `/api/og`, but crawlers never visit `/api/og` -- they visit the actual page URLs (`/`, `/deals`, `/compare/abc`). The v2.1 challenge identified this routing gap as a must-do fix.

**Decision:** Use Vercel Middleware (`web/middleware.ts`) to intercept ALL incoming requests, detect crawler user agents, and return minimal HTML with correct OG tags. Regular users pass through to the SPA. Use static OG tags for `/compare/:id` (no Supabase query). Vercel supports `middleware.ts` for any framework, not just Next.js -- it uses standard `Request`/`Response` objects, not Next.js-specific imports.

**Alternatives Considered:**
1. *API route (`api/og.ts`).* Crawlers never visit `/api/og` -- they visit actual page URLs. Rejected (v2.1 challenge finding).
2. *Migrate to Astro/Next.js for SSR.* Correct long-term but premature for MVP. Accepted as Phase 2 plan.
3. *Pre-render pages at build time.* Works for static pages but comparison pages are dynamic. Rejected.
4. *Accept broken social previews.* WhatsApp sharing is a primary growth channel. Cannot accept. Rejected.

**Consequences:**
- Easier: Social sharing works from day one. No framework migration needed. Static OG tags keep the middleware simple.
- Harder: OG tag content defined in two places (middleware + react-helmet). Use `web/src/lib/og-tags.ts` as shared config to keep them in sync.

### ADR-004: Accessible Store Colors (NEW)

**Status:** Accepted
**Date:** 2026-04-12

**Context:** Migros orange (#FF6600) and Coop red (#E10A0A) are brand colors but fail WCAG AA contrast against white backgrounds for normal text.

**Decision:** Use brand colors for backgrounds and badges with dark text. Use darker variants (#CC5200 for orange text, #B80909 for red text) when text must appear on white backgrounds. Always pair color with text labels.

**Alternatives Considered:**
1. *Use brand colors as-is and accept contrast failures.* Violates WCAG 2.1 AA requirement. Rejected.
2. *Use completely different colors.* Loses brand recognition. Store colors are a core UX differentiator. Rejected.

**Consequences:**
- Easier: Accessible by default. No retrofit needed.
- Harder: Two color variants per store to manage (background/badge vs text-on-white).

### ADR-005: Simple Fetch + Cache over React Query (UPDATED v2.1)

**Status:** Accepted (changed from v2.0)
**Date:** 2026-04-12

**Context:** v2.0 accepted React Query. The v1 challenger weakened it (13KB for a problem that barely exists). The coding standards said "decision pending." The architecture and coding standards contradicted each other.

**Decision:** Use a custom `useCachedQuery` hook (~30 lines) with `localStorage` caching instead of React Query. Data changes once per week. There is no pagination, no infinite scroll, no mutations, no optimistic updates. The caching benefit (staleTime: 1 hour) is trivially achievable with localStorage + timestamp check.

**Implementation:**
```typescript
// web/src/lib/use-cached-query.ts
function useCachedQuery<T>(key: string, fetcher: () => Promise<T>, staleMinutes = 60) {
  // 1. Check localStorage for cached data + timestamp
  // 2. If cache is fresh (< staleMinutes old), return cached data
  // 3. Otherwise, fetch from Supabase, cache result, return data
  // 4. Handle loading/error states with useState
}
```

**Rationale:**
- Removes 13KB dependency (matters for < 2s mobile load target)
- Trivially understandable -- a non-developer PM can read and modify 30 lines of code
- All query functions in `queries.ts` remain unchanged -- only the calling pattern changes
- Loading, error, and success states still handled explicitly (three states rule from coding standards)

**Alternatives Rejected:**
1. *React Query.* Works but overkill. 13KB for weekly-updating data with no mutations.
2. *No caching.* Data fetched on every page load. Unnecessary Supabase reads for data that changes weekly.

**Doc sync note (v2.1 challenge):** `docs/coding-standards.md` Section 4 still says "Decision pending: React Query vs custom localStorage+fetch hook." This must be updated to reflect this decision: custom `useCachedQuery` hook, no React Query.

### ADR-006 through ADR-010 (unchanged from v1.1)

The following decisions from v1.1 remain valid:
- **Mixed pipeline language** (TypeScript + Python)
- **Tailwind + shadcn/ui for CSS**
- **Vitest for testing**
- **GitHub Actions for CI/CD**
- **Trunk-based development**

### ADR-011: Wordle Card Rendering (NEW v2.1)

**Status:** Accepted
**Date:** 2026-04-12

**Context:** The Wordle card is the primary WhatsApp growth mechanism. It needs to be renderable as an image for clipboard copy/download.

**Decision:** Render the card as HTML/CSS in the DOM, then use `html2canvas` to convert it to a PNG image for clipboard/download.

**Alternatives Considered:**
1. *Server-side image generation (e.g., @vercel/og or sharp).* More reliable rendering but adds server-side complexity. Rejected for V1 -- html2canvas is sufficient for a simple card layout.
2. *Canvas API directly.* Manual drawing is tedious and hard to maintain. Rejected.
3. *SVG rendering.* Good for simple graphics but painful for text layout. Rejected.

**Consequences:**
- Easier: Card design uses standard HTML/CSS. Easy to iterate on layout and colors.
- Harder: html2canvas has edge cases with certain CSS properties (shadows, filters). Keep the card design simple -- solid colors, large text, no fancy effects.

---

## 11. Performance Budgets & NFRs

### Performance

| Metric | Target |
|--------|--------|
| LCP (mobile, 4G) | < 2 seconds |
| API response (Supabase) | p50 < 200ms, p99 < 1s |
| Database queries | None over 100ms |
| Lighthouse Performance score | > 90 |
| JS bundle size (gzipped) | < 100KB |

### Reliability

| Metric | Target |
|--------|--------|
| Availability | Best-effort (free tier hosting). No SLA. |
| Pipeline success rate | > 90% of weekly runs fetch at least one store |
| Graceful degradation | If one store fails, show the other. If both fail, show stale data with warning. |

### Data Freshness

| Metric | Target |
|--------|--------|
| Deals updated | Every Thursday by 20:00 CET |
| Stale data warning | Shown if data > 7 days old |
| Partial data warning | Shown if one store's data is missing |

---

## 12. Risk Register

### R1: Data Source Becomes Unavailable (unchanged)
- **Likelihood:** Medium | **Impact:** High
- **Mitigation:** Fallback chain: aktionis.ch -> oferlo.ch -> Rappn.ch

### R2: Migros API Wrapper Breaks (unchanged)
- **Likelihood:** Medium | **Impact:** High
- **Mitigation:** aktionis.ch also lists Migros deals. Pepesto API as emergency backup.

### R3: Category Mapping Inaccuracy (unchanged)
- **Likelihood:** High | **Impact:** Low
- **Mitigation:** Start with top 100 keywords. Default to "Long-life". Log unmapped.

### R4: Legal / ToS Change (unchanged)
- **Likelihood:** Low | **Impact:** Medium
- **Mitigation:** Pre-validated backup sources.

### R5: Low User Adoption (unchanged)
- **Likelihood:** Medium | **Impact:** Low
- **Mitigation:** Portfolio project. PM process is the deliverable.

### R6: Data Freshness Gap (unchanged)
- **Likelihood:** Medium | **Impact:** Low
- **Mitigation:** Show validity dates. Stale data warning. V2: mid-week pipeline run.

### R7: Product Group Coverage Gaps (NEW)
- **Likelihood:** High | **Impact:** Medium
- **Risk:** Users search for products not in any product group. Keyword matching fallback may produce poor results.
- **Mitigation:** Starter packs cover the 37 most common products. Keyword matching remains as fallback. Monitor which searches fail and add product groups reactively.

### R8: OG Tag Middleware Sync (NEW)
- **Likelihood:** Low | **Impact:** Low
- **Risk:** OG tags in Vercel Middleware (`web/middleware.ts`) get out of sync with react-helmet tags in the SPA.
- **Mitigation:** Single source of truth for OG tag content (`web/src/lib/og-tags.ts` shared config imported by both middleware and react-helmet components). Keep middleware logic minimal.

### R9: Metadata Extraction Errors (NEW)
- **Likelihood:** Medium | **Impact:** Low
- **Risk:** Brand or quantity extraction from product names is wrong for some products.
- **Mitigation:** Extraction is additive -- wrong metadata doesn't break deal display. Products with bad metadata still show up; they just don't get product_group assignment. Fix extraction rules reactively based on pipeline logs.

---

## 13. Build Order

Each step is independently testable before proceeding to the next.

### Step 1: Shared Types + Supabase Setup
**Build:** `shared/types.ts` (all types including new Product, ProductGroup, BrowseCategory types), `shared/category-rules.ts` (with sub-categories), Supabase tables (product_groups, products, deals, pipeline_runs, starter_packs, favorites, favorite_items), indexes, RLS policies. Seed product_groups (~37 rows) and starter_packs (5 packs).
**Verify:** TypeScript compiles. SQL runs without errors. Product groups and starter packs are queryable.
**Why first:** Everything depends on types and schema.

### Step 2: Migros Source
**Build:** `pipeline/migros/fetch.ts`, `normalize.ts`
**Verify:** Outputs valid `UnifiedDeal[]`. Tests pass with fixture data.
**Why second:** Most constrained dependency (npm wrapper).

### Step 3: Coop Source
**Build:** `pipeline/coop/fetch.py`, `normalize.py`
**Verify:** Outputs valid JSON matching UnifiedDeal shape. Tests pass with HTML fixture.
**Why third:** Independent of Migros.

### Step 4: Metadata Extractor
**Build:** `pipeline/metadata.ts` (extractBrand, extractQuantity, isOrganic, detectProductForm)
**Verify:** Unit tests with 30+ product name fixtures. All extraction paths covered.
**Why fourth:** Pure function, no dependencies beyond types.

### Step 5: Categorizer + Product Resolver + Storage
**Build:** `pipeline/categorize.ts` (extended with sub-categories), `pipeline/resolve-product.ts`, `pipeline/store.ts` (extended with product_id), `pipeline/run.ts`
**Verify:** Feed JSON from Steps 2-3 through full pipeline. Check Supabase: deals have correct categories, sub-categories, and product_ids. Products table populated.
**Why fifth:** Depends on outputs from Steps 2-4 and schema from Step 1.

### Step 6: GitHub Actions Workflow
**Build:** `.github/workflows/pipeline.yml`
**Verify:** Manual trigger. Deals + products appear in Supabase. Partial failure handled correctly.
**Why sixth:** Orchestrates Steps 2-5.

### Step 7: Frontend Data Layer
**Build:** `web/src/lib/supabase.ts`, `queries.ts` (all query functions including `checkCoopProductExists` for two-tier status), `verdict.ts` (with min threshold + explanation), `matching.ts` (with product_group path), `use-cached-query.ts` (simple localStorage + fetch hook -- replaces React Query, see ADR-005)
**Verify:** Unit tests for verdict. Manual calls to all query functions. Two-tier Coop status query returns correct results.
**Why seventh:** Depends on data being in Supabase.

### Step 7b: Starter Pack Validation (pre-launch gate)
**When:** After pipeline has run 2-3 times (before sharing with friends)
**Action:** Run the validation query from Section 4.18 in Supabase SQL editor. Check each starter pack for Coop coverage.
**Decision criteria:** If a pack has > 3 items with zero Coop history, swap those items. Reorder items so both-store matches appear first.
**Why here:** Pipeline must have accumulated Coop product history before this step makes sense. This is a pre-launch gate, not a build step.

### Step 8: Frontend: Home Page + Verdict + Wordle Card (aha moment -- build first)
**Build:** `Home.tsx`, `VerdictBanner.tsx` (with explanation line, min threshold, store colors), `VerdictCard.tsx` (Wordle card with copy-to-clipboard via html2canvas), `CategorySection.tsx` (top deals per category), `DealCard.tsx`, `StoreBadge.tsx`, `DataWarning.tsx`, `ShareButton.tsx` (Web Share API), `EmailLookup.tsx` ("Already have a list?")
**Verify:** Verdict displays correctly for all states (normal, tie, stale, partial, no data). Wordle card renders and can be copied to clipboard. Share button works on mobile. Each component passes axe DevTools with zero critical violations.
**Why eighth:** The home page IS the first-visit experience. Build the aha moment first. Follows verdict-first sequencing.

### Step 9: Frontend: Deals Browsing Page
**Build:** `DealsPage.tsx`, `CategoryFilterPills.tsx`, `StoreGroup.tsx` (or adapt existing `CategorySection.tsx`)
**Verify:** All 11 sub-categories filter correctly. Side-by-side on desktop, stacked on mobile. 50-deal cap with "Show more." Empty category shows "No deals from [Store] in this category." Each component passes axe DevTools with zero critical violations.
**Why ninth:** Part of the first-visit experience (zero setup). Builds on data layer and shared components from Step 8.

### Step 10: Frontend: Onboarding Flow (retention feature)
**Build:** `TemplatePicker.tsx` (5 packs), `FavoritesEditor.tsx` (30-item cap), `ProductSearch.tsx`, `EmailCapture.tsx`, `Onboarding.tsx` page
**Verify:** Full onboarding flow works end-to-end. 30-item warning appears. Each component passes axe DevTools with zero critical violations.
**Why tenth:** Favorites are the retention hook, built after the aha moment features.

### Step 11: Frontend: Comparison + Return Paths (retention feature)
**Build:** `ComparisonView.tsx` (with two-tier Coop status messages, Coop transparency label, sort order: both-store first), `SplitList.tsx`, `FavoriteMatchCard.tsx`, `Compare.tsx` page, routing setup for all pages
**Verify:** Two-tier Coop status messages display correctly. Bookmark return path works. Email lookup works. Stale data warning shows correctly. Coop transparency label visible. Items sorted: both-store matches first.
**Why eleventh:** Ties together onboarding and data layer. Depends on two-tier status query from Step 7.

### Step 12: Frontend: OG Tags + Error Pages + Final Accessibility
**Build:** OG meta tags (react-helmet-async for browsers), Vercel Middleware (`web/middleware.ts`) for crawlers, `og-tags.ts` (shared config used by both middleware and react-helmet), 404 page, error boundary for invalid comparison IDs. Final accessibility sweep.
**Verify:** Share a link on WhatsApp -- rich preview appears. Navigate to invalid URL -- 404 page shows. Run axe DevTools on all pages -- zero critical violations. Keyboard navigation works throughout. All touch targets 44px+.
**Why twelfth:** Cross-cutting concerns, applied after core features work.

### Step 13: Deploy + Verify
**Build:** Vercel project setup, env vars, connect repo.
**Verify:** Visit deployed URL. Home page verdict + Wordle card. Deals browsing. Full onboarding flow. Return via bookmark. Return via email. Two-tier Coop status. WhatsApp share preview. Lighthouse audit > 90. Mobile responsive. Check Vercel deployment status after push.
**Why last:** Everything must work locally first.

---

## 14. Cost Analysis

### Current Load (10-50 users)

| Service | Usage | Cost |
|---------|-------|------|
| Supabase | ~20K rows, ~50 reads/day, 7 writes/week | Free tier (500MB, 50K rows) |
| Vercel | ~200 page views/week, static SPA | Free tier |
| GitHub Actions | ~10 min/week (2 pipeline runs) | Free (public repo) |
| Domain | basketch.vercel.app | Free |
| **Total** | | **CHF 0/month** |

### At 10x (100-500 users)

| Service | Usage | Cost |
|---------|-------|------|
| Supabase | ~30K rows, ~500 reads/day, 7 writes/week | Still free tier |
| Vercel | ~2000 page views/week | Still free tier |
| GitHub Actions | Same pipeline, no change | Free |
| Domain | basketch.ch (if purchased) | ~CHF 15/year |
| **Total** | | **CHF 0-1.25/month** |

Both loads are well within free tier limits for all services.

---

## Folder Structure (updated)

```
basketch/
├── .github/
│   └── workflows/
│       └── pipeline.yml
│
├── pipeline/
│   ├── migros/
│   │   ├── fetch.ts
│   │   ├── normalize.ts
│   │   ├── fetch.test.ts
│   │   └── fixtures/
│   ├── coop/
│   │   ├── fetch.py
│   │   ├── normalize.py
│   │   ├── test_fetch.py
│   │   ├── fixtures/
│   │   └── requirements.txt
│   ├── metadata.ts              # NEW: extractBrand, extractQuantity, isOrganic
│   ├── metadata.test.ts         # NEW
│   ├── resolve-product.ts       # NEW: find/create product, assign group
│   ├── resolve-product.test.ts  # NEW
│   ├── categorize.ts            # EXTENDED: now returns sub_category
│   ├── categorize.test.ts
│   ├── store.ts                 # EXTENDED: upserts products + deals with product_id
│   ├── store.test.ts
│   ├── run.ts                   # EXTENDED: includes metadata + product resolution steps
│   ├── package.json
│   └── tsconfig.json
│
├── web/
│   ├── middleware.ts             # v2.1: Vercel Middleware for OG tags (intercepts crawler requests)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── queries.ts       # EXTENDED: new query functions + checkCoopProductExists
│   │   │   ├── verdict.ts       # EXTENDED: min threshold, explanation
│   │   │   ├── matching.ts      # EXTENDED: product_group matching path
│   │   │   ├── use-cached-query.ts # v2.1: simple localStorage+fetch hook (replaces React Query)
│   │   │   └── og-tags.ts       # NEW: shared OG tag config (used by edge function + react-helmet)
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── VerdictBanner.tsx # EXTENDED: explanation line, min threshold
│   │   │   ├── VerdictCard.tsx   # v2.1: Wordle card (screenshot sharing, html2canvas)
│   │   │   ├── ShareButton.tsx   # v2.1: Web Share API with clipboard fallback
│   │   │   ├── CategorySection.tsx
│   │   │   ├── DealCard.tsx
│   │   │   ├── StoreBadge.tsx
│   │   │   ├── DataWarning.tsx
│   │   │   ├── TemplatePicker.tsx # EXTENDED: 5 packs
│   │   │   ├── FavoritesEditor.tsx # EXTENDED: 30-item cap
│   │   │   ├── ProductSearch.tsx
│   │   │   ├── ComparisonView.tsx # v2.1: two-tier Coop status, transparency label
│   │   │   ├── SplitList.tsx
│   │   │   ├── FavoriteMatchCard.tsx
│   │   │   ├── EmailCapture.tsx
│   │   │   ├── EmailLookup.tsx
│   │   │   ├── CategoryFilterPills.tsx  # NEW: deals browsing
│   │   │   ├── StoreGroup.tsx           # NEW: deals browsing
│   │   │   └── OgHead.tsx              # NEW: per-page OG tags (react-helmet-async)
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Onboarding.tsx
│   │   │   ├── Compare.tsx
│   │   │   ├── Deals.tsx        # NEW: deals browsing page
│   │   │   ├── About.tsx
│   │   │   └── NotFound.tsx     # NEW: 404 page
│   │   └── index.css
│   ├── public/
│   │   ├── favicon.svg
│   │   └── og-image.png         # NEW: 1200x630 social preview image
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── shared/
│   ├── types.ts                 # EXTENDED: Product, ProductGroup, BrowseCategory types
│   └── category-rules.ts       # EXTENDED: sub-category rules
│
├── docs/
│   ├── prd.md
│   ├── use-cases.md
│   ├── product-data-architecture.md
│   ├── technical-architecture.md       # v1.1 (kept for reference)
│   └── technical-architecture-v2.md    # This document
│
├── .env.example
├── package.json
├── tsconfig.base.json
└── README.md
```

---

## Self-Check

- [x] Every module has a clear single responsibility
- [x] Each module can be tested independently (fixtures, mocks, isolated entry points)
- [x] Folder structure is navigable by a newcomer
- [x] No circular dependencies (sources -> metadata -> categorizer -> product resolver -> storage -> Supabase -> frontend)
- [x] Right-sized: no ORM, no migration framework, no monorepo tooling, no logging service, no auth service, no React Query
- [x] At least 2 alternatives considered for every major decision (ADR-001 through ADR-011)
- [x] Security addressed: RLS, secrets management, input validation, OWASP review, favorites RLS limitation documented
- [x] Observability addressed: pipeline logging, data freshness checks, health indicators, kill criteria monitoring
- [x] Failure modes identified for every external dependency (Migros API, aktionis.ch, Supabase)
- [x] Cost implications quantified (CHF 0/month at current and 10x load)
- [x] All environment variables and secrets accounted for
- [x] Build order ensures each step is independently verifiable
- [x] Feature sequencing reflected: verdict + deals browsing (aha moment) built before favorites (retention)
- [x] v2.0 requirements addressed: products table, metadata extraction, 5 starter packs, deals browsing, dual return paths, verdict formula, accessibility, error pages, 30-item cap, store colors, stale data warnings
- [x] v2.1 requirements addressed: Wordle card component, two-tier Coop status, OG tags fixed for Vite, Web Share API, starter pack validation, discount_percent NOT NULL, updated_at trigger, React Query resolved, cron off-peak, date filter safety net, kill criteria monitoring, pre-launch pipeline requirement
- [x] Accessibility: contrast ratios calculated, darker color variants specified, color+text pairing required, per-component axe DevTools verification in build steps
- [x] OG tags: Vercel Middleware (`web/middleware.ts`) intercepts crawler requests on all URLs + react-helmet for browsers
- [x] Challenger v2 findings resolved: all 6 must-do gaps addressed (Wordle card, two-tier status, OG Vite fix, discount_percent, updated_at trigger, React Query decision)
- [x] Challenger v2.1 findings resolved: OG routing fixed (middleware, not API route), BROWSE_CATEGORIES mapping defined, contrast values corrected, html2canvas lazy-load noted, coding standards sync flagged

---

## What Changed from v2.0 (v2.1 Summary)

| Area | v2.0 | v2.1 |
|------|------|------|
| **Feature sequencing** | Not specified | Verdict-first (aha moment), favorites second (retention) |
| **Wordle card** | Not in architecture | Full component spec: VerdictCard.tsx, html2canvas, copy-to-clipboard |
| **Two-tier Coop status** | Not in architecture | Query logic, component behavior, display states, sort order |
| **OG tags** | Next.js middleware (wrong for Vite) | Vercel Middleware (`web/middleware.ts`) intercepts all requests, serves OG HTML to crawlers, passes through to SPA for browsers. Static tags for /compare. |
| **Web Share API** | Not addressed | ShareButton.tsx with navigator.share() + clipboard fallback |
| **Data caching** | React Query (13KB, accepted) | Custom useCachedQuery hook (30 lines, localStorage) |
| **discount_percent** | Nullable in schema, non-null in coding standards | NOT NULL enforced in schema |
| **updated_at trigger** | Missing (v1 finding still open) | Trigger added for deals, products, favorites tables |
| **Cron timing** | Top-of-hour (:00) | Off-peak (:17) to avoid GH Actions congestion |
| **Date filter** | Not on frontend queries | `.gte('valid_to', today)` safety net added |
| **Starter pack validation** | Not specified | Pre-launch SQL query + decision criteria |
| **Kill criteria monitoring** | Not in architecture | Monitoring plan for all 8 PRD kill criteria |
| **RLS limitation** | Not documented | Favorites wide-open access documented as known limitation |
| **Build steps** | 12 steps | 13 steps (reordered: verdict/home first, favorites later, added validation gate) |
| **New files** | — | VerdictCard.tsx, ShareButton.tsx, use-cached-query.ts, middleware.ts (Vercel Middleware for OG tags) |

## What Changed from v1.1 to v2.0 (Historical Summary)

| Area | v1.1 | v2.0 |
|------|------|------|
| **Data model** | deals + pipeline_runs + starter_packs + favorites | + products + product_groups. deals extended with sub_category and product_id |
| **Pipeline** | Fetch -> normalize -> categorize -> store | + metadata extraction + product resolution |
| **Starter packs** | 4 packs | 5 packs (added Familientisch) |
| **Matching** | Keyword-only | Product group (primary) + keyword (fallback) |
| **Deals browsing** | Not in v1.1 | Full browsing page with 11 sub-categories |
| **Return paths** | Email primary, URL secondary | Both primary |
| **Verdict** | Basic formula, no transparency | 40/60 formula, 5% tie, min 3 deals, explanation line |
| **OG tags** | Not addressed | Edge Middleware for crawlers + react-helmet |
| **Accessibility** | Mentioned | WCAG 2.1 AA spec'd with color solutions |
| **Error pages** | Not addressed | 404 + invalid comparison ID |
| **Basket cap** | Not addressed | 30-item soft cap |
| **Store colors** | Not spec'd | #FF6600 (Migros), #E10A0A (Coop) with accessible variants |
| **Build steps** | 10 steps | 12 steps (added metadata extractor, deals page, OG+errors+a11y) |
