# PM Brief: Unified Journey — Deals + My List
**Author:** PM Coach Review
**Date:** 21 April 2026
**Status:** Draft — for discussion with engineer before implementation

---

## Context: What This Brief Is

The user has six new product ideas. This brief does not summarise them — it challenges them. Each idea is examined for hidden complexity, data model implications, and trade-offs that must be resolved before any code is written.

---

## 1. Name Options for the Merged Experience

The merged experience must convey two things at once: "what is on sale this week" (discovery) and "what you personally plan to buy" (planning). These are in tension — one is editorial, one is personal. A name that overweights either will mislead.

### Three Candidates

**Option A: "My Deals"**
Rationale: Short, possessive, and familiar. The "My" prefix signals personalisation; "Deals" signals the weekly content. Weak point: it could imply we track prices, not promotions. Risk of over-promising.

**Option B: "Shop Planner"**
Rationale: Captures the output (a plan for the shopping trip), not just the content (deals). Communicates end-to-end intent — from discovery to walking out the door. Language is action-oriented and universal. Weak point: slightly generic; no Swiss market flavour.

**Option C: "This Week's List"**
Rationale: Reinforces the weekly rhythm that is central to basketch's value proposition. "This week" anchors the content in time; "List" signals it is personal and actionable. Feels natural in conversation: "Have you checked your This Week's List?" Weak point: slightly long for navigation label; truncates poorly on small screens.

### Recommendation

**"My Deals"** for the navigation label. **"Shop Planner"** for the page heading and any explainer copy.

Rationale: Navigation needs to be short (fits one pill or tab). The page heading can carry the fuller concept. "My Deals" is scannable in 0.3 seconds; "Shop Planner" explains the intent once the user lands. This two-level naming is the same pattern Airbnb uses (nav: "Trips" / heading: "Your upcoming trips").

---

## 2. Unified User Journey

This is the new merged experience. It replaces the current split between `/deals` (browse all) and `/compare/:favoriteId` (personalised comparison). The journey is designed for Sarah: a weekly shopper who arrives on Thursday or Friday, not a first-time visitor.

**1. Entry — Home page**
Sarah opens basketch. She sees the weekly verdict banner and three category cards, same as today. No change here. This is zero-setup value — it works for everyone, including new visitors.

**2. Entry into the unified experience**
She taps "My Deals" in the navigation (or the "Track your items" CTA on the home page). If she has a saved list (UUID from bookmark or email lookup), she goes directly to step 4. If not, she enters the setup flow (step 3).

**3. First-time setup**
She selects a starter pack (or builds from scratch). Items are pre-loaded. She removes what she does not buy. This takes under 60 seconds. At no point is she asked for an email yet — she sees her comparison first.

**4. Discovery moment — deals + her list, unified**
She lands on the "My Deals" page. The page has two sections:
- **Top section: "On sale this week"** — only items from her list that have an active promotion. Sorted by discount percentage, grouped by store. Each card shows the product, price, discount, and a toggle button (add to shopping list / remove).
- **Bottom section: "Browse all deals"** — the full deals browsing experience, filtered to her selected stores, with the 11 category pills. This is the current `/deals` page, embedded below.

The two sections are not tabs — they are sections on one scrollable page. The personal section always appears first.

**5. Action moment — building the shopping list**
As she taps the toggle on any deal card (whether from her favourites or from the browse section), the item is added to her shopping list. A floating "My List (3)" badge appears at the bottom of the screen. She can tap it at any time to see the current list.

**6. Output moment — the shareable WhatsApp list**
She taps "My List (3)" or the "Share" button. She sees:
```
Buy at Migros: milk, carrots
Buy at Coop: cheese, yogurt
Not on sale: pasta, eggs
```
A "Share via WhatsApp" button opens the native share sheet with this text pre-filled. The message is plain text — no link, no URL, no app install required for the recipient.

**7. Return visit — next week**
She opens her bookmark. The "On sale this week" section refreshes automatically with that week's deals (pipeline ran Wednesday night). Her list items are still there. Anything now on sale moves to the top section. She reviews, adjusts her shopping list, and shares. Total time: under 30 seconds.

---

## 3. Use Case Challenges

