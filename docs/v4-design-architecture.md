# basketch — v4 Design Architecture

_Principal designer / architecture spec — fixes for issues found in the live app (basketch.vercel.app) as of Apr 22, 2026._

---

## §0  TL;DR for the dev team

The live Water band compares a LIDL PET case (probably 6×1.5L) against a premium Elmer Schnitzwasser glass bottle and shows "+5.20" as the delta. That delta is wrong not because the math is wrong — it's wrong because the two rows aren't the same thing. Water isn't one product; it's a category spanning still / sparkling, PET / glass, single bottle / multipack. The app must:

1. Model **format** and **pack size** as first-class fields.
2. Compute **CHF per litre** (or per kg / per piece, by category) and rank on that.
3. Never display a delta between rows of different format.
4. Let the user pick format with a chip strip *inside* the band.

Every other v4 fix (WhatsApp verdict, bottom-sheet filters, product photos, proper icons, single region chip, taxonomy cleanup) stacks on top of this foundation.

---

## §1  The Water-band defect — what's actually broken

Currently shown in the Water band:

| Row | Store | Product | Shown price | Delta vs cheapest |
|---|---|---|---|---|
| Hero | LIDL | schweizer mineralwasser | CHF 2.60 (−28%) | — |
| 1 | Denner | henniez mineralwasser naturelle | CHF 2.95 | +0.35 |
| 2 | Coop | knutwiler blau mineralwasser mit kohlensäur… | CHF 4.10 | +1.50 |
| 3 | Migros | evian mineralwasser | CHF 4.42 | +1.82 |
| 4 | SPAR | rhäzünser mineralwasser mit kohlensäure | CHF 4.50 | +1.90 |
| 5 | Volg | elmer schnitzwasser | CHF 7.80 | +5.20 |

Defects visible in this single band:

1. **Mixed formats presented as comparable.** Naturelle (still) is ranked against mit Kohlensäure (sparkling). Someone who drinks only sparkling is told LIDL is cheapest — but LIDL's row isn't sparkling.
2. **No pack size.** The CHF 2.60 is almost certainly a 6-pack of 1.5L (9L total). The CHF 7.80 Elmer is almost certainly a single or small pack of 1L glass. CHF/L would flip the verdict completely (LIDL ≈ CHF 0.29/L vs Elmer ≈ CHF 1.30/L — still cheaper, but nowhere near "+5.20").
3. **Truncation with no recovery.** "mit kohlensäur…" drops the most important attribute of the product.
4. **LIDL brand color wrong.** The badge is navy; LIDL's real brand mark is yellow + red.
5. **All-lowercase product names** read as raw DB field output, not a designed surface.
6. **No product photos.** Every row is text-only; this is the single biggest contributor to the "Miro prototype" feeling the user called out.
7. **Cheapest hero dwarfs the ladder rows.** The imbalance tells the user the hero is the answer — but because the hero is a different format than some ladder rows, the visual hierarchy is actively misleading.
8. **"No Water deals at: ALDI"** footer is correct, but shows ALDI not one of the 6 stores — inconsistent with "6 deals across 6 stores" header, which should read "6 deals across 7 stores · 1 store has none."

---

## §2  Design principles for v4

| # | Principle | Why |
|---|---|---|
| P1 | **Never compare two SKUs without a normalised unit.** Liquids → CHF/L. Solids → CHF/kg. Count items → CHF/piece. Coffee/tea → CHF/100g. | Delta is the whole value proposition. If the delta is dishonest, the app has no value. |
| P2 | **CHF/L is the dominant price; pack price is secondary.** | Users buy packs but compare per-litre. Show both, unit-price wins the type scale. |
| P3 | **Segment by format before by brand.** Still and sparkling are different products. | Mixing them is the same mistake as mixing milk and juice. |
| P4 | **Delta only renders when format matches.** Otherwise show "— different format". | Preserves trust. |
| P5 | **Photography over iconography.** Every deal has a photo slot; fallback is a neutral tile with store monogram — not an emoji. | Emoji-as-UI is what makes the app feel like a prototype. |
| P6 | **Neutral surface, accent with brand.** Card is white; brand colour is a 4-px left accent and a small brand tag only. | Green/red filled cards look like sticky notes; Migros-class apps use neutral cards. |
| P7 | **Equal visual weight between hero and ladder rows.** Hero is highlighted by accent + badge, not by 3× scale. | Ladder rows currently look abandoned. |
| P8 | **Honest framing when data is imperfect.** If a taxonomy confidence is low, say so; if a format is mixed, say so. | Hiding uncertainty erodes trust faster than exposing it. |

