# UX Research: Unified Deal Discovery + Shopping List Journey

**Author:** UX Research Agent
**Date:** 21 April 2026
**Status:** Draft — for PM + design review
**Purpose:** Inform the redesign that merges the Deals browsing page and My List into a single unified experience

---

## How to read this document

Each question is answered with 2–3 specific, actionable findings. For each finding:
- **What it is** — the concrete pattern used by a world-class app
- **Why it works** — the UX principle behind it
- **Basketch adaptation** — exactly how to apply it to basketch's context

A "Top 5 Patterns to Steal" section at the end ranks by implementation ease.

---

## Question 1: How do grocery apps combine deals + list?

### Finding 1.1 — REWE / EDEKA: Pin icon on deal card = instant list add

**What it is:** In the REWE and EDEKA apps (Germany), every deal card on the Angebote (offers) page has a pin or bookmark icon. Tapping the pin adds the deal directly to the user's shopping list — no page navigation, no modal, no confirmation screen. The list is auto-sorted by category, so the added item appears in the right section immediately. EDEKA's help copy explicitly says: "fill your shopping list with favourite products or with one click on offers and coupons."

**Why it works:** The user is in deal-browsing mode. Forcing them to switch to a separate "list" context creates a context switch that breaks the browsing flow. A single tap that says "I want this" — without leaving the deals page — respects the user's current intent. The auto-sort-by-category means the list stays organised without any user effort.

**Basketch adaptation:** Every deal card on the Deals page should have a single-tap add button ("+") that adds the item to the user's personal list without navigation. The user should never leave the Deals page to do this. The My List page then shows the items grouped by BROWSE_CATEGORY — exactly the redesign already proposed in `ux-mylist-category-redesign.md`. This confirms that pattern is the right direction.

---

### Finding 1.2 — Instacart: Floating cart + "add to cart = add to list" are the same action

**What it is:** On Instacart, there is no separate "shopping list" and "cart" — they are the same object. When a user browses a deals section (sale items, weekly specials), tapping "+ Add" on any product puts it directly into their cart. A floating cart icon in the bottom navigation shows a live count of items and updates immediately. On mobile, after adding an item the floating cart displays a brief confirmation message and updates the badge count. There is no intermediate step between "I see a deal" and "it is in my cart."

**Why it works:** Every extra tap between discovery and commitment is a drop-off risk. Instacart's unification eliminates the "save for later vs. add to cart" decision entirely — browsing deals and building your shop list are the same gesture. The persistent floating cart creates spatial awareness: users always know how many items they have, without having to navigate away.

**Basketch adaptation:** The current split between Deals page (browse) and My List page (personal items) maps reasonably to "two separate objects." The redesign should make the deal-to-list addition feel as seamless as Instacart's cart — one tap, instant visual feedback, no screen change. A persistent list count indicator in the nav bar (showing "N items in your list") would give the same spatial awareness as Instacart's floating cart badge.

---

### Finding 1.3 — Kroger: "Clip" coupon action bridges deal discovery to shopping

**What it is:** Kroger's app has a dedicated Savings tab with weekly digital deals. Each deal card has a single "Clip" button. Tapping Clip: (a) saves the coupon to your loyalty card so the discount applies automatically at checkout, and (b) offers an inline "Shop All Items" link that takes you directly to all qualifying products for that deal. The transition from "I clipped a deal" to "I'm now shopping for that item" is a single additional tap.

**Why it works:** Clipping creates commitment — it is a light, frictionless action that signals intent without requiring a full decision. The "Shop All Items" followthrough gives users who want to act immediately a direct path, while users who just want to save the deal for later can ignore it. The dual-function (discount saved + browseable) means no deal is ever "just information."

**Basketch adaptation:** When a user taps "+ Add" on a deal card in basketch, the deal should be added to their list AND visually marked on the card as "in your list" for the duration of the session. This mirrors Kroger's "clipped" state. A user who returns to the Deals page mid-session should see which deals they have already added (so they don't add duplicates). This is a state management requirement, not just a visual one.

