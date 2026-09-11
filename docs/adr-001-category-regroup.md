# ADR-001: Regroup categories by product family; make storage an attribute

**Status:** Proposed
**Date:** 2026-09-10
**Decides:** D8 in `docs/component-2-decisions.md`
**Raised by:** architecture review finding A3 — this is a **one-way door** on the database and needs
its own record rather than riding along inside the component 2 build.

---

## Context

`Category = 'fresh' | 'long-life' | 'non-food'` is the top-level grouping. It is not only a UI
concern:

| Where | What breaks |
|---|---|
| `shared/types.ts:61` | the `Category` union itself |
| `shared/types.ts` `StarterPackItem.category` | all 5 starter packs |
| `BROWSE_CATEGORIES[].topCategory` | all 19 entries |
| `web-next/src/lib/category-rules.ts:12` | `ACTIVE_CATEGORIES` |
| `web-next/src/lib/filters.ts:16,23` | URL filter parsing + mapping |
| `web-next/src/lib/store-tokens.ts:33` | `CATEGORY_KEYS` |
| `web-next/src/components/deals/FilterRail.tsx:24` | the filter rail |
| `web-next/src/components/deals/TypeSegmented.tsx:10` | the segmented control |
| `web-next/src/server/data/supabase-provider.ts:41-42` | DB→UI value mapping |
| Supabase `deals` table | **a column value on every row** |

That last line is what makes this a one-way door: changing the grouping rewrites live data.

**The forcing problem — ice cream.** The current design stacks two different axes:

```
fresh / long-life / non-food     ← a STORAGE axis
dairy / snacks-sweets / drinks   ← a PRODUCT-FAMILY axis
```

It holds until ice cream: a sweet (family) that is frozen (storage), where "Long-life" is simply
wrong. Same for frozen peas, frozen mango, fish fingers.

Notably, **Open Food Facts makes this same mistake** — `Frozen foods` is a top-level root with 68
children in their 14,675-category taxonomy. Being an established standard did not save them from it.

---

## Decision

Separate the axes.

**Family becomes the grouping** — three groups: `food-drinks`, `non-food`, `general-merchandise`.
**Storage becomes a cross-cutting attribute** — `fresh | chilled | frozen | ambient` — filterable
across every category.

```
Ice cream       snacks-sweets / ice-cream        storage=frozen
Frozen peas     fruits-vegetables / vegetables   storage=frozen
Frozen mango    fruits-vegetables / fruit        storage=frozen
Fish fingers    meat-fish / fish                 storage=frozen
Butter          dairy / dairy                    storage=chilled
Chocolate       snacks-sweets / chocolate        storage=ambient
```

"Cheapest mango" now finds fresh *and* frozen. Shoppers can still browse a frozen aisle, because
storage is a facet.

**Nothing is deleted.** `ready-meals-frozen` keeps its identity and gains `storage` alongside. No
category is removed — per explicit PM instruction, this change is additive only.

---

## Alternatives considered

**A. Keep four groups (`fresh`, `long-life`, `non-food`, `general-merchandise`).**
Preserves the shipped filter rail; zero data migration. Rejected: it keeps the two axes stacked, so
ice cream stays mis-filed and the same bug recurs for every frozen product. Deferring a one-way door
does not make it cheaper.

**B. Frozen as a category — everything frozen in one bucket.**
Matches how a supermarket is physically laid out and matches Open Food Facts. Rejected: it breaks
comparison, which is basketch's entire purpose. Frozen mango would sit nowhere near fresh mango, so
"cheapest mango" would silently miss half the answer.

**C. Adopt Open Food Facts / GS1 GPC wholesale.**
Rejected on evidence. Open Food Facts *is* reachable but is the wrong shape — its top level is
`Meals · Frozen foods · Desserts · Sandwiches · Terrines · Breaded products · Food additives`. That
classifies what a food *is* (composition and processing), not where a shopper finds it. Nobody shops
the Terrines aisle.

**D. Adopt Migros' shop taxonomy. — ADOPTED as the base, with deviations (see §Migros below).**
Migros returns 403 to automated clients and the Internet Archive was offline, so the tree was
supplied by the PM as screenshots on 2026-09-10. It is the best-validated Swiss grocery navigation
in existence — millions of shoppers, iterated for years.

---

## Migros as the reference taxonomy

**Migros' 19 top-level categories** (migros.ch → All products):