---

## §3  Data model — additions required

Every Deal row must carry:

```ts
type Format = 'still' | 'sparkling' | 'lightly-sparkling' | 'flavoured';
type Container = 'pet' | 'glass' | 'can' | 'carton' | 'pouch';
type CanonicalUnit = 'L' | 'kg' | '100g' | 'piece';

interface Deal {
  id: string;
  brand: string;              // 'LIDL', 'Henniez', 'Evian', 'Elmer Schnitzwasser', ...
  productName: string;        // full name, source-cased
  subCategoryId: string;      // 'water'

  // Format dimensions — per sub-category schema
  format: Format;
  container: Container;
  packSize: number;           // 1, 6, 12, ...
  unitVolumeMl?: number;      // for liquids
  unitWeightG?: number;       // for solids
  unitCount?: number;         // for count items (eggs, rolls)

  // Derived
  canonicalUnit: CanonicalUnit;
  canonicalUnitValue: number; // e.g. 9 (litres for a 6×1.5L pack)
  pricePerUnit: number;       // e.g. 0.29 (CHF per litre)

  // Price
  priceChf: number;
  regularPriceChf: number | null;
  discountPct: number | null;

  store: StoreId;
  photoUrl?: string;          // null → fallback tile
  taxonomyConfidence: number; // 0..1
  userCorrected?: boolean;
}
```

### Sub-category schema

```ts
interface SubCategorySchema {
  id: string;
  label: string;               // 'Water'
  icon: IconRef;               // stroke icon, not emoji
  canonicalUnit: CanonicalUnit;
  formatDimensions: Dimension[];
  // Default filter on entry, if any
  defaultFormat?: string;
}

// Water
{
  id: 'water',
  label: 'Water',
  icon: 'droplet',
  canonicalUnit: 'L',
  formatDimensions: [
    { id: 'format', label: 'Type', values: ['still', 'sparkling', 'lightly-sparkling'] },
    { id: 'container', label: 'Container', values: ['pet', 'glass', 'can'] },
    { id: 'packClass', label: 'Pack', values: ['single', 'multipack'] },
  ],
  defaultFormat: 'still',
}
```

Same treatment for: milk (whole/semi/skim; lactose-free), juice (100% / nectar), bread (loaf / roll / sliced; white / whole-grain), chicken breast (fresh / frozen; per kg / per piece), coffee (beans / ground / pods), eggs (size / free-range / organic).

---

## §4  The fixed Water band (v4 spec)

### Header
```
💧 Water · 7 stores · 1 without deals   [Still ▾]
```

### Format chip strip (sticky within band, scrollable on mobile)
```
[Still · 4]  [Sparkling · 2]  [PET pack]  [Glass bottle]
```
Default selection is `Still` if that's the most populated format. Tapping a chip re-ranks the hero + ladder instantly without a page reload.

### Hero card (selected format: Still)
```
┌─────────────────────────────────────────────┐
│ [photo 72×72]  ★ CHEAPEST  LIDL             │
│                Schweizer Mineralwasser       │
│                Still · 6 × 1.5 L · 9 L       │
│                                              │
│                CHF 0.29 / L                  │  ← primary
│                CHF 2.60  ̶C̶H̶F̶ ̶3̶.̶6̶5̶  −28%        │  ← secondary
│                                      [ ＋ ]  │
└─────────────────────────────────────────────┘
```