---

## Question 2: Add / Remove toggle patterns

### Finding 2.1 — Baymard Institute: The quantity-selector transformation is the gold standard for grocery

**What it is:** Baymard's grocery UX research (confirmed by their 2024 and 2025 benchmarks) establishes one clear best-practice: when a user adds a grocery item, the "Add" button should transform into a quantity selector (− 1 +). The item count becomes the remove mechanism — decrementing to 0 removes the item. This was tested across Walmart, Kroger, HEB, Safeway, and UK grocers, and was consistently rated as most intuitive.

**Why it works:** Grocery users add multiples of the same item (2 packs of butter, 3 tins of tomatoes). A simple "Added / Remove" toggle with no quantity control does not serve this. The quantity selector solves two problems at once: it confirms the add visually (the button shape changes entirely) AND it gives immediate control over quantity. Baymard notes users described this as "like grabbing things off a real shelf" — the analogy to physical shopping is strong.

**Basketch adaptation:** basketch's use case is a personal list tracker, not a quantity-based cart. Users are tracking "I buy milk regularly, is it on deal?" — not "I want 4 litres of milk." The quantity selector is overkill here. The right adaptation is a binary toggle: "+" to add (empty circle or outline icon), transforms to a filled checkmark or filled circle icon when added. Tapping again removes it. This is simpler than Baymard's quantity pattern but appropriate for basketch's context (deal interest tracking, not cart quantity management).

---

### Finding 2.2 — Nielsen Norman Group: Persistent state change + badge count is required

**What it is:** NN/G's research ("Adding an Item to a Shopping Cart: Provide Clear, Persistent Feedback") is unambiguous: the add-to-list/cart button must change state persistently, not transiently. A transient change (button turns green for 2 seconds, then reverts) causes users to re-add items accidentally. The correct pattern is: (1) the button visually changes and stays changed until the item is removed, AND (2) a running count elsewhere on the page also updates (header badge, bottom nav count, etc.).

NN/G warns specifically against the pattern of reverting the button label after a few seconds — it creates false confidence that users have NOT added the item when they have.

**Why it works:** Grocery users scan fast and add many items. If the "added" state is transient, users lose track of what they already have. The persistent state change answers "did I add this?" without requiring memory or navigation to the list.

**Basketch adaptation:** On every deal card, the "+" add button must have a persistent "added" state — visually different until the user explicitly removes it. Recommended: the button changes from an outline "+" icon to a filled checkmark icon, with the icon color switching from `--color-accent` (blue) to `--color-success` (green). This state must persist for the whole session and ideally persist to the user's saved list in the database.

---

### Finding 2.3 — Micro-interaction: 200–300ms animation confirms the action emotionally

**What it is:** Design research across mobile app animation best practices establishes that add-to-cart/list confirmation animations should be 200–300ms. Common patterns used by top apps: (a) a brief color pulse from white to the "added" color, (b) a small bounce or scale-up (1.0 → 1.1 → 1.0) on the button icon, (c) an arc animation where the item appears to "fly" into the list/cart count in the nav bar.

The "arc fly" pattern (item icon flies from card to the list counter in the nav) is used by Amazon, some Instacart implementations, and supermarket apps. It is the strongest spatial metaphor — the user sees the item go somewhere.

**Why it works:** The 200–300ms window is fast enough to not feel sluggish, slow enough to be registered consciously. It answers the question "did my tap work?" without requiring the user to verify on the list. It builds confidence in the app's responsiveness.

**Basketch adaptation:** When a user taps "+ Add" on a deal card, implement a simple scale bounce (100–200ms, CSS transform) on the icon, combined with the persistent color+icon change from finding 2.2. The arc-to-nav animation is optional (higher complexity) but would make basketch feel premium. Start with the bounce; add the arc if time allows.

---

## Question 3: WhatsApp-shareable shopping lists

### Finding 3.1 — EDEKA and REWE: "Share list" exports to native share sheet as plain text