```
Specific diets · Fruits & vegetables · Meat & fish · Dairy, eggs & fresh convenience food
Bread, pastries & breakfast · Pasta, condiments & canned food · Snacks & sweets · Frozen food
Drinks, coffee & tea · Wine, beer & spirits · Pets · Baby and kids · Beauty & health
Household & cleaning · Home & kitchen · Stationery, office & electronics accessories
Garden & outdoor living · Games, hobbies & gifting · Clothing and accessories
```

### What we adopt

| Change | Why |
|---|---|
| **Split `Wine, beer & spirits` from `Drinks, coffee & tea`** | Not arbitrary — age-restricted stock with its own Swiss advertising rules. We had merged them. |
| **Add `Home & kitchen`** | Cookware, utensils, storage. Distinct from appliances; we had no home for it. |
| **Fold electronics into `Stationery, office & electronics accessories`** | Matches Migros; gives the Bosch Tassimo a real home alongside `appliances`. |

### The decisive insight — navigation ≠ data model

Migros keeps **`Frozen food` as a category**, exactly like Open Food Facts, and exactly as this ADR
argues is wrong for comparison. And `Specific diets` contains Gluten-free, Lactose-free, Vegetarian,
Vegan, Organic — which are plainly **attributes**, not categories.

Migros is not being sloppy. **Migros is a shop; basketch is a comparison tool.** Shoppers expect a
frozen aisle. Comparison requires frozen mango to sit beside fresh mango. Both are correct for their
own job.

**So we do both, and they do not conflict:**

```
DATA MODEL     storage = frozen | chilled | fresh | ambient   → "cheapest mango" spans both
               organic / vegan / glutenFree / lactoseFree     → already cross-cutting fields

NAVIGATION     "Frozen food" browse tile     = a saved filter over storage=frozen
               "Specific diets" browse tile  = a saved filter over the diet attributes
```

A browse tile is a **pre-set filter**, not a category. Migros gets browsable aisles; we keep
comparability. This resolves the ice-cream problem without giving up the aisle shoppers expect.

### Where we deviate deliberately

| Deviation | Reason |
|---|---|
| Keep `diy-tools` | Migros does not sell tools (that is Do it + Garden, a separate chain). Lidl and Aldi sell them weekly, and we cover Lidl and Aldi. |
| Keep `pasta-rice-cereals` and `pantry-canned` separate | Migros merges them into one. Ours is finer-grained, which suits per-item price comparison — pasta and tinned tomatoes are not substitutes. Revisit if it proves too fine. |
| `storage` and diets stay attributes | Per the insight above. Browse tiles provide the navigation. |

---

## Consequences

**Easier**
- Ice cream, frozen vegetables and frozen fruit get correct, comparable homes
- Cross-store comparison spans storage states — the core product promise
- Adding a category no longer requires deciding its shelf life
- One axis per question; no more "is this fresh or long-life?" for shelf-stable desserts

**Harder**
- Frontend refactor across 6 files (listed above), not a constants edit
- A data migration over every row in `deals`
- Three groups instead of four means the shipped `Fresh | Long-life | Household` rail changes, and
  users who navigate by it must relearn it

**Risks accepted**
- Storage state is unknown for many products; `storage` will frequently be `null`. Per the
  never-infer rule that is correct, but the frozen filter will under-return until coverage improves.
- Assigning storage for non-food (`ambient` for a drill) is meaningless. Storage applies to
  `food-drinks` only; elsewhere it stays `null`.

---

## Migration plan — additive, reversible until the last step

The one-way door is only one-way if we walk through it in a single step. We do not.

1. **Add** `family_group` alongside the existing `category` column. Do not drop anything.
2. **Backfill** `family_group` from the existing category mapping. Both columns valid, both correct.
3. **Add** `storage` as a nullable attribute; populate where known, leave `null` otherwise.
4. **Frontend reads `family_group`** behind a flag; the old rail still works from `category`.
5. **Verify** on live data across a full pipeline cycle.
6. **Only then** retire the old column — and this is the sole irreversible step.

Steps 1–5 are two-way doors. Rollback at any point is deleting a column nothing reads yet.

---

## Sequencing

**Not part of the component 2 build.** Component 2 (classifier, agent, cache) targets
`BROWSE_CATEGORIES` and sub-categories, which are unchanged by this ADR. The regroup is a parallel
frontend + data workstream.

Doing them together would make one failure look like the other, and would put a live data migration
on the critical path of a classifier rewrite.

---

## Open

- Does `storage` belong on the deal row or inside `attributes` jsonb? Leaning column — it is
  filterable on every query and deserves an index.
- Do the three group labels need i18n before launch? The site is DE/FR/IT.