### Ladder row (same format: Still)
```
│ [img 48×48]  Denner · Henniez Naturelle         │
│              Still · 1.5 L                      │
│              CHF 1.97 / L   ·   CHF 2.95        │
│              +CHF 1.68 / L vs LIDL     [ ＋ ]   │
```
Note: delta is expressed in CHF/L, not pack-level CHF.

### Different-format row (if shown with "All formats")
```
│ [img 48×48]  Coop · Knutwiler Blau mit Kohlensäure │
│              Sparkling · 1 L                       │
│              CHF 4.10 / L   ·   CHF 4.10           │
│              ⚠ Different format — not comparable   │
```

### No-deal footer
```
📫 No still water deals at: ALDI, Volg
```

### Annotations
- Hero and ladder cards have equal visual weight; accent is a 4px brand strip + photo, not a scale jump.
- Photo fallback is a 72×72 (or 48×48) neutral #F5F5F4 tile with brand monogram + store color accent.
- Full product name truncates only at ladder size; hover/tap shows full name. Hero never truncates.

---

## §5  All v4 fixes, consolidated

| # | Issue user raised | Fix |
|---|---|---|
| 1 | Verdict uses Copy / Download | Verdict CTA is **`Send to WhatsApp`** — opens `https://wa.me/?text=<urlencoded>` with a pre-written line: "basketch: Coop wins this week by 4% — 12 deals, 24% avg off. See list → https://basketch.app/v/<id>". Secondary (smaller) Copy link still available. |
| 2 | Whole app feels like Miro / drawing board | Neutral-first surface (P6). Photo-first cards (P5). Stroke icons (Lucide). Typography scale `28 / 22 / 17 / 14 / 12` with strict line-heights. 12 / 8 / 4 px radius scale. Brand colours reserved for 4-px accents and pill tags. |
| 3 | Mobile filters sit on top, not smooth | Filter trigger is a **sticky top bar** `[Category ▾] [Format ▾] [Sort ▾] [⚙ N]`. Tapping opens a **bottom sheet** (60 vh, radius 16 top corners, drag handle, scrim). `[Apply]` closes; `[Clear]` keeps sheet open. Sheet is dismissible by drag, scrim tap, or back gesture. |
| 4 | Deals show only few stores | v3 already has all 7 stores in ladder; v4 adds format segmentation so the ranking is honest. |
| 5 | Sub-category icons are funny emoji | Replace emoji with Lucide stroke icons at 20×20, 1.5px stroke, `currentColor`. Map: water→droplet, milk→milk, juice→glass-water, beer→beer, bread→wheat, chicken→drumstick (or Phosphor `Bird`), fruit→apple, vegetables→carrot. |
| 6 | Deals have no pictures | `photoUrl` per deal, CDN-served at 72×72 / 48×48 / 40×40 (retina 2×). Fallback tile = #F5F5F4 with monogram. Photos use `object-fit: contain` on white to match store e-commerce style. |
| 7 | Cheapest is a big block, rest are tiny | Equal card height (hero and ladder both). Hero is marked by: ★ CHEAPEST pill + brand-coloured left accent + slightly larger price type — not by 3× scale. |
| 8 | Want professional web app, not prototype | Combination of 1–7. Also: remove emoji section headers, use Title Case for product names, show pack format explicitly, add CHF/L everywhere. |
| 9 | (new) Water isn't one product — multiple formats, sizes | §4 format-aware bands. |
| 10 | "_uncategorised" leaking | Any null / unknown category renders as **"Other"** (never the raw field). Add `taxonomyConfidence < 0.7` badge "?" with tooltip "We weren't sure where to put this — tell us." |
| 11 | Miscategorised items (sauce in Fruit, etc.) | Same taxonomy-confidence pass. Plus **`Wrong category?` link** per row → submits a correction. |
| 12 | Double region chip (header + left rail) | Single chip in header only. Left-rail chip removed. |
| 13 | Product names all lowercase | Title-case at display time; preserve source casing for branded names (LIDL, SPAR, Elmer Schnitzwasser). |
| 14 | Truncation with no recovery | Name truncates with `text-overflow: ellipsis`; hover/long-press shows full name in a tooltip; tapping the row expands it to show full name + format details inline. |
| 15 | LIDL brand colour wrong | Official palette: yellow #FFF000 (bg) + red #E10915 (text). Similarly: Migros orange #FF6600, Coop red #E30613, Denner red #E20613, ALDI blue #00225E, SPAR red #E30613 + green #009640, Volg red #E30613 + yellow #FFDD00. |