**What it is:** Both the REWE and EDEKA apps include a share function on their shopping lists. Tapping "Share" triggers the platform's native share sheet (iOS UIActivityViewController, Android Intent.createChooser), which lets the user choose any app — including WhatsApp, iMessage, Telegram, email. The list is exported as plain text, line-by-line, without any app-specific formatting or basketch branding. EDEKA's copy confirms: "The share function makes it easy to send the list to friends and family."

**Why it works:** The native share sheet is the correct pattern because: (a) it works with every messaging app without needing a WhatsApp API key or deep link, (b) it is zero-friction for the user — they know where WhatsApp is in their own share sheet, (c) it future-proofs the feature — new messaging apps get supported automatically. No custom integration needed.

**Basketch adaptation:** The "Share list" button on the My List page should call the Web Share API (`navigator.share()`) on mobile browsers, with a fallback "Copy to clipboard" for desktop. The shared text should be pre-formatted as a plain-text list, grouped by store. Example format:

```
My basketch list — week of 21 Apr

At Migros:
• Milch 1L (CHF 1.10, -27%)
• Karotten 1kg (CHF 0.95, -37%)

At Coop:
• Emmentaler 200g (CHF 2.80, -20%)

Not on deal this week:
• Pasta, Eggs, Butter
```

This is copy-pasteable into any chat without needing the recipient to have the app.

---

### Finding 3.2 — No app currently does multi-store split text natively well — this is basketch's differentiator

**What it is:** Research across Bring!, AnyList, Our Groceries, WiseList, and Instacart shows that none of them generate a "buy X at Store A, buy Y at Store B" split text list for sharing. Bring! lets users create separate lists per store, but there is no "generate a summary split by store" export. AnyList shares a flat list by category, not by store. This gap is confirmed by the absence of such a feature in all competitive analyses found.

**Why it works (for basketch):** Swiss shoppers splitting their weekly shop between Migros and Coop — which is the core basketch user scenario — have no tool that generates "go to Migros for X, go to Coop for Y" in shareable text. A WhatsApp message that says exactly this is the killer use case that current tools do not serve.

**Basketch adaptation:** The "Copy to WhatsApp" feature described in `docs/whatsapp-sharing-guide.md` is not just a sharing feature — it is a product differentiator. The exact format (grouped by store, deal price shown, non-deal items listed separately) is the unique value. Priority: implement this before any other sharing feature. The Web Share API approach (finding 3.1) is the right delivery mechanism.

---

### Finding 3.3 — "Copy to clipboard" is the reliable universal fallback

**What it is:** Web Share API (`navigator.share()`) works on iOS Safari, Chrome Android, and recent desktop Chrome/Edge — but not on all browsers. The universal fallback is `navigator.clipboard.writeText()` (copy to clipboard), which works everywhere. The pattern used by productivity apps like Any.do and task managers is: try Web Share API first, if unavailable (or user cancels), fall back to Copy to clipboard with a brief "Copied!" toast confirmation.

**Why it works:** Clipboard copy requires the user to then manually open WhatsApp and paste — one extra step vs. the native share sheet. But it always works. For Swiss users on desktop (where many check deals from a laptop), clipboard copy is actually the primary path. The "Copied!" toast (1.5–2 second auto-dismiss) confirms success without requiring navigation.

**Basketch adaptation:** Implement: `try { await navigator.share({text: listText}) } catch { await navigator.clipboard.writeText(listText); showToast("Copied!") }`. The button label should be "Share list" (not "Copy") so it feels like sharing, even when it falls back to clipboard copy. Never label it "WhatsApp" — the native share sheet surfaces WhatsApp naturally.

---

## Question 4: Product data completeness on deal cards

### Finding 4.1 — Name + quantity/weight is non-negotiable — without it, users cannot identify the product

**What it is:** Baymard's Online Grocery research identifies product identification as the #1 confusion point. When product names appear without quantity/weight (e.g., "Karotten" instead of "Karotten 1kg"), users cannot compare across stores or verify the deal when they reach the shelf. Instacart's category page URLs confirm their data model always combines name + quantity: `/fresh-vegetables/cucumbers`, shown as "Persian Cucumbers 1 lb" (name + weight always together). REWE's shop page shows "Karotten 1kg" as the default display name, never just "Karotten."

