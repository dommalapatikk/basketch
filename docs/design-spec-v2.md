# Design Specification: basketch v2.1

**Author:** Product Designer (Mobile-First) Agent
**Date:** 12 April 2026
**Version:** 2.1
**Status:** Updated after Design Challenge v2.0 review (all 20 findings accepted)
**Inputs:** PRD v2.0, Use Cases v2.0, Technical Architecture v2.1, Design System v1.1, Design Review Round 1 + Round 2 + Design Challenge v2.0, WhatsApp Sharing Guide

### v2.1 Changes (Design Challenge fixes)

**Must-Do (3):**
1. Tier 2 Coop status: removed opacity (0.7) which failed WCAG contrast. Now uses icon differentiation (info circle-i) at full opacity #666 (5.7:1). Section 4.3.
2. Color values: CLAUDE.md and design-system.md updated to match design-spec production values. Cross-cutting.
3. Error class: explicit note that `.error-msg` must use `var(--color-error)` (#dc2626), not `var(--color-coop)` (now green). Section 8.6.

**Should-Do (7):**
4. Wordle card moved below category cards (was above). Section 1.1, 7.5.
5. Tier 2 Coop wording changed from "No Coop data yet" to "We haven't found this at Coop yet -- check back next week." Section 4.3.
6. Category pills: scroll affordance added (partial pill visibility + right fade). Section 2.5.
7. Onboarding: removed 300ms auto-advance on pack selection, replaced with explicit "Next" button. Section 3.6.
8. Skip navigation link added as first focusable element on every page. Section 8.1.
9. Returning-user shortcut: "Welcome back" banner shown when localStorage has favoriteId. Section 1.2.
10. Deals page: whole-page empty state for when both stores are empty after category filtering. Section 2.7.

**Consider (10):**
11. Share buttons consolidated: "Share verdict" on banner only, "Copy card" below Wordle card only. Section 1.1.
12. Starter pack cards: added 2-3 preview item names per pack. Section 3.3.
13. Comparison page URL display replaced with "Your personal link" + buttons. Section 4.1.
14. 30-item cap warning reworded to explain WHY (focus on regulars). Section 3.4.
15. Wordle card: stat text bumped from 14px to 15px, tagline from 12px to 13px for WhatsApp compression survival. Section 7.2.
16. Wordle card: category indicator bars increased from 4px to 6px. Section 7.2.
17. Deals desktop layout: page-scrolling columns (not independent scroll containers). Section 2.8.
18. 404 page: full-width buttons instead of 240px max-width. Section 6.4.
19. Category pills: roving tabindex pattern documented explicitly. Section 2.9.
20. Wordle card: explicit note that card is DOM-only, html2canvas lazy-loaded on tap only. Section 7.4.

---

## 0. Design System Updates

The design system (`docs/design-system.md` v1.0) was built before the v2.0 PRD and architecture. The following updates reflect the current state of the product.

### 0.1 Updated Color Tokens

Production values after Round 2 review fixes:

| Token | Hex | Usage | Contrast on white |
|-------|-----|-------|--------------------|
| `migros` | `#e65100` | Store badges, backgrounds, buttons | 4.6:1 (pass AA) |
| `migros-light` | `#FFF3E6` | Migros panel backgrounds | N/A (background) |
| `migros-text` | `#c54400` | Orange text on light backgrounds | 4.7:1 on `#FFF3E6` |
| `coop` | `#007a3d` | Store badges, backgrounds, buttons | 5.3:1 (pass AA) |
| `coop-light` | `#e6f4ec` | Coop panel backgrounds | N/A (background) |
| `coop-text` | `#006030` | Green text on light backgrounds | 5.0:1 on `#e6f4ec` |
| `bg` | `#FAFAFA` | Page background | N/A |
| `surface` | `#FFFFFF` | Cards, panels, header | N/A |
| `text` | `#1A1A1A` | Body text, headings | 17.5:1 (pass AA) |
| `text-muted` | `#666666` | Secondary text, captions | 5.7:1 (pass AA) |
| `border` | `#E5E5E5` | Dividers, card borders | N/A |
| `accent` | `#2563EB` | Primary CTAs, focus rings | 4.6:1 (pass AA) |
| `success` | `#147a2d` | Savings callouts, "both" badges | 5.8:1 (pass AA) |
| `warning` | `#b45309` | Stale data warnings | 4.8:1 (pass AA) |
| `error` | `#dc2626` | Form validation errors | 4.5:1 (pass AA) |

### 0.2 New Design Tokens

Added for v2 features:

```css
:root {
  /* Existing tokens unchanged */

  /* New: Wordle card */
  --card-bg: #1a1a2e;          /* Dark navy background */
  --card-text: #FFFFFF;         /* White text on dark */
  --card-text-muted: #9CA3AF;  /* Light gray for secondary */
  --card-border: #2d2d44;      /* Subtle border */

  /* New: Category pills */
  --pill-bg: #F3F4F6;          /* Inactive pill background */
  --pill-active-bg: #2563EB;   /* Active pill background */
  --pill-active-text: #FFFFFF;  /* Active pill text */

  /* New: Transparency label */
  --info-bg: #EFF6FF;          /* Light blue info background */
  --info-text: #1E40AF;        /* Dark blue info text */
}
```

### 0.3 New Responsive Breakpoint

The deals browsing page introduces a desktop breakpoint:

| Breakpoint | Width | Behaviour |
|-----------|-------|-----------|
| Mobile (default) | < 640px | Single column. 16px padding. Store sections stacked. |
| Content max | 640px | Content caps at 640px, auto-centered. |
| Desktop (deals only) | 768px+ | Side-by-side Migros/Coop columns on deals page. All other pages unchanged. |

---

## 1. Home Page (`/`)

The home page is the first-visit experience. It delivers the "aha moment" with zero setup: the weekly verdict, category snapshots, and a path to browse or personalize.

### 1.1 Layout (375px viewport)

```
+------------------------------------------+
| basketch              Deals   About      | <- Sticky header, 56px height
+------------------------------------------+
|                                          |
|  Which store has better                  |
|  promotions this week?                   |  <- H1, 28px, ExtraBold
|                                          |
|  Your weekly Migros vs Coop              |
|  deals, compared in 5 seconds.           |  <- 16px, muted
|                                          |
+------------------------------------------+
|  WEEKLY VERDICT                          |  <- Section label, 12px, uppercase
|                                          |
|  This week: Migros for Fresh,            |
|  Coop for Household                      |  <- 16px, SemiBold. Store names colored.
|                                          |
|  Based on 42 Migros deals (avg 26% off)  |
|  vs 38 Coop deals (avg 23% off)          |  <- 14px, muted. Transparency line.
|                                          |
|  [ Share verdict ]                       |  <- Small button, inline
|                                          |
+------------------------------------------+
|                                          |
|  FRESH                                   |  <- Category card header
|  Migros: 12 deals, avg 28% off          |  <- Orange text
|  Coop: 8 deals, avg 22% off             |  <- Green text
|                                          |
|  Top deal: Poulet -40% at Migros        |
|  Top deal: Lachs -35% at Coop           |
|                                          |
+------------------------------------------+
|  LONG-LIFE                               |
|  Migros: 18 deals, avg 24% off          |
|  Coop: 15 deals, avg 27% off            |
|                                          |
|  Top deal: Barilla -50% at Coop         |
|  Top deal: Nespresso -30% at Migros     |
|                                          |
+------------------------------------------+
|  NON-FOOD / HOUSEHOLD                    |
|  Migros: 12 deals, avg 30% off          |
|  Coop: 14 deals, avg 35% off            |
|                                          |
|  Top deal: Persil -45% at Coop          |
|  Top deal: Nivea -40% at Migros         |
|                                          |
+------------------------------------------+
|                                          |
|  [  WORDLE VERDICT CARD  ]              |  <- Screenshot-friendly card (see Section 7)
|                                          |
|  [ Copy card ]                          |  <- Button below card
|                                          |
+------------------------------------------+
|                                          |
| [ Browse all deals  ->  ]               |  <- Full-width primary CTA
|                                          |
+------------------------------------------+
|                                          |  <- Conditional: only if localStorage has favoriteId
|  Welcome back.  [View your deals ->]     |  <- Card, accent border-left, 14px
|                                          |
+------------------------------------------+
|                                          |
|  Track your regular items                |  <- H2, 20px, Bold
|                                          |
|  Get a personal comparison every week.   |
|  Setup in 60 seconds.                    |  <- 14px, muted
|                                          |
| [ Set up my list  ->  ]                 |  <- Full-width outline CTA
|                                          |
+------------------------------------------+
|                                          |
|  Already have a list?                    |  <- H3, 18px, SemiBold
|  Enter the email you saved it with.      |  <- 14px, muted
|                                          |
|  [your@email.com       ] [ Find ]        |  <- Input + button
|                                          |
+------------------------------------------+
|  Deals updated: Thu 10 Apr               |  <- 12px, muted
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |  <- Footer, 12px, centered, muted
+------------------------------------------+
```

### 1.2 Component Hierarchy

```
HomePage
  Header (sticky)
    Logo ("basketch") -> link to /
    Nav: "Deals" -> /deals, "About" -> /about
  HeroSection
    H1: "Which store has better promotions this week?"
    Subtitle
  VerdictBanner
    VerdictLabel ("WEEKLY VERDICT")
    VerdictText (store names in store colors)
    TransparencyLine (deal counts + avg discounts)
    ShareButton (Share verdict)
  CategoryCards (x3)
    CategoryCard (Fresh)
    CategoryCard (Long-life)
    CategoryCard (Non-food)
  WordleCard (see Section 7)
    CopyCardButton (below card)
  BrowseCTA -> /deals
  ReturningUserBanner (conditional: only if localStorage has favoriteId)
    "Welcome back." + [View your deals ->] link to /compare/:id
  FavoritesPromo
    H2 + description
    CTA -> /onboarding
  EmailLookup
    H3 + description
    EmailInput + FindButton
  DataFreshness
  Footer
```

### 1.3 Content / Copy

| Element | Text |
|---------|------|
| H1 | "Which store has better promotions this week?" |
| Subtitle | "Your weekly Migros vs Coop deals, compared in 5 seconds." |
| Verdict label | "WEEKLY VERDICT" |
| Verdict (example, normal) | "This week: **Migros** for Fresh, **Coop** for Household" |
| Verdict (tie) | "Similar promotions at both stores this week" |
| Transparency line (example) | "Based on 42 Migros deals (avg 26% off) vs 38 Coop deals (avg 23% off)" |
| Category card pattern | "[Category] -- Migros: X deals, avg Y% off / Coop: X deals, avg Y% off" |
| Top deal pattern | "Top deal: [Product] -[X]% at [Store]" |
| Browse CTA | "Browse all deals" |
| Favorites promo H2 | "Track your regular items" |
| Favorites promo body | "Get a personal comparison every week. Setup in 60 seconds." |
| Favorites CTA | "Set up my list" |
| Email lookup H3 | "Already have a list?" |
| Email lookup body | "Enter the email you saved it with." |
| Find button | "Find" |
| Data freshness | "Deals updated: Thu 10 Apr" |
| Footer | "basketch -- your weekly promotions, compared. Migros vs Coop." |

### 1.4 States

**Loading:**
- Show skeleton placeholders for verdict banner (gray pulse bar, 60px height) and three category card skeletons (gray pulse rectangles).
- Header and hero section render immediately (no data dependency).
- Footer shows normally.

**Error (pipeline data unavailable):**
- Hero + header render normally.
- Replace verdict banner with info card: "Could not load this week's deals. Please try again later." with a "Retry" button.
- Category cards not shown.
- Browse CTA and favorites section still shown.

**Partial data (one store missing):**
- Verdict banner shows: "Partial data -- [Store] unavailable this week" in amber warning style.
- Category cards show the available store's data only. The missing store's row shows: "No [Store] deals available this week" in muted italic.

**Stale data (> 7 days old):**
- Verdict renders normally.
- Amber warning bar below verdict: "Deals may be outdated -- last updated [date]"
- Warning uses `--warning` color with `--warning-bg` (#FFFBEB) background.

**No data at all:**
- Hide verdict banner entirely.
- Show a centered message card: "No deals available yet. Check back Thursday evening when new promotions are published."
- Show Browse CTA (disabled, grayed) and favorites section normally.

**Email lookup states:**
- Default: input + "Find" button
- Loading: button text changes to "Searching..."
- Success: "Found! Redirecting..." then redirect to `/compare/:id`
- Not found: "No list found for this email. Want to create one?" with link to `/onboarding`
- Error: "Something went wrong. Please try again." in error color below input

### 1.5 Interaction Patterns

- **Share verdict button:** Triggers `navigator.share()` with title "basketch -- This Week's Verdict" and the home URL. Falls back to clipboard copy on unsupported browsers, with "Link copied!" toast.
- **Copy card button:** Lazy-loads `html2canvas`, renders the WordleCard DOM as an image, copies to clipboard. Shows "Card copied!" toast. Falls back to PNG download if clipboard write fails.
- **Category cards:** Tappable. Each card links to `/deals?category=[category]` to show filtered deals.
- **Browse CTA:** Links to `/deals` (all categories).
- **Set up my list CTA:** Links to `/onboarding`.
- **Email lookup:** Form submit (Enter key or Find button). Validates email format client-side before submitting.

### 1.6 Accessibility

- H1 is the only `<h1>` on the page. Category cards use `<h2>`. Email lookup uses `<h3>`.
- Verdict banner has `role="status"` and `aria-live="polite"` so screen readers announce verdict updates.
- Store names in verdict have `aria-label` attributes: "Migros (store)" and "Coop (store)" -- not just color.
- Category cards are `<article>` elements with descriptive `aria-label`: "Fresh category: Migros leads with 12 deals averaging 28% off".
- Share and Copy buttons have explicit text labels (not icon-only).
- Email input has `<label>` element (visually hidden if needed, but present for screen readers).
- Data freshness indicator uses `<time>` element with `datetime` attribute.
- All touch targets are 44px minimum.

---

## 2. Deals Browsing Page (`/deals`)

The deals browsing page lets anyone browse all weekly promotions by sub-category, with Migros and Coop deals grouped separately. No setup required.

### 2.1 Layout (375px viewport)

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  This week's deals                       |  <- H1, 24px, Bold
|  Deals updated: Thu 10 Apr               |  <- 14px, muted
|                                          |
+------------------------------------------+
| [All] [Fruits] [Meat] [Dairy] [Bakery]  |  <- Horizontal scroll pills
| [Snacks] [Pasta] [Drinks] [Ready] ...   |
+------------------------------------------+
|                                          |
|  MIGROS  --  Fruits & Vegetables         |  <- Store section header
|  24 deals                                |  <- 14px, muted
|                                          |
+------------------------------------------+
| +--------------------------------------+ |
| |  [Image]  Erdbeeren 500g             | |
| |           CHF 2.95 (was CHF 4.95)    | |
| |           -40%                        | |
| +--------------------------------------+ |
| +--------------------------------------+ |
| |  [Image]  Bio Tomaten 500g           | |
| |           CHF 1.80 (was CHF 2.90)    | |
| |           -38%                        | |
| +--------------------------------------+ |
|  ... more deal cards ...                 |
|                                          |
| [ Show more Migros deals ]              |  <- If > 50 deals
|                                          |
+------------------------------------------+
|                                          |
|  COOP  --  Fruits & Vegetables           |  <- Store section header
|  18 deals                                |  <- 14px, muted
|                                          |
+------------------------------------------+
| +--------------------------------------+ |
| |  [Image]  Bananen 1kg                | |
| |           CHF 1.50 (was CHF 2.30)    | |
| |           -35%                        | |
| +--------------------------------------+ |
|  ... more deal cards ...                 |
|                                          |
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |
+------------------------------------------+
```

### 2.2 Desktop Layout (768px+)

On wider screens, the deals page uses a two-column layout:

```
+----------------------------------------------------------+
| basketch                          Deals   About          |
+----------------------------------------------------------+
|  This week's deals                                       |
|  Deals updated: Thu 10 Apr                               |
|                                                          |
| [All] [Fruits] [Meat] [Dairy] [Bakery] [Snacks] ...    |
+----------------------------------------------------------+
|  MIGROS                    |  COOP                       |
|  Fruits & Vegetables       |  Fruits & Vegetables        |
|  24 deals                  |  18 deals                   |
|                            |                             |
|  +--------------------+   |  +--------------------+     |
|  | Erdbeeren 500g     |   |  | Bananen 1kg        |     |
|  | CHF 2.95 -40%      |   |  | CHF 1.50 -35%      |     |
|  +--------------------+   |  +--------------------+     |
|  +--------------------+   |  +--------------------+     |
|  | Bio Tomaten 500g   |   |  | Karotten 1kg       |     |
|  | CHF 1.80 -38%      |   |  | CHF 1.20 -30%      |     |
|  +--------------------+   |  +--------------------+     |
|  ...                       |  ...                        |
+----------------------------------------------------------+
```

### 2.3 Component Hierarchy

```
DealsPage
  Header (shared)
  PageHeader
    H1: "This week's deals"
    DataFreshness
  CategoryFilterPills (horizontal scrollable)
    Pill ("All") -- default selected
    Pill ("Fruits & Vegetables")
    Pill ("Meat & Fish")
    ... 11 categories total
  StoreSection (Migros)
    StoreHeader (name + category + deal count)
    DealCardList
      DealCard (x N, max 50)
    ShowMoreButton (if > 50 deals)
  StoreSection (Coop)
    StoreHeader
    DealCardList
      DealCard (x N, max 50)
    ShowMoreButton
  Footer (shared)
```

### 2.4 DealCard Component Spec

Each deal card shows one promotion:

```
+------------------------------------------+
| [Product   ]  Erdbeeren 500g             |
| [Image     ]  Naturaplan                 |  <- Brand, 12px, muted
| [64x64px   ]                             |
|               CHF 2.95                   |  <- Sale price, 18px, Bold
|               was CHF 4.95               |  <- Original, 14px, strikethrough
|               -40%                       |  <- Discount badge, SemiBold
+------------------------------------------+
```

- Image: 64x64px, `object-contain`, lazy-loaded. Fallback: store logo placeholder.
- Product name: 16px, SemiBold. Truncated to 2 lines (`line-clamp-2`).
- Brand: 12px, muted. Only shown if extracted.
- Sale price: 18px, Bold.
- Original price: 14px, muted, strikethrough.
- Discount badge: Inline pill. Store-colored background, white text. "-40%".
- Valid dates: 12px, muted. "Until Wed 16 Apr".
- Card: White surface, 1px border, 8px radius, 12px padding.
- Entire card is NOT tappable (no detail page in v1). Static content.

### 2.5 CategoryFilterPills Spec

- Container: Horizontal scroll, no scrollbar visible (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`, hide scrollbar with CSS). **Scroll affordance:** Ensure the last visible pill is cut off mid-text (partial visibility) to signal that more pills exist to the right. If pills happen to align cleanly at the viewport edge, add a subtle 24px-wide fade gradient (white to transparent) on the right edge of the container. The fade disappears once the user scrolls to the end.
- Each pill: 44px minimum height, 16px horizontal padding, 8px vertical padding.
- Inactive: `--pill-bg` background, `--text` color, 1px border.
- Active: `--pill-active-bg` background, `--pill-active-text` color, no border.
- Pill radius: 20px (full rounding).
- Gap between pills: 8px.
- First pill ("All") always visible without scrolling.
- On selection: page scrolls to top of deal sections. Selected category filters both store sections simultaneously.

### 2.6 Content / Copy

| Element | Text |
|---------|------|
| H1 | "This week's deals" |
| Data freshness | "Deals updated: Thu 10 Apr" |
| Store section header pattern | "[STORE] -- [Category Name]" |
| Deal count | "24 deals" |
| Show more button | "Show more Migros deals" / "Show more Coop deals" |
| Empty store section | "No [Store] deals in [category] this week" |
| Price pattern | "CHF [sale_price]" with "was CHF [original_price]" |
| Valid dates pattern | "Until [day] [date] [month]" |

### 2.7 States

**Loading:**
- CategoryFilterPills render immediately (static data).
- Show 6 skeleton deal cards (3 per store section) with gray pulse animation.
- Store section headers show with skeleton text.

**Error:**
- Info card: "Could not load deals. Please try again later." with "Retry" button.
- CategoryFilterPills still visible but disabled (grayed out).

**Empty category (one store):**
- If a store has zero deals in the selected category, show the store section header normally, with centered muted text: "No [Store] deals in [category] this week". Do NOT collapse the empty section -- the user should see that the section exists but has no data.

**Empty category (both stores):**
- If both stores have zero deals in the selected category, show both empty store sections as above, plus a centered muted message above them: "No deals in [category] this week. Try another category." This provides a clear recovery path when the entire page is empty after filtering.

**Stale data:**
- Same amber warning pattern as home page, below the page header.

**URL query parameter:**
- `/deals?category=fresh` pre-selects the "Fruits & Vegetables" pill on load.
- Invalid category parameter defaults to "All".

### 2.8 Interaction Patterns

- **Category pills:** Tap to filter. Single selection. Updates URL query parameter for shareability.
- **Show more:** Reveals next 50 deals in the same store section. Button text changes to "Show more ([remaining] left)".
- **Scroll behavior:** Store sections are stacked on mobile. On desktop (768px+), columns are placed side-by-side in a CSS grid (`grid-template-columns: 1fr 1fr`) and scroll together with the page. No independent scroll containers -- this avoids scroll-trapping keyboard focus and is simpler to implement with Tailwind.

### 2.9 Accessibility

- Category pills use `role="tablist"` with each pill as `role="tab"` and `aria-selected`.
- Store sections use `role="region"` with `aria-label="Migros deals"` / `aria-label="Coop deals"`.
- Deal cards use `<article>` with `aria-label` summarizing the deal: "Erdbeeren 500g, CHF 2.95, 40% off at Migros".
- Horizontal scroll pills use the roving tabindex pattern: only the active (selected) pill is in the Tab order (`tabindex="0"`), all others have `tabindex="-1"`. Tab exits the pill list to the next focusable element. Left/Right arrow keys move between pills. This follows the WAI-ARIA tablist keyboard pattern.
- Focus ring visible on pills when keyboard-navigated.

---

## 3. Favorites Onboarding (`/onboarding`)

Three-step wizard: Pick a starter pack, customize your list, save with email.

### 3.1 Layout (375px viewport)

**Step 1: Pick a starter pack**

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  Set up your list                        |  <- H1, 24px, Bold
|  Pick items you buy regularly.           |
|  We will compare deals for you.          |  <- 14px, muted
|                                          |
|  [====][    ][    ]                      |  <- Step 1 of 3 progress bar
|                                          |
|  Choose a starter pack                   |  <- H2, 18px, SemiBold
|                                          |
| +------------------+------------------+  |
| |                  |                  |  |
| |  Swiss Basics    |  Indian Kitchen  |  |
| |  The essentials  |  Spices, rice,   |  |
| |  15 items        |  lentils         |  |
| |                  |  16 items        |  |
| +------------------+------------------+  |
| +------------------+------------------+  |
| |                  |                  |  |
| |  Mediterranean   |  Studenten-      |  |
| |  Olive oil,      |  kuche           |  |
| |  pasta, herbs    |  Budget basics   |  |
| |  15 items        |  15 items        |  |
| +------------------+------------------+  |
| +------------------+------------------+  |
| |                  |                  |  |
| |  Familientisch   |  Start from      |  |
| |  Family meals,   |  scratch         |  |
| |  snacks, bulk    |  Build your own  |  |
| |  16 items        |  list            |  |
| +------------------+------------------+  |
|                                          |
+------------------------------------------+
```

**Step 2: Customize your list**

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  Set up your list                        |
|  Remove what you do not buy.             |
|  Add anything missing.                   |
|                                          |
|  [====][====][    ]                      |  <- Step 2 of 3
|                                          |
|  Your favorites (15)       [ + Add ]     |  <- H2 + add button
|                                          |
+------------------------------------------+
|  Milk                               [x] |
|  whole milk, 1l                          |  <- 14px, muted keyword
+------------------------------------------+
|  Bread                               [x] |
|  brot, zopf                              |
+------------------------------------------+
|  Butter                              [x] |
|  butter                                  |
+------------------------------------------+
|  Eggs                                [x] |
|  eier, freiland                          |
+------------------------------------------+
|  Cheese                              [x] |
|  kase, emmentaler, gruyere               |
+------------------------------------------+
|  ... more items ...                      |
+------------------------------------------+
|                                          |
|  15 items -- you can add up to 30.       |  <- Item count, 14px, muted
|                                          |
| [ <- Back ]            [ Next -> ]       |
+------------------------------------------+
```

**Step 2: Add item (expanded)**

When user taps "+ Add", a search panel appears above the list:

```
+------------------------------------------+
|  Search for a product                    |
|  [yogurt            ] [ Search ]         |
|                                          |
|  Emmi Jogurt Erdbeer 150g        [ + ]  |
|  Migros: CHF 0.95 (-20%)                |
|                                          |
|  Coop Naturaplan Joghurt 180g    [ + ]  |
|  Coop: CHF 1.20 (-25%)                  |
|                                          |
|  Not finding it?                         |
|  [ Add "yogurt" as custom keyword ]      |  <- Outline button
+------------------------------------------+
```

**Step 3: Save your list**

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  Set up your list                        |
|  Save your list so you can check         |
|  it every week.                          |
|                                          |
|  [====][====][====]                      |  <- Step 3 of 3
|                                          |
|  Save your list                          |  <- H2
|                                          |
|  Enter your email to find your list      |
|  next time. We will not send you         |
|  anything unless you ask.                |  <- 14px, muted
|                                          |
|  [your@email.com           ] [ Save ]    |
|                                          |
|  Or just bookmark the link on the        |
|  next page.                              |  <- 14px, muted
|                                          |
| [ <- Back ]             [ Skip -> ]      |
+------------------------------------------+
```

### 3.2 Component Hierarchy

```
OnboardingPage
  Header (shared)
  PageHeader
    H1: "Set up your list"
    Subtitle (changes per step)
  StepProgressBar (3 steps)
  Step 1: TemplatePicker
    StarterPackGrid (2 columns)
      PackCard (x5 + "Start from scratch")
  Step 2: FavoritesEditor
    ListHeader (count + Add button)
    FavoriteItemList
      FavoriteItem (label + keyword + remove)
    ProductSearch (expandable)
    ItemCountFooter
    NavigationButtons (Back + Next)
  Step 3: EmailCapture
    Description
    EmailInput + SaveButton
    SkipNote
    NavigationButtons (Back + Skip)
  Footer (shared)
```

### 3.3 Starter Pack Cards

Each pack card:

| Pack | Label | Description | Preview items | Item count |
|------|-------|-------------|---------------|------------|
| Swiss Basics | "Swiss Basics" | "The essentials for a Swiss kitchen" | "milk, bread, butter, eggs..." | 15 items |
| Indian Kitchen | "Indian Kitchen" | "Spices, rice, lentils, and more" | "basmati rice, ghee, cumin, chickpeas..." | 16 items |
| Mediterranean | "Mediterranean" | "Olive oil, pasta, herbs, vegetables" | "olive oil, feta, tomatoes, basil..." | 15 items |
| Studentenküche | "Studentenküche" | "Budget basics for students" | "pasta, rice, canned tomatoes, eggs..." | 15 items |
| Familientisch | "Familientisch" | "Family meals, snacks, and bulk items" | "chicken, potatoes, yogurt, cereal..." | 16 items |
| Custom | "Start from scratch" | "Build your own list" | -- | 0 items |

**Card visual spec:**
- White background, 1px border, 8px radius, 16px padding.
- Pack name: 16px, SemiBold.
- Description: 14px, muted. 2 lines max (`line-clamp-2`).
- Preview items: 12px, muted, italic. 1 line max (`line-clamp-1`). Shows 2-3 item names to help users differentiate packs without selecting.
- Item count: 12px, muted.
- Selected state: 2px accent border, light blue background (`#EFF6FF`).
- Entire card is the tap target (well above 44px minimum).
- 2-column grid, 12px gap. Single column below 400px.

### 3.4 30-Item Soft Cap

When the user reaches 30 items, show a yellow warning below the item list:

> "Lists work best with your top 20-30 items. Focus on what you buy every week."

The user CAN continue adding beyond 30 (not a hard limit), but the warning persists. At 40 items, the "+ Add" button is disabled with tooltip: "Maximum 40 items reached."

### 3.5 States

**Step 1 states:**
- Loading: Centered spinner + "Loading starter packs..."
- Error: Red error card with retry button.
- Empty: "No starter packs available. Build your own list instead." with link.
- Default: 2-column grid of pack cards.

**Step 2 states:**
- Empty (start from scratch): "No items yet. Search for products to add to your list." with search expanded by default.
- With items: Scrollable list with remove buttons.
- Adding: ProductSearch panel visible above the list.
- Removing: "x" button shows "..." while processing, then item disappears.

**Step 3 states:**
- Default: Email input + Save button + Skip button.
- Saving: "Save" button text changes to "Saving..."
- Success: Green success message "List saved! Redirecting to your deals..." then redirect to `/compare/:id` after 1.5 seconds.
- Error: Red text below input: "Could not save. Please try again."
- Skip: Redirects directly to `/compare/:id` (list is already created, just without email).

### 3.6 Interaction Patterns

- **Step navigation:** Linear (1 -> 2 -> 3). Back button available on steps 2 and 3. Browser back button also works (steps are URL-based: `/onboarding?step=1`, `/onboarding?step=2`, `/onboarding?step=3`).
- **Pack selection:** Single select. Tap a pack to select, tap again to deselect. After selection, a "Next" button appears (or becomes enabled) below the pack grid. No auto-advance -- the user explicitly taps "Next" to proceed to step 2. This prevents accidental navigation from fat-finger taps on the 2-column grid.
- **Remove item:** Tap the "x" button on any item. No confirmation dialog (instant removal, but can re-add via search).
- **Add item:** Tap "+ Add" to expand ProductSearch. Search executes on Enter or tap of Search button. Minimum 2 characters.
- **Email save:** Optional. User can skip to go directly to their comparison. Email is only used for list retrieval, not marketing.

### 3.7 Accessibility

- Step progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin="1"`, `aria-valuemax="3"`.
- Each step has a descriptive `aria-label`: "Step 1 of 3: Choose a starter pack".
- Pack cards use `role="radio"` within a `role="radiogroup"` for single selection.
- Remove buttons have `aria-label="Remove [item name] from favorites"`.
- Product search results are in a `role="listbox"` with `aria-label="Search results"`.
- Add buttons have `aria-label="Add [product name] to favorites"`.
- Navigation buttons have clear text labels ("Back", "Next", "Skip", "Save").

---

## 4. Comparison Page (`/compare/:id`)

The personal favorites comparison -- the retention hook. Shows which of the user's tracked items are on promotion this week, split by store.

### 4.1 Layout (375px viewport)

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  Your deals this week                    |  <- H1, 24px, Bold
|  15 items tracked                        |  <- 14px, muted
|  4 on sale at Migros, 3 at Coop          |  <- 14px. Store names colored.
|                                          |
|  Deals updated: Thu 10 Apr               |  <- 14px, muted
|                                          |
+------------------------------------------+
|  Coop: showing promotions found.         |  <- Info banner
|  Not all Coop products are tracked yet.  |  <- Light blue bg (#EFF6FF)
+------------------------------------------+
|                                          |
|  * On sale at Migros (4)                 |  <- Orange dot + section header
|                                          |
+------------------------------------------+
| Milk                          [Migros]   |  <- Product name + recommendation badge
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |
| |  CHF 1.50        |  Not on          |  |
| |  was CHF 1.95    |  promotion at    |  |
| |  -23%            |  Coop this week  |  |
| |  M-Drink Milch   |                  |  |
| +------------------+------------------+  |
+------------------------------------------+
| Bread                         [Migros]   |
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |
| |  CHF 1.20        |  (i) We haven't  |  |
| |  was CHF 1.80    |  found this at   |  |
| |  -33%            |  Coop yet        |  |
| +------------------+------------------+  |
+------------------------------------------+
|                                          |
|  * On sale at Coop (3)                   |  <- Green dot + section header
|                                          |
+------------------------------------------+
| Cheese                        [Coop]     |
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |
| |  Not on          |  CHF 3.50        |  |
| |  promotion at    |  was CHF 4.95    |  |
| |  Migros this     |  -29%            |  |
| |  week            |  Coop Gruyere    |  |
| +------------------+------------------+  |
+------------------------------------------+
|                                          |
|  * On sale at both (1)                   |  <- Green dot + section header
|                                          |
+------------------------------------------+
| Yogurt                        [Either]   |
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |
| |  CHF 0.95        |  CHF 0.90        |  |
| |  was CHF 1.20    |  was CHF 1.30    |  |
| |  -21%            |  -31%            |  |
| |  Emmi Jogurt     |  Naturaplan      |  |
| +------------------+------------------+  |
+------------------------------------------+
|                                          |
|  * No deals this week (7)                |  <- Gray dot + section header
|                                          |
+------------------------------------------+
| Butter                        [--]       |
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |
| |  Not on          |  Not on          |  |
| |  promotion       |  promotion at    |  |
| |  this week       |  Coop this week  |  |
| +------------------+------------------+  |
+------------------------------------------+
|  ... more items ...                      |
+------------------------------------------+
|                                          |
|  Save this list                          |  <- H2
|  Bookmark this page or copy the link     |
|  to check your deals every week.         |
|                                          |
|  Your personal link                      |  <- 14px, muted
|  [ Copy link ]  [ Share this list ]      |  <- Two buttons, inline
|                                          |
+------------------------------------------+
|                                          |
|  [ Edit my list ]                        |  <- Outline button, centered
|                                          |
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |
+------------------------------------------+
```

### 4.2 Component Hierarchy

```
ComparisonPage
  Header (shared)
  PageHeader
    H1: "Your deals this week"
    ItemCount
    StoreSummary (X at Migros, Y at Coop)
    DataFreshness
  CoopTransparencyLabel
  SplitList
    Section: "On sale at Migros"
      CompareCard (x N)
    Section: "On sale at Coop"
      CompareCard (x N)
    Section: "On sale at both"
      CompareCard (x N)
    Section: "No deals this week"
      CompareCard (x N)
  SaveSection
    H2 + description
    "Your personal link" label
    CopyLinkButton + ShareButton (inline)
  EditButton -> /onboarding?edit=:id
  Footer (shared)
```

### 4.3 CompareCard Component Spec

```
+------------------------------------------+
| Product Label               [Badge]      |  <- 16px Bold + recommendation pill
| search keyword                           |  <- 12px, muted
+------------------------------------------+
| +------------------+------------------+  |
| |  MIGROS          |  COOP            |  |  <- 11px uppercase, SemiBold, tracking-wide
| |                  |                  |  |
| |  CHF 1.50        |  CHF 1.80        |  |  <- 18px, Bold
| |  was CHF 1.95    |  was CHF 2.30    |  |  <- 14px, muted, strikethrough
| |  -23%            |  -22%            |  |  <- 12px, SemiBold, success green
| |                  |                  |  |
| |  M-Drink Milch   |  Coop Vollmilch  |  |  <- 14px, muted. line-clamp-2
| |  1l              |  1l              |  |
| +------------------+------------------+  |
+------------------------------------------+
```

- Card: White surface, 1px border, 8px radius, 12px padding.
- Header row: product label (left, Bold) + recommendation badge (right, pill).
- Keyword: 12px, muted, below label.
- 2-column grid: 8px gap. Each column has store-tinted background (Migros: `#FFF3E6`, Coop: `#e6f4ec`), 8px padding, 6px radius.
- Store name: 11px, uppercase, SemiBold, letter-spaced. Uses `migros-text` or `coop-text` color.
- Sale price: 18px, Bold, primary text color.
- Original price: 14px, muted, strikethrough.
- Discount: 12px, SemiBold, success green.
- Product name: 14px, muted, `line-clamp-2`.

**Recommendation badges:**

| Badge | Background | Text | Label |
|-------|------------|------|-------|
| Migros | `migros-light` | `migros-text` | "Migros" |
| Coop | `coop-light` | `coop-text` | "Coop" |
| Either | `#E8F5E9` | `success` | "Either" |
| No deals | `#F5F5F5` | `text-muted` | "--" |

**Two-tier Coop status messages:**

| Tier | Condition | Display in Coop column |
|------|-----------|------------------------|
| Tier 1 | Product seen at Coop before, not on sale now | "Not on promotion at Coop this week" -- 14px, muted (#666), italic |
| Tier 2 | Product never seen at Coop | "We haven't found this at Coop yet -- check back next week." -- 14px, muted (#666), italic, prefixed with a small info icon (circle-i, 14px, inline, muted). Same color and contrast as Tier 1; differentiated by icon, not opacity. |

Both tiers use full-opacity `#666666` on white (5.7:1 contrast, passes WCAG AA). The info icon provides a visual distinction without relying on opacity, which would reduce contrast below accessible thresholds.

Migros always shows confident status: "Not on promotion at Migros this week" (never "no data yet" because we have full catalog).

### 4.4 Sort Order

Items within the SplitList are ordered:

1. **On sale at both** (best value first -- sorted by highest discount % across either store)
2. **On sale at Migros only** (sorted by discount % descending)
3. **On sale at Coop only** (sorted by discount % descending)
4. **No deals this week** (sorted alphabetically by product label)

### 4.5 States

**Loading:**
- Header renders with skeleton text.
- Show 4 skeleton CompareCards with gray pulse animation.

**Error (invalid UUID or list not found):**
- Centered card: "This comparison list was not found. It may have been deleted or the link may be incorrect."
- CTA: "Create a new list" -> `/onboarding`.

**Error (data load failure):**
- Header with list metadata renders.
- Error card: "Could not load this week's deals. Your favorites are saved -- please try again later." with "Retry" button.

**Empty (no deals match any favorites):**
- Header renders with "0 on sale at Migros, 0 at Coop".
- All items appear under "No deals this week" section.
- Encouraging message above the section: "None of your favorites are on sale this week. Check back Thursday when new deals are published."

**Stale data:**
- Same amber warning bar pattern, below the page header.

### 4.6 Interaction Patterns

- **Copy link:** Copies the full comparison URL to clipboard. Button text changes to "Copied!" for 2 seconds.
- **Share this list:** Triggers `navigator.share()` with title "My grocery deals -- basketch" and the comparison URL.
- **Edit my list:** Links to `/onboarding?edit=:id` which loads the existing favorites into step 2 for editing.
- **CompareCards are not tappable** (no detail view in v1).

### 4.7 Accessibility

- SplitList sections use `<section>` with `aria-label`: "Items on sale at Migros", "Items on sale at Coop", etc.
- Section headers use `<h2>`.
- CompareCard uses `<article>` with `aria-label` summarizing the comparison: "Milk: on sale at Migros for CHF 1.50 (23% off). Not on promotion at Coop."
- Store columns have `aria-label="Migros deal"` and `aria-label="Coop deal"`.
- Coop transparency label has `role="note"`.
- Copy and Share buttons have explicit text labels.
- Data freshness uses `<time>` element.

---

## 5. About Page (`/about`)

Straightforward informational page. Builds trust through transparency.

### 5.1 Layout (375px viewport)

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|  About basketch                          |  <- H1, 24px, Bold
|                                          |
+------------------------------------------+
|                                          |
|  How it works                            |  <- H2, 18px, SemiBold
|                                          |
|  1. Every Wednesday evening, we fetch    |
|     this week's promotions from Migros   |
|     and Coop.                            |
|                                          |
|  2. We categorise every deal into Fresh, |
|     Long-life, or Non-food and calculate |
|     a weekly verdict.                    |
|                                          |
|  3. You see the verdict instantly.       |
|     Browse all deals, or track your      |
|     regular items for a personal         |
|     comparison.                          |
|                                          |
+------------------------------------------+
|                                          |
|  Data sources                            |  <- H2
|                                          |
|  - Migros promotions: via the Migros     |
|    API (open source wrapper)             |
|  - Coop promotions: via aktionis.ch      |
|    (public deal aggregator since 2006)   |
|                                          |
|  We only use publicly available data.    |
|  No scraping of protected websites.      |
|                                          |
+------------------------------------------+
|                                          |
|  What we compare                         |  <- H2
|                                          |
|  basketch compares weekly promotions,    |
|  not regular shelf prices. Promotions    |
|  change every week and are the reason    |
|  you might switch stores. Regular        |
|  prices are stable -- you already know   |
|  what milk costs.                        |
|                                          |
+------------------------------------------+
|                                          |
|  Privacy                                 |  <- H2
|                                          |
|  - No account required                   |
|  - No tracking cookies                   |
|  - Email is optional and only used       |
|    to find your list                     |
|  - We use Vercel Analytics (anonymous    |
|    page view counts, no personal data)   |
|                                          |
+------------------------------------------+
|                                          |
|  Built by                                |  <- H2
|                                          |
|  Kiran Dommalapati, Bern.               |
|  A real product for a tiny audience,     |
|  documented like a portfolio project.    |
|                                          |
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |
+------------------------------------------+
```

### 5.2 Component Hierarchy

```
AboutPage
  Header (shared)
  H1: "About basketch"
  Card: "How it works" (ordered list)
  Card: "Data sources" (unordered list)
  Card: "What we compare" (paragraph)
  Card: "Privacy" (unordered list)
  Card: "Built by" (paragraph)
  Footer (shared)
```

### 5.3 Visual Spec

- Each section is a Card component with 16px padding.
- Cards stacked vertically with 16px gap.
- H2 headings inside cards: 18px, SemiBold.
- Body text: 16px, regular, 1.5 line height.
- Lists: 20px left padding. List items have `line-height: 2` for comfortable reading. **Note:** Use a Tailwind utility class (`leading-loose` or a custom `leading-8`) for this -- not inline `style={{ lineHeight: 2 }}`.

### 5.4 States

This is a static page. No loading, error, or empty states. Always renders the same content.

### 5.5 Accessibility

- Semantic heading hierarchy: H1 > H2 (per card).
- Lists use `<ol>` and `<ul>` for proper screen reader navigation.
- No interactive elements beyond header nav (no special accessibility requirements beyond baseline).

---

## 6. 404 Page

### 6.1 Layout (375px viewport)

```
+------------------------------------------+
| basketch              Deals   About      |
+------------------------------------------+
|                                          |
|                                          |
|                                          |
|           Page not found                 |  <- H1, 24px, Bold, centered
|                                          |
|           The page you are looking       |
|           for does not exist or has      |
|           been moved.                    |  <- 16px, muted, centered
|                                          |
|           [ Go to home page ]            |  <- Primary button
|           [ Browse this week's deals ]   |  <- Outline button
|                                          |
|                                          |
|                                          |
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |
+------------------------------------------+
```

### 6.2 Component Hierarchy

```
NotFoundPage
  Header (shared)
  CenteredContent
    H1: "Page not found"
    Description
    HomeButton -> /
    DealsButton -> /deals
  Footer (shared)
```

### 6.3 Content / Copy

| Element | Text |
|---------|------|
| H1 | "Page not found" |
| Description | "The page you are looking for does not exist or has been moved." |
| Primary CTA | "Go to home page" |
| Secondary CTA | "Browse this week's deals" |

### 6.4 Visual Spec

- Content vertically and horizontally centered in the main area.
- Generous vertical padding (80px top, 48px between elements).
- Buttons stacked vertically with 12px gap between them, full-width (matching home page CTA pattern, constrained by the 640px max-content container).

### 6.5 Accessibility

- HTTP status code 404 returned by server (Vercel routing).
- `<h1>` announces the error. Description provides recovery options.
- Both navigation buttons have clear, descriptive text.

---

## 7. Wordle Verdict Card (Standalone Component)

The Wordle card is the primary growth mechanism. It is designed to be screenshotted and shared in WhatsApp groups. It must be self-contained, readable after image compression, and branded.

### 7.1 Visual Spec

```
+----------------------------------------------+
|                                              |  <- 24px top padding
|  basketch                                    |  <- 20px, Bold, white
|  This Week's Verdict                         |  <- 14px, muted gray (#9CA3AF)
|  Week of 7 April 2026                        |  <- 14px, muted gray
|                                              |  <- 20px spacing
|  +------------------------------------------+
|  |  [Orange bar]  MIGROS leads Fresh         |  <- 18px, Bold, white
|  |                12 deals  |  avg 28% off   |  <- 14px, light gray
|  +------------------------------------------+
|                                              |  <- 12px spacing
|  +------------------------------------------+
|  |  [Green bar]   COOP leads Household       |  <- 18px, Bold, white
|  |                8 deals  |  avg 35% off    |  <- 14px, light gray
|  +------------------------------------------+
|                                              |  <- 12px spacing
|  +------------------------------------------+
|  |  [Gray bar]    Tied on Long-life          |  <- 18px, Bold, white
|  |                15 deals each              |  <- 14px, light gray
|  +------------------------------------------+
|                                              |  <- 24px spacing
|  ------------------------------------------ |  <- 1px border line
|                                              |
|  basketch.ch                                 |  <- 14px, white, Bold
|  Your weekly promotions, compared.           |  <- 12px, muted gray
|                                              |  <- 20px bottom padding
+----------------------------------------------+
```

### 7.2 Design Specs

- **Dimensions:** Fixed width 360px, height auto (approximately 420-480px depending on content). Portrait aspect ratio optimized for phone screens.
- **Background:** Dark navy (`#1a1a2e`). Chosen because: (1) looks good on both light and dark WhatsApp backgrounds, (2) survives compression better than white (fewer artifacts), (3) creates visual distinction from the rest of the page.
- **Corner radius:** 16px.
- **Border:** 1px solid `#2d2d44` (subtle, barely visible).

**Typography (larger than page typography for compression survival):**

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| "basketch" | 20px | Bold | White (#FFFFFF) |
| "This Week's Verdict" | 15px | Regular | Light gray (#9CA3AF) |
| "Week of [date]" | 15px | Regular | Light gray (#9CA3AF) |
| Category winner line | 18px | Bold | White (#FFFFFF) |
| Deal stats | 15px | Regular | Light gray (#D1D5DB) |
| "basketch.ch" | 15px | Bold | White (#FFFFFF) |
| Tagline | 13px | Regular | Light gray (#9CA3AF) |

**Category result rows:**

Each row has a 6px-wide colored bar on the left edge:
- Migros winning: Orange bar (`#e65100`)
- Coop winning: Green bar (`#007a3d`)
- Tie: Gray bar (`#6B7280`)

Row background: Slightly lighter than card background (`#242444`), 8px radius, 16px padding.

**Content per row:**

| State | Winner line | Stats line |
|-------|------------|------------|
| Migros wins | "MIGROS leads [Category]" | "[X] deals | avg [Y]% off" |
| Coop wins | "COOP leads [Category]" | "[X] deals | avg [Y]% off" |
| Tie | "Tied on [Category]" | "[X] deals each" |
| Not enough data | "Not enough data for [Category]" | "Fewer than 3 deals" |

### 7.3 States

**Normal (all 3 categories have verdicts):** Show 3 category rows as designed above.

**Partial (one or two categories below threshold):** Show available verdicts. For below-threshold categories, show "Not enough data for [Category]" with gray bar and muted stats.

**Stale data:** Add an amber line at the bottom of the card, above the branding: "Deals may be outdated -- last updated [date]" in 12px amber text.

**No data:** Do not render the card at all.

### 7.4 Rendering and Sharing

- The card is ALWAYS rendered as a regular DOM element on the page (HTML + CSS). It is never pre-rendered as an image. The `html2canvas` library is ONLY loaded when the user taps "Copy card" -- it is not included in the main bundle. This is critical for performance (see Architecture ADR-005).
- **"Copy card" button** (positioned below the card, outside its bounds):
  1. On tap: lazy-load `html2canvas` via dynamic `import()`.
  2. Render the card DOM element as a canvas.
  3. Convert to PNG blob.
  4. Copy blob to clipboard via `navigator.clipboard.write()`.
  5. Show "Card copied!" toast for 2 seconds.
  6. Fallback (Firefox, clipboard failure): download as `basketch-verdict.png` via `<a download>`.

- **Screenshot optimization:**
  - No gradients (compress poorly in WhatsApp).
  - No text smaller than 13px.
  - No fine lines thinner than 2px. Indicator bars are 6px minimum.
  - High contrast text on dark background.
  - Card has its own background (not transparent).

### 7.5 Placement

On the home page, the Wordle card appears BELOW the category cards and ABOVE the "Browse all deals" CTA. The verdict banner is the 5-second answer. The category cards are the 15-second depth. The Wordle card is a sharing artifact -- it does not add informational value beyond what the verdict banner provides, so placing it third preserves the information hierarchy while keeping it visible.

The "Copy card" button sits directly below the card. The "Share verdict" button remains in the verdict banner area (shares the page URL, not the card image).

### 7.6 Accessibility

- Card has `role="img"` with a comprehensive `aria-label`: "This week's verdict: Migros leads Fresh with 12 deals averaging 28% off. Coop leads Household with 8 deals averaging 35% off. Tied on Long-life with 15 deals each."
- The card content is also available as screen-readable text in the VerdictBanner above it, so the card is supplementary (not the only source of this information).
- "Copy card" button has text label "Copy verdict card".

---

## 8. Shared Components

### 8.1 Header

```
+------------------------------------------+
| [Skip to main content]                   |  <- Visually hidden, first focusable element
| basketch              Deals   About      |
+------------------------------------------+
```

- **Skip navigation:** A visually hidden "Skip to main content" link is the first focusable element on every page. It becomes visible on keyboard focus (`:focus-visible`). Links to `#main-content` on the `<main>` element. This is a WCAG AA requirement for keyboard users.
- Sticky top, white background, 1px bottom border.
- Height: 56px (12px vertical padding + content).
- Logo: "basketch" in 20px, Bold. Links to `/`.
- Nav links: "Deals" -> `/deals`, "About" -> `/about`. 14px, muted color. 16px gap between links.
- Active nav link: `accent` color, SemiBold.
- On comparison page, add "My List" link before "Deals" (links to the user's comparison URL, stored in localStorage).
- All nav links have 44px minimum touch target height (flex + align-items: center).

### 8.2 Footer

```
+------------------------------------------+
|  basketch -- your weekly promotions,     |
|  compared. Migros vs Coop.              |
+------------------------------------------+
```

- Centered text, 12px, muted.
- 24px vertical padding.
- 1px top border.
- Below the content, include: "Data from Migros API and aktionis.ch" in 11px, muted. This is a transparency signal.

### 8.3 DataFreshness Component

Shows when data was last updated. Appears on every page that shows deal data.

- Default: "Deals updated: Thu 10 Apr" -- 12px, muted.
- Stale (> 7 days): Amber warning bar below the freshness text: "Deals may be outdated -- last updated [date]". Background: `#FFFBEB`, text: `--warning`, 12px padding, 6px radius.
- Missing store: "[Store] data unavailable this week" in the same amber style.

Uses `<time>` element with `datetime` attribute for machine readability.

### 8.4 StepProgressBar Component

Used on the onboarding page. Three horizontal bars showing progress.

```
[====][====][    ]    Step 2 of 3
```

- Three bars in a row, each `flex: 1`, 4px height, 2px radius.
- Completed: `success` green (`#147a2d`).
- Current: `accent` blue (`#2563EB`).
- Future: `border` gray (`#E5E5E5`).
- Gap between bars: 4px.
- Step label: "Step [X] of 3" -- 12px, muted, right-aligned or below bars.
- `role="progressbar"` with `aria-valuenow`, `aria-valuemin="1"`, `aria-valuemax="3"`.
- Each bar has `aria-label`: "Step 1: Choose a starter pack (completed)".

### 8.5 LoadingSpinner Component

Consistent loading indicator used across all pages.

- CSS-only spinner: 24px circle, 3px border, `border-color: var(--color-border)`, `border-top-color: var(--color-accent)`, `animation: spin 0.8s linear infinite`.
- Accompanied by text: "Loading..." or a contextual message.
- Centered vertically with 48px top padding.

### 8.6 ErrorCard Component

Consistent error display used across all pages.

- Background: `#FEF2F2` (light red).
- Border: 1px solid `#FECACA`.
- Text: `var(--color-error)` (`#dc2626`). **Important:** Any existing `.error-msg` class that references `var(--color-coop)` must be changed to `var(--color-error)`. Coop is now green, which is wrong for error messages.
- Padding: 16px. Radius: 8px.
- Always includes a recovery action (Retry button, or link to home/onboarding).
- `role="alert"` for screen reader announcement.

### 8.7 Toast Component

Brief confirmation messages that appear and disappear.

- Position: Fixed, bottom center, 24px from bottom.
- Background: `#1A1A1A` (dark). Text: white. Radius: 8px. Padding: 12px 20px.
- Auto-dismiss after 2 seconds.
- Examples: "Link copied!", "Card copied!", "Item added", "Item removed".
- `role="status"` with `aria-live="polite"`.

---

## 9. Interaction Design Patterns

### 9.1 Navigation

| From | To | Trigger | Transition |
|------|----|---------|------------|
| Home | Deals | Tap "Deals" in header or "Browse all deals" CTA | Standard page navigation |
| Home | Onboarding | Tap "Set up my list" CTA | Standard page navigation |
| Home | Comparison | Email lookup success | Redirect after 1.5s |
| Home | About | Tap "About" in header | Standard page navigation |
| Deals | Home | Tap logo | Standard page navigation |
| Onboarding | Comparison | Complete step 3 (save or skip) | Redirect after 1.5s (save) or immediately (skip) |
| Comparison | Onboarding | Tap "Edit my list" | Standard page navigation |
| Any | 404 | Invalid URL | React Router catch-all |

### 9.2 Form Patterns

All forms follow the same interaction model:

- **Validation:** Client-side, on submit (not on blur). Email validated with standard regex.
- **Submit button:** Text changes to loading state ("Saving...", "Searching...", "Finding...").
- **Success:** Green confirmation text or redirect.
- **Error:** Red text below the input. Input border turns red. `role="alert"` on error message.
- **Enter key:** Submits the form.

### 9.3 Scroll Behavior

- **Home page:** Natural vertical scroll. No snapping.
- **Deals page:** Category pills are sticky below the header when scrolling. Deal sections scroll naturally.
- **Comparison page:** Natural vertical scroll. SplitList sections are collapsible by tapping the section header (optional enhancement -- default is all expanded).
- **Onboarding:** No scroll on step 1 (all packs visible). Step 2 may scroll if many items. Step 3 fits on screen.

### 9.4 Loading Strategy

| Data | When fetched | Cache duration |
|------|-------------|----------------|
| Verdict + category summaries | Home page mount | 1 hour (localStorage) |
| All deals (for browsing) | Deals page mount | 1 hour (localStorage) |
| Starter packs | Onboarding step 1 mount | 1 hour (localStorage) |
| Favorites comparison | Comparison page mount | 1 hour (localStorage) |
| Product search results | On search submit | No cache (live query) |

Data updates weekly. 1-hour cache means users see fresh data within an hour of pipeline completion, while avoiding redundant queries during a single browsing session.

---

## 10. OG Meta Tags (Per Page)

Each page sets these tags via `react-helmet-async` (client-side) AND Vercel Middleware (server-side for crawlers).

| Page | og:title | og:description |
|------|----------|----------------|
| `/` | "basketch -- Migros vs Coop deals this week" | "Which store has better promotions this week? Your weekly Migros vs Coop deals, compared." |
| `/deals` | "All deals this week -- basketch" | "Browse Migros and Coop promotions side by side. Sorted by discount." |
| `/onboarding` | "Set up your list -- basketch" | "Pick your regular groceries and compare deals every week. 60-second setup." |
| `/compare/:id` | "My grocery deals -- basketch" | "See your personalized Migros vs Coop comparison." |
| `/about` | "About basketch" | "How basketch compares Migros and Coop weekly promotions." |

All pages also set:
- `og:url`: Full canonical URL
- `og:image`: Static 1200x630px social preview image (basketch logo + tagline + Migros/Coop branding)
- `og:type`: "website"
- `twitter:card`: "summary_large_image"
- `theme-color`: "#1a1a2e" (dark navy, matches Wordle card background)
- `canonical`: Full URL
- `apple-touch-icon`: 180x180px basketch icon

---

## 11. Responsive Behavior Summary

All pages are designed mobile-first at 375px. The content max-width is 640px on all pages.

| Page | Mobile (< 640px) | Desktop (640px+) |
|------|-------------------|-------------------|
| Home | Single column, full-width cards | Same layout, centered at 640px |
| Deals | Store sections stacked (Migros, then Coop). Pills horizontal scroll. | Side-by-side columns at 768px+. Pills wrap naturally. |
| Onboarding | Pack cards 2-column. Favorites list full-width. | Same layout, centered at 640px |
| Comparison | CompareCards full-width. Store columns always 2-column within each card. | Same layout, centered at 640px |
| About | Stacked cards | Same layout, centered at 640px |
| 404 | Centered content | Same layout, centered at 640px |

The only page that changes layout at wider viewports is the Deals page, where the side-by-side Migros/Coop column view appears at 768px.

---

## 12. Accessibility Checklist (All Pages)

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| 4.5:1 contrast (normal text) | All text colors verified against backgrounds. See Section 0.1. | Required |
| 3:1 contrast (large text / UI) | Store colors on white: Migros 4.6:1, Coop 5.3:1. Both pass. | Required |
| 44px touch targets | All buttons, links, pills, inputs enforce `min-height: 44px`. | Required |
| Skip navigation | Visually hidden "Skip to main content" link as first focusable element on every page. Visible on `:focus-visible`. | Required |
| Keyboard navigation | All interactive elements reachable via Tab. Enter/Space activates. Arrow keys for pill navigation (roving tabindex). | Required |
| Visible focus states | 2px solid accent ring with 2px offset on all focusable elements. | Required |
| Screen reader support | Semantic HTML (`nav`, `main`, `section`, `article`, `h1-h3`). `aria-label` on icon buttons and complex components. | Required |
| No color-only information | Store-colored elements always have text labels ("Migros", "Coop"). Verdict uses both color and text. Badges have text content. | Required |
| Reduced motion | Respect `prefers-reduced-motion: reduce`. Disable spinner animation, use instant state changes. | Required |
| Language | `<html lang="en">` set. Product names in German are not translated (source data). | Required |

---

## 13. Design Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Dark Wordle card background | Survives WhatsApp compression. Stands out on both light/dark backgrounds. Creates visual "object" that invites screenshotting. |
| 2 | Verdict -> Category cards -> Wordle card on home page | PRD: verdict is the "aha moment" (5 seconds). Category cards are the depth (15 seconds). Wordle card is a sharing artifact -- placing it third prevents it from creating a "wall" that pushes category cards 800px down on mobile. |
| 3 | Wordle card visible on page (not behind a button) | The card should feel like content, not a hidden feature. Users naturally screenshot things they see on screen. Hiding it behind "Share" reduces discoverability. |
| 4 | Deals page has a desktop two-column layout | Deals browsing is the one flow where side-by-side comparison adds clear value. All other pages work fine at 640px single-column. |
| 5 | "Track your items" is secondary to "Browse all deals" | PRD feature sequencing: verdict + deals = aha moment (zero setup). Favorites = retention (requires setup). The home page reflects this priority order. |
| 6 | Email is optional in onboarding step 3 | Users can skip email and just bookmark the URL. Both return paths are primary. Forcing email would increase drop-off. |
| 7 | No product detail pages | V1 is a weekly utility used for 30 seconds. Deal cards show all necessary info inline. A detail page adds navigation complexity without adding value. |
| 8 | Fixed 360px Wordle card width | Optimized for phone screen capture. Most phones are 375px+, so the card fits with margin. Fixed width ensures consistent screenshot appearance across devices. |
| 9 | Category pills use horizontal scroll on mobile | 11 categories do not fit in a grid. Horizontal scroll is a familiar mobile pattern (Netflix, App Store). First pill ("All") always visible. |
| 10 | Coop transparency label on comparison page only | The two-tier status is only relevant for personal favorites (where data asymmetry matters). The deals browsing page uses symmetric data, so no disclaimer needed. |
| 11 | Store name header "Deals" instead of "My List" as primary nav | First-time visitors have no list. "Deals" is the zero-setup entry point. "My List" appears in nav only after the user has created a list (detected via localStorage). |
| 12 | H1 on home page is a question | "Which store has better promotions this week?" -- question headlines create curiosity and match the user's mental model. They arrived because they want to know the answer. The verdict banner immediately below answers it. |

---

## 14. Component Inventory

Complete list of components to build, grouped by category:

### Layout
| Component | File | Used on |
|-----------|------|---------|
| `Layout` | `Layout.tsx` | All pages (header + main + footer) |
| `Header` | `Header.tsx` | All pages |
| `Footer` | `Footer.tsx` | All pages |

### Shared UI
| Component | File | Used on |
|-----------|------|---------|
| `Button` | `ui/Button.tsx` | All pages |
| `Card` | `ui/Card.tsx` | All pages |
| `Input` | `ui/Input.tsx` | Home, Onboarding, Comparison |
| `Badge` | `ui/Badge.tsx` | Comparison, Deals |
| `Toast` | `ui/Toast.tsx` | Home, Comparison, Onboarding |
| `LoadingSpinner` | `ui/LoadingSpinner.tsx` | All data-fetching pages |
| `ErrorCard` | `ui/ErrorCard.tsx` | All data-fetching pages |
| `DataFreshness` | `DataFreshness.tsx` | Home, Deals, Comparison |
| `StepProgressBar` | `StepProgressBar.tsx` | Onboarding |

### Home Page
| Component | File | Purpose |
|-----------|------|---------|
| `HeroSection` | `HeroSection.tsx` | H1 + subtitle |
| `VerdictBanner` | `VerdictBanner.tsx` | Weekly verdict + transparency line |
| `WordleCard` | `WordleCard.tsx` | Screenshot-friendly verdict card |
| `CategoryCard` | `CategoryCard.tsx` | Category summary (x3) |
| `EmailLookup` | `EmailLookup.tsx` | Returning user email lookup |
| `ShareButtons` | `ShareButtons.tsx` | Share verdict + copy card |

### Deals Page
| Component | File | Purpose |
|-----------|------|---------|
| `CategoryFilterPills` | `CategoryFilterPills.tsx` | Horizontal category filter |
| `StoreSection` | `StoreSection.tsx` | Store header + deal list |
| `DealCard` | `DealCard.tsx` | Single deal display |

### Onboarding
| Component | File | Purpose |
|-----------|------|---------|
| `TemplatePicker` | `TemplatePicker.tsx` | Starter pack selection grid |
| `FavoritesEditor` | `FavoritesEditor.tsx` | Editable favorites list |
| `ProductSearch` | `ProductSearch.tsx` | Search and add products |
| `EmailCapture` | `EmailCapture.tsx` | Optional email save |

### Comparison
| Component | File | Purpose |
|-----------|------|---------|
| `SplitList` | `SplitList.tsx` | Grouped sections by recommendation |
| `CompareCard` | `CompareCard.tsx` | Side-by-side store comparison per item |
| `CoopTransparencyLabel` | `CoopTransparencyLabel.tsx` | Coop data disclaimer |
| `SaveSection` | `SaveSection.tsx` | URL display + copy + share |

### Pages
| Page | File | Route |
|------|------|-------|
| `HomePage` | `pages/Home.tsx` | `/` |
| `DealsPage` | `pages/Deals.tsx` | `/deals` |
| `OnboardingPage` | `pages/Onboarding.tsx` | `/onboarding` |
| `ComparisonPage` | `pages/Comparison.tsx` | `/compare/:id` |
| `AboutPage` | `pages/About.tsx` | `/about` |
| `NotFoundPage` | `pages/NotFound.tsx` | `/*` (catch-all) |