---

## §6  Component spec (developer-ready)

```tsx
// Band primitive
<DealBand
  category="water"
  deals={deals}              // filtered to this sub-category
  formatFilter={null}        // null = auto-pick most populated format
  onAdd={(dealId) => void}
  onCorrect={(dealId) => void}
/>
  └─ <BandHeader label icon storesWith storesTotal formats />
  └─ <FormatChips dimensions selected onChange />
  └─ <Hero deal={cheapestOfSelectedFormat} />
  └─ <Ladder deals={rest} cheapestPricePerUnit />
  └─ <NoDealFooter storesWithoutDeals />

// Ladder row
<LadderRow
  deal={deal}
  cheapestPricePerUnit={0.29}      // CHF/L of the hero
  sameFormat={true}
/>
// Renders:
//   delta = sameFormat ? `+CHF ${(deal.pricePerUnit - cheapestPricePerUnit).toFixed(2)}/L` : '— different format'
```

### Price-per-unit helper
```ts
function pricePerUnit(deal: Deal): number {
  switch (deal.canonicalUnit) {
    case 'L':      return deal.priceChf / (deal.canonicalUnitValue);
    case 'kg':     return deal.priceChf / (deal.canonicalUnitValue);
    case '100g':   return deal.priceChf / (deal.canonicalUnitValue / 100);
    case 'piece':  return deal.priceChf / deal.canonicalUnitValue;
  }
}
```

### Format chip logic
```ts
function defaultFormat(deals: Deal[], schema: SubCategorySchema): string | null {
  const counts = count(deals, d => d.format);
  const top = max(counts);
  if (top.count === 0) return null;
  return top.format;
}
```

---

## §7  Mobile filter bottom-sheet spec

```
╭─────────────────────────────╮ ← drag handle
│ Filters            [× Close]│
├─────────────────────────────┤
│ Category                    │
│ [All] [Fresh] [Pantry] …    │
│                             │
│ Sub-category                │
│ [Water ✓] [Milk] [Juice] …  │
│                             │
│ Format                      │
│ [Still ✓] [Sparkling]       │
│                             │
│ Sort                        │
│ ○ Cheapest CHF/L            │
│ ● Biggest % off             │
│ ○ Recently added            │
├─────────────────────────────┤
│ [Clear]          [Apply (4)]│
╰─────────────────────────────╯
```
- Height 60 vh; scrolls internally.
- `Apply` closes sheet + applies filter + announces count via toast.
- `Clear` resets form without closing.
- Scrim is rgba(0,0,0,0.4).
- Entry: slide-up 200 ms ease-out. Exit: 150 ms.

---

## §8  Verdict → WhatsApp deep link spec

```ts
function verdictWhatsAppUrl(verdict: Verdict): string {
  const text = [
    `basketch verdict`,
    `${verdict.winner} wins by ${verdict.marginPct}% this week`,
    `${verdict.dealCount} deals · ${verdict.avgDiscount}% avg off`,
    `See list → https://basketch.app/v/${verdict.id}`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