**Why it works:** In grocery, "Karotten" and "Karotten 1kg" are completely different purchase decisions. Without the weight, a user cannot assess if the CHF 0.95 deal is good value. They must click through to the product page to find out — which is exactly the friction grocery apps are designed to eliminate.

**Basketch adaptation:** Deal cards must always show Name + Weight/Quantity together as one inseparable unit: "Karotten 1kg", "Milch 1L", "Emmentaler 200g". This should be enforced at the data pipeline level, not just the display layer. If weight is missing from the source data, the card should show "Karotten (check label)" rather than just "Karotten". A product card without weight is incomplete, not just suboptimal — it fails the user.

---

### Finding 4.2 — The five-field minimum for a deal card that feels complete

**What it is:** Cross-referencing Instacart, REWE, Kroger, and Baymard benchmarks, the minimum data set for a grocery deal card that users rate as "complete" is:
1. **Product image** (even a low-res thumbnail — absence creates distrust)
2. **Name + weight/quantity** (as one string, never separated)
3. **Deal price** (current promotion price, prominent, large)
4. **Original price** (shown as strikethrough, required to frame the deal)
5. **Discount percentage** (e.g., "-37%", high-contrast badge — the number users actually scan first on a deals page)

Every additional field (brand, store badge, expiry date, stock level) is a "nice to have." The five above are the threshold below which users report the card as "not enough information to decide."

**Why it works:** The mental job of a deals browser is "is this a good deal for what I want?" They need to know: what is it exactly (name + weight), how much is it now, how much was it before, and how good is the saving as a percentage. These five data points answer that question entirely. An image creates trust and pattern recognition (users scan images faster than text).

**Basketch adaptation:** The current deal card design should be checked against this five-field checklist. If any field is missing from the live data pipeline, it is a data quality issue, not a design issue. Cross-reference with `docs/arch-data-quality.md`. The discount badge ("-37%") should be the most visually prominent element on the card (larger font, high-contrast background), because that is the primary signal on a deals page.

---

### Finding 4.3 — Store badge on each card is required in a multi-store context

**What it is:** Apps that aggregate deals from multiple stores (Flipp, Rappn, Aktionis) use a store badge or store-color background on every deal card. This is absent from single-store apps (REWE's own app, Migros's own app) but standard on aggregators. The badge is typically: store logo + store brand color as a small chip in the top-left or top-right corner of the card. Flipp (the largest North American flyer aggregator) uses a prominent store logo at the top of every card because users need to know "where do I buy this?" before they can evaluate the deal.

**Why it works:** On a deals comparison page showing Migros and Coop deals interleaved, a user scanning quickly cannot evaluate a deal without knowing the store. The store badge answers "where" at the same glance as the product name answers "what."

**Basketch adaptation:** basketch's current deal cards need a store badge (store name + color chip) on every card. The store color system is already defined in `design-system.md` (`--color-migros`, `--color-coop`, etc.). Apply these as a small pill/chip on every deal card, even when cards are already grouped by store column (because users scan individual cards, not always the column header).

---

## Question 5: Category granularity in grocery apps

### Finding 5.1 — World-class grocery apps use 12–20 top-level categories, with 2 levels below "Fresh"

**What it is:** From Instacart's documented structure and their published "17 Grocery List Categories" article, their top-level navigation has approximately 17 departments including: Produce, Dairy & Eggs, Bakery, Meat & Seafood, Frozen, Pantry, Snacks, Beverages, Household, Personal Care, Baby, Health, Pet, Alcohol, Deli, Organic, and Floral/Gifts. Within "Fresh Produce" (one top-level department), there are 2 sub-levels: Level 2 = Fresh Fruit | Fresh Vegetables | Fresh Herb | Vegetable Party Trays. Level 3 = within Fresh Vegetables: Cucumbers, Tomatoes, Root Vegetables, Leafy Greens, Onions & Garlic, Mushrooms, etc.