### 3a. Merge Deals + My List: One Page or Two Tabs?

**The case for one page with sections (the user's instinct):**
The user's intuition is directionally correct. The core problem with two separate navigation items is that they create two separate mental models. "Deals" feels like a browsing tool. "My List" feels like a management tool. Neither feels like a decision-support tool. Merging them collapses that ambiguity.

**The risk:**
A merged page risks a "feature soup" problem — if the personal section and the browse section are visually similar, users will not understand which one is curated for them and which is generic. The page must have strong visual hierarchy: personal deals at the top with distinct styling, browse section clearly secondary.

**The deeper risk you have not thought about:**
The current `/deals` page is the zero-setup entry point. It works for strangers. If you collapse deals into a page that requires a saved list to be useful, you break the first-visit experience for anyone who arrives via a WhatsApp share or SEO. You cannot remove the universal browsing experience — you can only move it.

**Recommendation:**
Keep the Home page (`/`) as the zero-setup universal entry point (verdict + category cards). The merged "My Deals" page is a logged-in-equivalent view: it requires a saved list to show the personal section, but it degrades gracefully — if no list exists, it shows the full browse section only, with a CTA to set up a list. This way you get the unified experience without breaking the first-visit flow.

Do NOT retire `/deals` as a route — it is likely to be the SEO landing URL and should remain indexable.

---

### 3b. Add/Remove Toggle: Correct UX, Wrong Data Model Question

The toggle itself is correct UX. When a user has just added something, the confirmation is right there — no hunting for a "My List" screen. This is how every modern e-commerce cart works and it requires no explanation.

**But you are skipping the harder question: what IS the list now?**

Currently, basketch has a `baskets` table with a UUID. The basket contains `basket_items` — products the user tracks for personalised comparison. This is a **favourites list**: it persists across weeks, drives the comparison, and is the retention mechanism.

The new vision introduces a second concept: a **session shopping list** — the items you plan to buy THIS week, to be shared via WhatsApp.

These are two different data structures:
- Favourites: permanent, drives weekly comparison, stored in Supabase
- Shopping list: ephemeral, one per week, used to generate the WhatsApp message

**The question you need to answer before building the toggle:**
When a user taps "Add" on a deal card, which list are they adding to?

Option A: They are adding to their favourites (the persistent basket). The WhatsApp list is generated FROM the favourites, filtered to what is on sale this week. This is the current architecture, extended.

Option B: They are adding to a separate session shopping list. Favourites are set up once (starter pack flow). The shopping list is freshly built each week by toggling deal cards.

These two options have completely different implications:
- Option A: Simple data model. But it blurs the distinction between "I always buy milk" and "I want to buy milk this week because it is on sale."
- Option B: Correct conceptually. But requires a second data structure, likely stored in localStorage (or a new Supabase table), with a weekly reset mechanic.

**Recommendation:**
Build Option B, stored in localStorage. The favourites list remains for comparison purposes. The shopping list is a session-level overlay — zero server cost, zero complexity for the engineer. It resets each week (or when the user explicitly clears it). The WhatsApp export reads from the session list, not the favourites.

This keeps the data model clean. It also means the toggle does not require a UUID or server call — it is a local state operation. Much faster, no round-trip.

---

### 3c. More Granular Categories: More Is Not Always Better

**The user's instinct is right — but the solution needs bounding.**

The current 11 BROWSE_CATEGORies are correct at the macro level. The problem is that "Fruits & Vegetables" contains both a CHF 0.99 bag of apples and a CHF 12 box of organic strawberries — and the user cannot tell whether the deals in this category are relevant to them without drilling in. Granularity helps here.

**The risk:**
More categories = more navigation surfaces. On mobile, category pills are already the most friction-heavy element on the page — users must scroll horizontally through them. At 11 categories, this is acceptable. At 25, it becomes a chore. At 30+, users stop using the filter entirely and default to "All" — which defeats the purpose.

**The right question is not "how many categories" but "at what level does the user make a decision?"**

Sarah does not think "I need Dairy & Eggs." She thinks "I need yogurt." But she also does not need a category called "Drinking Yogurt vs Eating Yogurt." The right granularity is the level at which she would change her shopping behaviour — which is roughly at the product family level.

**Recommendation:**
Move from 11 to 20 categories. This is the right ceiling for mobile pill navigation without needing a collapsible/searchable UI. Do not go to 25+ without testing whether users actually use more than 15.

Five new categories that would add genuine value (each represents a distinct shopping decision):

1. **Cheese** — currently buried in "Dairy & Eggs." Cheese is a distinct purchase decision in Switzerland; it has its own section in every Swiss supermarket.
2. **Beer & Wine** — currently absent from the browse categories. Alcohol is a high-frequency promotional category in Swiss stores and a strong driver of store switching.
3. **Chilled Ready Meals** — currently merged into "Ready Meals & Frozen." Chilled meals have a different shopping urgency (buy now, eat tonight) from frozen (stock up for 2 weeks). Splitting them changes the deal value calculation.
4. **Baby & Kids** — currently not represented. This is a distinct buyer segment with high purchase frequency and strong promotional sensitivity.
5. **Pet Food** — similarly absent. A separate purchase decision, and one where promotions (especially for cat/dog food) drive genuine store switching in Switzerland.

The data pipeline already has sub-categories at a finer grain than the browse categories (see the `sub_category` column in the `products` table). Implementing new browse categories is a mapping update, not a schema change.

---

### 3d. WhatsApp Sharing: Text vs URL — Two Different Products

**The current sharing model (URL link):**
The verdict card is a visual image designed to be screenshotted. The comparison page is a URL with rich OG preview tags. Both are designed to drive recipients to open basketch.

**The user's new vision (plain text shopping list):**
"Buy at Migros: milk, carrots | Buy at Coop: cheese, yogurt"
This is a fundamentally different output. It is not designed to drive traffic — it is designed to be useful without opening any app. The recipient reads it in WhatsApp and goes shopping. No tap required.

**These are not two versions of the same feature. They serve different use cases:**

| Output type | When used | Goal | Drives traffic? |
|------------|-----------|------|-----------------|
| Verdict card (image/screenshot) | Sharing with a group for awareness | "Look at this week's deals" | Yes — curiosity drives clicks |
| URL link | Sharing your personalised comparison | "Here is my list, come see it" | Yes — recipient needs context |
| Plain text shopping list | Sharing the actual shopping plan | "Buy this at Migros, buy that at Coop" | No — self-contained |

**The plain text list is the superior sharing format for Sarah's primary use case** (splitting the shopping trip with her partner). It requires zero friction from the recipient. It does not require them to have basketch. It works if WhatsApp compresses the message. It works if they screenshot it.

**The URL link is better for the growth use case** (sharing with friends who do not use basketch yet, driving new users).

**Which to build first:**
Build the plain text shopping list first. Here is why:
1. It is what the user explicitly asked for and it directly serves JTBD-3 ("get a split shopping list").
2. It is technically simpler — it is a `navigator.share({ text: ... })` call or a clipboard copy. No image generation, no server-side rendering, no OG tag plumbing.
3. It creates a genuine habit loop: Sarah sends the list to her partner every Friday. That is the retention behaviour you want to see by week 4.
4. The URL link already exists (UC-6). You are not removing it — you are adding a new output format.

The verdict card (Wordle card) can wait. It is a growth/awareness feature. The shopping list text is a core utility feature. Do core utility first.

---

## 4. Updated Success Metrics for the Unified Experience

The current metrics (activation rate, W4 retention, weekly returning visitors) remain valid. Add these three for the new features:

**Metric 1: Shopping list export rate**
Definition: % of active sessions in a week where the user taps "Share via WhatsApp" or copies the shopping list text.
Target: 30%+ of weekly active sessions by week 6.
Why this metric: If users are building a list but not sharing it, the WhatsApp export is not the end moment they imagined — and you need to find out why. If they are sharing, the habit loop is forming.
How to measure: Log a `shopping_list_shared` event on every tap of the share button (even if the native share sheet is dismissed). Track in Vercel Analytics or a simple Supabase events table.

**Metric 2: Toggle engagement depth**
Definition: Average number of deal cards toggled (added to shopping list) per session, for sessions where at least one toggle occurs.
Target: 4+ items per session by week 4.
Why this metric: A shopping list with 1-2 items is not useful. 4+ items means the user is actively planning their shop, not just clicking once out of curiosity. If this stays below 3, the toggle mechanic is working but the discovery experience is not surfacing enough relevant deals.
How to measure: Log `item_added_to_list` events with the deal and store. Calculate average per session.

**Metric 3: Personal section engagement vs browse section engagement**
Definition: % of toggle interactions that originate from the personal "On sale this week" section vs the general browse section below.
Target: 60%+ from the personal section.
Why this metric: If most toggles come from the browse section (not the personal section), the personalisation layer is not delivering enough value to justify its complexity. That would be a signal to simplify — perhaps collapsing the two sections or rethinking the matching logic.
How to measure: Tag each `item_added_to_list` event with the source section (`personal` or `browse`).

---

## 5. Open Questions for the Engineer

These must be answered before implementation starts. They are not design questions — they are architectural decisions with build implications.

**Q1: Where is the session shopping list stored?**
The merged experience introduces a new object: a session-level shopping list (items the user plans to buy this week). This is distinct from the favourites basket (items the user always tracks). Is this stored in localStorage (zero server cost, weekly expiry), a new Supabase table (persistent, queryable, but adds complexity), or as a derived view of the existing basket filtered by this week's deals? The answer determines how the toggle behaves, whether the list survives a browser close, and whether the WhatsApp share requires a server call.

**Q2: What happens to the `/deals` route?**
If the browse section is embedded inside the new "My Deals" page, does `/deals` still exist as a standalone route? It should — for SEO and for direct links shared in WhatsApp. But does it now duplicate content that also appears at the bottom of "My Deals"? This needs a decision: either `/deals` remains the canonical browse page and "My Deals" links to it, or `/deals` is deprecated and the browse section lives only inside "My Deals."

**Q3: How does the personal section work for a user with no saved list?**
The "My Deals" page must degrade gracefully for first-time visitors. What does the page show before a list is created? Option A: show only the browse section with a CTA to create a list. Option B: show an empty personal section with onboarding copy. Option C: redirect to the onboarding flow immediately. Each has different implications for the page's information architecture and the SEO indexability of the route.

**Q4: How does the plain text shopping list handle 7 stores?**
The current architecture supports 7 stores. A WhatsApp message that says "Buy at Migros: milk, carrots | Buy at Coop: cheese | Buy at LIDL: yogurt | Buy at Denner: cleaning spray | Not on sale anywhere: pasta" is 5 lines long and may exceed comfortable reading length. Is there a store limit for the shopping list output? Does the user select which stores to include in the share? Or does the system automatically include only stores where at least 2 items are grouped? This is a UX decision with a data filtering implication.

**Q5: What is the weekly reset mechanic for the session shopping list?**
If the shopping list is localStorage-based, it needs a reset cadence. Options: (a) auto-clear every Wednesday night (when new deals load), (b) auto-clear 7 days after last modification, (c) never auto-clear — user clears manually, (d) prompt the user on their first visit each week ("Start fresh this week?"). Each option has a different UX feel and a different edge case (what if the user visits Tuesday and again Thursday — does their list carry over?). This needs a decision before the toggle mechanic is built.

---

## Summary: What to Build First

If the engineer has capacity for one sprint, the priority order is:

1. **Session shopping list in localStorage + toggle mechanic on deal cards.** This is the core of the new experience. Everything else depends on it.
2. **Plain text WhatsApp export.** This is the end moment. Build it immediately after the list mechanic — they are the same sprint.
3. **Merged "My Deals" page layout** (personal section + browse section on one page). This is a layout change, not a data change. Can be shipped as soon as Q1-Q3 above are resolved.
4. **More granular categories (20 total).** This is a data mapping update. Low risk, can be done independently of the above. Do it when the pipeline is next touched.
5. **Weight and quantity on deal cards.** This is a display change only — the data already exists in the `quantity` and `unit` columns on the `products` table. It is a one-line template change. Do it in the same pass as the card redesign.

The verdict card (Wordle card) and the URL sharing flow are not changed by this brief. They remain as specified in PRD v3.1.