```

Primary verdict CTA: `📲 Send to WhatsApp` (full-width). Secondary `Copy link`. Tertiary `Export PDF` (behind "⋯ More"). No image download on primary path — opens share sheet on iOS/Android, `wa.me` on desktop.

---

## §9  Acceptance criteria (dev checklist)

- [ ] No band shows a CHF delta between rows of different format.
- [ ] Every deal row shows canonical unit price (CHF/L, CHF/kg, etc.).
- [ ] Every sub-category has at least one format dimension populated in metadata.
- [ ] No product name is truncated without a tooltip + tap-to-expand.
- [ ] LIDL badge renders #FFF000 on #E10915 (or inverse with AA contrast).
- [ ] Verdict CTA is WhatsApp deep link, opens `wa.me` URL with correct URL-encoded text.
- [ ] Mobile filter is a bottom sheet; no stacked filter rail on screens <768 px.
- [ ] Every deal has a `photoUrl` or a neutral fallback tile with brand monogram.
- [ ] Region chip appears exactly once per page.
- [ ] `_uncategorised` is never rendered as literal text.
- [ ] Any taxonomy confidence <0.7 displays the "Wrong category?" affordance.

---

## §10  Non-goals

- Full internationalisation of product names (stays DE for v4).
- Recipe / nutrition data.
- User accounts with password.
- Server-side deal scraping overhaul — v4 is UI + data-model additions only.

## §11  Open questions for PM

1. Who owns the format-dimension schema? (Suggest: a small `subcategories.json` checked into repo; can be hand-edited quickly.)
2. For photos, do we use a Swiss grocery photo CDN (e.g. Migros image API if ToS allow) or our own curated CDN? Cost vs coverage tradeoff.
3. Should the format chip filter persist across bands, or reset per sub-category? (Suggest: per-band, because someone looking at milk has different format needs than someone looking at juice.)
4. Verdict WhatsApp deep link — do we include the full deal list or just the verdict? (Suggest: verdict + link; the deal list lives behind the link.)

---

## §12  Data integrity & counting semantics — the "1000 deals but only 180 shown" bug

### The numbers from the live app (Apr 22)

```
TYPE:   Fresh 111 + Long-life 807 + Household 82          = 1000 ✓
STORE:  Migros 70 + Coop 729 + LIDL 35 + ALDI 0 +
        Denner 134 + SPAR 24 + Volg 8                     = 1000 ✓