REWE's online shop uses a similar 2-level structure under Obst & Gemüse (Fruit & Veg): Level 2 = Obst (Fruit) | Gemüse (Vegetables) | Kräuter (Herbs) | Exoten (Exotic). Level 3 = within Gemüse: Kohlgemüse (Cabbage), Wurzelgemüse (Root Veg), Paprika, Salat (Lettuce), etc.

**Why it works:** 17 top-level categories maps to the natural mental model of a physical supermarket — users do not need to learn a new taxonomy. Two levels below any major department gives enough specificity to narrow a search without overwhelming. Three levels is rare and only used for very large catalogues (Amazon's full taxonomy goes to 5+ levels, but not in the grocery context).

**Basketch adaptation:** basketch's current BROWSE_CATEGORY system (referenced in `ux-mylist-category-redesign.md`) should target 8–12 top-level categories for a deals-only app — not 17 (which reflects a full supermarket catalogue). For a promotions-only product, the right top-level categories are those that most frequently have promotional items. Suggested basketch top-level categories:
1. Fruits & Vegetables
2. Dairy & Eggs
3. Meat & Fish
4. Bakery & Bread
5. Drinks (Non-alcohol)
6. Snacks & Sweets
7. Household & Cleaning
8. Health & Beauty
9. Frozen
10. Pantry & Canned Goods
11. Alcohol (if applicable)

Two levels is sufficient for basketch — a user filtering "Drinks > Juice" is a secondary use case. The category pill filter on the Deals page should remain single-level for speed.

---

### Finding 5.2 — "Fresh" is not a category — it is a quality signal that applies across categories

**What it is:** A common mistake in grocery app design (confirmed by Baymard research) is making "Fresh" a top-level category. Users don't think "I want something fresh." They think "I want vegetables" or "I want fish." The "Fresh" label in Instacart and REWE is an attribute within subcategories (Fresh Vegetables within Produce, Fresh Fish within Meat & Seafood), not a standalone category. Apps that have tried "Fresh" as a category (e.g., early Amazon Fresh navigation) removed it in later redesigns.

**Why it works:** Categories should map to the user's purchase intent ("I need to buy meat"), not the storage/quality attribute of the product. "Fresh" as a category creates a navigation dead-end: where does fresh pasta go? Fresh juice? Fresh salad kits? It becomes unmaintainable.

**Basketch adaptation:** Do not add "Fresh" as a category in basketch's category system. If the team wants to surface fresh/perishable deals, use a filter or a "tag" on individual deal cards (e.g., a green "Fresh" badge) rather than a category. The category should always be the product type (Vegetables, Dairy, Meat), not the storage type.

---

### Finding 5.3 — The "All" category as the default view is the highest-traffic path

**What it is:** Instacart's redesigned home feed (2024) made "shop by category" the primary entry point — before even selecting a retailer. But within any retailer view, "All" (showing all departments) is the default landing state, not a specific category. Kroger's weekly ad defaults to "All Deals" before any category filtering. The pattern is universal: show everything, let users filter down.

**Why it works:** Users arrive with varying intent. Some know exactly what they want ("I need meat deals this week"). Others are browsing ("what's cheap this week?"). Defaulting to "All" serves the browser; category filters serve the specific searcher. This matches basketch's confirmed usage pattern from the PRD: users want to see this week's best deals first, then filter.

**Basketch adaptation:** The Deals page should default to "All" (the current behaviour, per `deals-page-redesign.md`) and preserve the category pill filter for narrowing down. The "All" pill should be the leftmost, always visible without scrolling. Category pills should be ordered by deal frequency (categories with the most deals this week appear first, not alphabetically). This makes the filter immediately useful rather than decorative.

---

## Top 5 Patterns to Steal

Ranked by impact-to-effort ratio (highest impact, lowest implementation effort first).

---

### #1 — Persistent "added" state on every deal card

**Impact:** Very high — solves the core UX problem of the unified journey
**Effort:** Low — CSS + state management change to existing DealCard component

**What to build:** When a user taps "+" on a deal card, the button transforms from an outline "+" (accent blue) to a filled checkmark (success green) and stays that way. Tapping again removes the item. The state persists for the session AND maps to the user's list in the database.

**Why it's #1:** This single change makes the Deals page and My List feel like one unified product rather than two separate features. A user who has "added" 5 items from the Deals page arrives on My List and sees all 5 there. The gap between the two pages disappears.

**Implementation note:** The existing DealCard component needs a `isInList` boolean prop and two icon states. The parent page needs to pass list membership down. Session state already exists in the app; this is a prop-threading exercise, not a new system.

---

### #2 — Native share sheet for WhatsApp list sharing

**Impact:** High — directly enables the core "share with family" use case
**Effort:** Low — 10–15 lines of JavaScript using the Web Share API

**What to build:** A "Share list" button on the My List page that calls `navigator.share({ text: formattedList })` on mobile (native share sheet appears, user picks WhatsApp), with `navigator.clipboard.writeText(formattedList)` + "Copied!" toast as fallback for desktop.

The `formattedList` string is pre-formatted as plain text, grouped by store (Migros first, then Coop, then other stores), with deal prices and percentages included, and non-deal items listed separately at the bottom.

**Why it's #2:** The WhatsApp sharing use case is explicitly in the PRD and in `whatsapp-sharing-guide.md`. The implementation is trivially small. The formatted text split by store is basketch's unique differentiator — no other app produces this output.

---

### #3 — Store badge on every deal card (even in grouped columns)

**Impact:** Medium-high — removes the cognitive load of knowing "which store is this deal from?"
**Effort:** Very low — add a small color-coded store pill/chip to DealCard using existing color tokens

**What to build:** A small pill (e.g., "MIGROS" in orange / "COOP" in green) in the top-right corner of every deal card. Use `var(--color-migros)` and `var(--color-coop)` from the existing design system. Show store name as text, not just color — color alone fails accessibility for colorblind users.

**Why it's #3:** When viewing "All" categories (the default), deals from multiple stores are interleaved. The store badge answers "where do I buy this?" without requiring the user to look at the column header or section label. It also makes individual deal cards shareable as screenshots — a user who screenshots a deal card and sends it to their partner can see at a glance it is a Migros deal.

---

### #4 — "Name + weight as one string" enforced in data display

**Impact:** Medium-high — eliminates the most common product identification failure
**Effort:** Very low — a display rule + data pipeline validation

**What to build:** A display rule: if `deal.weight` is present, always render as `"${deal.name} ${deal.weight}"` (e.g., "Karotten 1kg"). If `deal.weight` is absent, show `"${deal.name} (?)"` with a question mark suffix so the gap is visible in QA. Add a data quality check that flags deals with missing weight as a warning in the pipeline output.

**Why it's #4:** Users cannot assess deal value without knowing the quantity. "Milch 1L at CHF 1.10 (-27%)" is a complete deal. "Milch at CHF 1.10 (-27%)" is ambiguous — is it 1L? 500ml? 2L? The weight is 4 characters of data with outsized impact on perceived completeness.

---

### #5 — Category pill ordering by deal frequency (not alphabetical)

**Impact:** Medium — makes the category filter feel smart and useful, not decorative
**Effort:** Low — a sort function on the category pills array

**What to build:** Sort the category filter pills on the Deals page by number of deals in that category this week (descending), not alphabetically. "Fruits & Vegetables" appears first if it has 23 deals; "Alcohol" appears last if it has 3. The "All" pill is always pinned leftmost regardless.

**Why it's #5:** Category pills sorted alphabetically force users to scan all pills to find which ones are worth tapping. Sorted by frequency, the pills themselves communicate which categories are active this week. A user can see "Dairy & Eggs has a lot of deals this week" just from the pill's position. This is a data-driven navigation affordance that requires no additional screen space or UI elements.

---

*End of research document.*