HEADER: "Showing 30 sub-categories · 1000 deals"
BAND:   30 sub-cats × ≈6 rows (one per store) = ≈180 shown
HIDDEN: 1000 − 180 = ≈820 deals (82% of dataset) are invisible.
```

### Why this is wrong

The band primitive collapses each sub-category to **one deal per store** (good UX). But the header count (`1000 deals`) is measured at the raw dataset level. The user reads "1000 deals" and then counts six rows in the Water band and concludes the numbers don't add up — because they don't.

The app is conflating three different things under the word "deals":

| Term in UI | Actually means | Count for this screen |
|---|---|---|
| "1000 deals" (header) | Raw dataset rows | 1000 |
| "6 deals across 6 stores" (band header) | Deals displayed in the band | 6 |
| "Coop (729)" (store filter) | Raw dataset rows for that store | 729 |

A user selecting "Coop (729)" expects to see 729 Coop deals. They see 30 bands × 1 Coop row = 30. Same problem for every filter.

### Fix

Use **two separate metrics** and label them explicitly:

```
Showing 30 sub-categories · 180 best-per-store rows · from 1000 total deals
```

Or, cleaner, at the header:

```
This week's deals             This week: Coop wins
────────────────────────────   ─────────────────────
1000 deals across 7 stores · 30 sub-categories · best per store shown
```

### And — expose the hidden 820

The 820 hidden deals need a path to the user. Two options:

**Option A — expand the band.** Each band gets an **"All 42 water deals"** link at the bottom-right of the band header that opens a drawer / dedicated sub-category page listing every deal (not collapsed to per-store). This is the **recommended** pattern because it preserves the quick-scan experience on the main page while giving power users a drill-down.

**Option B — per-store "see more" within the band.** Each ladder row gets a count ("Coop · 12 water deals") and opening it expands to all Coop water deals. Heavier UI, not recommended.

Recommended spec for Option A:

```
┌─────────────────────────────────────────────────────┐
│ 💧 Water · 42 deals · LIDL cheapest  [See all 42 →] │
├─────────────────────────────────────────────────────┤
│ [ hero + ladder + no-deal footer — as §4 ]          │
└─────────────────────────────────────────────────────┘
```

Dedicated sub-category page URL: `/c/water` — lists every deal with full filters (format, container, pack size) and inherits the header region/language settings.

### Acceptance criteria

- [ ] No header or band uses the word "deals" ambiguously.
- [ ] Sum of band counts on the Deals page equals header total (for the current filter).
- [ ] Every band shows **both** `shown` and `total` counts when they differ: "Showing best per store · 6 of 42".
- [ ] Every store-filter count matches the number of rows visible when that store is selected and "expand all bands" is on.
- [ ] Dedicated sub-category page (`/c/:id`) exists and lists every deal in that sub-category.

---

## §13  The `_uncategorised` band — delete, don't display

The live app shows an `_uncategorised` band at the top with these six rows:

| Store | Product | What it actually is |
|---|---|---|
| LIDL (hero) | parkside seil-/kordel-sortiment | **Hardware / rope kit** — not grocery |
| Denner | denner bbq rib eye | Meat |
| Coop | fior di settembre pinot grigio pavia igt (2020) | Wine |
| Migros | rippli nierstück geräuchert, ip-suisse | Smoked pork |
| Volg | volg prussiens | Cold cut |
| SPAR | dr. oetker pizza casa di mama | Frozen pizza |

These are six unrelated products. Declaring "LIDL cheapest" between a rope kit and a pizza is meaningless.

### Fixes

1. **Never render `_uncategorised` as a band.** If a deal has no sub-category after classifier + human review, it lands in a hidden "needs triage" queue — not in the user-facing grid.
2. **Kill non-grocery items at ingest.** Parkside (rope, tools, DIY) is a LIDL in-store brand. Reject any deal whose category at source is in a non-grocery department (`tools`, `textiles`, `garden`, `electronics`, etc.). Maintain a store-specific allowlist of grocery departments per retailer.
3. **If an item is genuinely uncategorised grocery** — e.g., a novel seasonal item — show it in a single **"Other grocery deals"** list at the *bottom* of the page, flat (no pseudo-verdict), with a "Help us categorise" CTA per row.
4. **Rendering a raw field name (`_uncategorised`) to end users is a bug.** Pipeline should never let a field name with a leading underscore reach the DOM. Add a test.

### Taxonomy confidence pipeline

```
source category → classifier → confidence score
  confidence ≥ 0.9 → show in its sub-category band
  0.7 ≤ conf < 0.9 → show in sub-category band with "?" pill + "Wrong category?" link
  0.4 ≤ conf < 0.7 → queue for human review; show in "Other grocery" at page bottom
  conf < 0.4     → hide entirely; flag to the ingest team
  non-grocery    → reject at ingest (never enters the dataset)
```

---

## §14  Updated TL;DR (replace §0)

There are **three compounding structural bugs** in the live app, in order of severity:

1. **Count semantics are dishonest.** "1000 deals" in the header, ~180 visible in bands, no link to the missing 820. The word "deals" means three different things in three places. (§12)
2. **Products aren't normalised.** A 6-pack of PET water and a single glass bottle of premium water are compared with a CHF delta. (§1, §4)
3. **The taxonomy leaks.** `_uncategorised` is rendered verbatim; a LIDL rope kit appears in the grocery grid; six unrelated products are given a pseudo-verdict. (§13)

These three together explain the "Miro prototype" impression. Fixing them (plus the visual polish in §5) is what converts basketch into a Migros-class app.
