# basketch PRD — v3.2 Amendment

**Status:** Approved for build
**Supersedes:** PRD v3.1 §6 (Deals grid), §7 (Compare page), §4 (IA)
**Design owner:** Principal Product Designer
**Date:** 2026-04-22

This amendment records the changes introduced after the senior-PM review of the v2 wireframes. The core driver: **every sub-category view must surface all 7 Swiss supermarkets (Migros, Coop, Denner, LIDL, ALDI, SPAR, Volg), not just the two largest.** basketch is a market-wide comparison tool; the UX must reflect that.

---

## 1. What changed vs. v3.1

| Area | v3.1 (current PRD) | v3.2 (this amendment) |
|---|---|---|
| Home — Browse-by-Type | Present on home | **Removed.** Duplicated the Verdict. Verdict rows are now the primary entry to Deals. |
| Home — Verdict | Read-only | **Clickable.** Each verdict row deep-links to its Type/Category slice of /deals. |
| Onboarding | Blocking list-builder on first visit | **Removed as a blocker.** First visit lands on /deals. A dismissible "Starter Pack" banner replaces it. |
| IA depth | 2 levels (Type → Category) | **3 levels** (Type → Category → Sub-category). Sub-category is explicit in the filter rail, not buried under search. |
| Deals grid layout | Flat card grid, optionally grouped by store | **Sub-category bands.** Each band shows one sub-category (e.g. "Juice · 12 deals across 7 stores"). |
| Stores shown per band | 2 (cheapest Migros + cheapest Coop) | **All 7.** One hero card + price ladder + no-deal footer. (See §3.) |
| Compare page | Two-column per-store table | **Per-item price ladder** (same pattern as Deals). Default view. Per-store shopping route is a secondary tab. |
| My List panel | Text-only rows | **Thumbnails** on every row (48×48, store-tinted). |
| Return flow | Paste-link + magic-link email | **Instant email lookup.** Paste-link removed. Email is a lookup key, not a delivery channel — the server finds the list and renders it inline. No email is sent. |
| Region | Filter | **Setting chip.** Shown as a persistent chip in the header and in the left rail. |
| Empty-deals returning state | Not handled | **Friendly "no deals this week" state** with "email me when deals appear" CTA. |

---

## 2. New design primitive: the Sub-Category Band (v3 Price Ladder)

**Problem.** With 7 Swiss supermarkets tracked, showing only the top 2 stores per sub-category (v2) misrepresented the market. Users shopping in SPAR / Volg / LIDL regions saw no reason to trust the tool; users anywhere saw Denner's 36%-off beer lose to Coop's 22%-off water purely because the band was built for Migros/Coop.

**Solution.** A three-tier pattern applied to every sub-category group in Deals and every item in Compare:

### Tier 1 — Cheapest Hero
A full-size product card showing the cheapest promo in the sub-category. Visually weighted: brand-coloured left border, `★ CHEAPEST` (Deals) or `★ BUY HERE` (Compare) badge in the store's colour, large sale price, discount chip, one-tap add.

### Tier 2 — Price Ladder
A compact, single-row entry for each other store with a promo in this sub-category. Sorted cheapest first. Each row:

- 4px brand colour strip (left)
- Best-deal product name (e.g. "Gold Orange 1L")
- Store label with discount (e.g. "Migros · −30%")
- Price delta vs. the winner (e.g. "+0.15")
- Sale price
- One-tap add button

Rows for stores **without a promo** but with the item at regular price appear as a greyed ladder row (italic "regular price" delta). This is honest: users see the full market, including what they'd pay without a deal.

### Tier 3 — No-Deal Footer
A single line naming stores with no matching product this week, e.g. "📭 No juice deals at: Volg". Small, muted, but explicit — users trust the answer is complete.

---

## 3. Band rules

### 3.1 Which stores go in each tier

| Store has... | Where it appears |
|---|---|
| The cheapest matching promo | Hero (Tier 1) |
| A matching promo, not cheapest | Ladder row (Tier 2), cheapest first |
| The item at regular price, no promo this week | Greyed ladder row (Tier 2), placed after all promo rows |
| No match for this sub-category in this region | No-deal footer (Tier 3) |

### 3.2 Framing rules

- The ladder header reads: **"Other stores · best [sub-category] deal each"**
  — Not "same product." basketch compares the best-promo-per-store in a sub-category. Different SKUs (e.g. Prix Garantie Orange vs. Gold Orange) are expected and intentional.
- The verdict pill on the band head names the cheapest store only, e.g. "Coop cheapest."
- The price delta is always relative to the hero price, so users can answer "is the walk worth it?" without mental math.

### 3.3 Scale behaviour

| Sub-category size | Hero | Ladder rows shown | Long-tail |
|---|---|---|---|
| 2 deals across 7 stores | 1 | 1 | 5 stores in footer |
| 5–7 deals across 7 stores | 1 | up to 6 | 0–2 in footer |
| 20+ deals across 7 stores | 1 | 6 (store-best each) | "Show all deals in Juice →" link |

### 3.4 Layout

- **Mobile (375px):** hero on top, ladder stacks vertically below.
- **Desktop (≥1024px):** `.band-2col` — hero on left, ladder on right. Ladder header + footer stay with the ladder column.
- Brand colour is used only as a strip/border/label, never as the full card background (maintains WCAG AA legibility).

---

## 4. Compare page updates

Compare is now a per-item projection of the same price-ladder pattern:

- Each list item (e.g. "🥛 Milk 1L") is one band.
- Hero = the cheapest store for that item.
- Ladder = every other store with a promo on a matching SKU, cheapest first.
- Greyed rows = stores with regular price / different pack sizes (e.g. "Äpfel Gala 1kg · Denner · regular (1kg)").
- Footer = stores that don't carry a matching SKU.
- Verdict sentence at the top remains: "Buy X items at Migros, Y at Denner, Z at Coop — save CHF N."
- A view-toggle chip row offers: **Per-item (all 7 stores)** [default] · **Per-store (shopping route)**.
- No-deals in the user's list are collapsed into a single "📭 No deals this week · N items" strip.

---

## 5. IA & filter changes

### 5.1 Three-level filter
- **Type:** Fresh / Long-life / Household
- **Category:** the 11 BROWSE_CATEGORIES from v3.1 (Drinks, Dairy & Eggs, Fruits & Veg, Meat & Fish, Bakery, Snacks & Sweets, Pasta / Rice & More, Home & Cleaning, etc.)
- **Sub-category:** e.g. under Drinks → Water, Juice, Beer, Wine, Coffee, Tea, Soft drinks

Sub-category chips appear as a nested row in the mobile filter drawer and as a dedicated left-rail section on desktop when a category is selected. Default sub-category is "All."

### 5.2 Region
Region is now a **setting chip**, not a deal filter. Appears in:
- Mobile: top of /deals, next to the verdict strip
- Desktop: top of the left rail
Changing region re-scopes all deal data. Setting persists across sessions.

### 5.3 Store coverage visibility
The left-rail store chip list shows a deal count per store for the current filter scope, e.g. "LIDL · 27", "ALDI · 0". Stores with zero deals in the current scope are greyed but still visible — users see market coverage at a glance.

---

## 6. Home page changes

- **Removed:** "Browse by Type" block (duplicated the Verdict).
- **Verdict rows are clickable.** Each row deep-links to its Type/Category pre-filter on /deals. e.g. "Fresh · Migros (−18% avg)" → `/deals?type=fresh`.
- **Share-on-WhatsApp** for the verdict summary remains.
- **Starter Pack banner** replaces the old onboarding modal: "Use our Swiss basics list (10 items) · ×". Dismissible; non-blocking.

---

## 7. Return flow changes

### 7.1 Email is the key, not the channel (v3.2)

The v2 flow introduced a magic-link email ("Send me the link"). v3.2 removes that round-trip entirely. The email a user typed when saving is the **lookup key**; typing it again opens the list inline.

- **CTA:** "Open my list →" (not "Send me the link")
- **Behaviour:** `POST /find` with `{email}` → server looks up the most recent list saved against that email → 302 to `/c/:id` (or inline render).
- **No email is ever sent** during the return flow. The user's inbox is not involved.
- **Why:** the email was already acting as an identifier at save-time; dressing it up as a magic-link flow adds latency, inbox friction, and a false sense of security for a product that stores grocery items. Shortest path wins.

### 7.2 Privacy / threat model

Lists contain grocery items and the email key only — no payment info, no address, no identity data beyond the email. The correct threat model is therefore not "account security" but "casual curiosity":

- **In-scope concern:** someone guessing a friend's email and seeing their shopping list. Harm: near zero.
- **Out-of-scope concern:** account takeover, financial loss, PII exfil. None apply — there's no account to take over.
- **Mitigation exposed to the user:** a one-line disclosure on the Return screen: _"Lists aren't private — grocery items only, no PII beyond the email key. Anyone with the email could open the list. Don't reuse a high-security email if this worries you."_
- **If the threat model shifts later** (e.g. adding loyalty-card linkage or payment), add a magic-link verification on top of the lookup, not in place of it.

### 7.3 Other return-flow items (unchanged from earlier v3)

- **Removed:** "Paste your saved link" input card. Users with the link simply click it; bookmarks are the URL.
- **Friendly "no deals this week" state** for returning users whose list has zero matches — with an "Email me when deals appear" opt-in. (That _is_ an email being sent, but only with explicit consent and only when deals return.)
- **Bookmark reframed** as a passive dashed note: "Bookmarked it instead? Just open the bookmark — the bookmark is your list."

### 7.4 Save-time behaviour (related, for completeness)

Saving a list via "Save to email" still does not send an email. It writes `{email, list}` to the store. The phrasing _"Save to email"_ in the My List panel means _"save under this email"_, not _"send this list to email"_. We should consider relabelling to **"Save with email"** in a future copy pass to make this crisper.

---

## 8. My List panel

- **Thumbnails on every row.** 48×48, store-tinted background, emoji or product icon. Grocery list should look like groceries, not a receipt.
- **Estimated total + savings** shown explicitly ("You save CHF 4.75").
- **Save flow:** "Save to email" primary, "Copy link" secondary.

---

## 9. Verdict formula (unchanged)

v3.1 formula retained: **40% deal count + 60% avg discount depth**, with a **5% tie threshold** ("Migros & Coop tied this week"). This amendment does not modify ranking logic — only the way results are presented per sub-category.

---

## 10. Non-goals for v3.2

- Real-time stock availability (still out of scope).
- Same-SKU barcode matching across stores (still out of scope — framing is "best promo per store in a sub-category").
- Per-user price prediction / history (deferred).
- Loyalty-card integration (Cumulus, Supercard — deferred).

---

## 11. Success metrics to track post-launch

| Metric | Target (vs. v2 baseline) |
|---|---|
| Session % that touches ≥3 distinct store brand colours (visual proxy for "users see all 7 stores") | +120% |
| Add-to-list conversions where the added item is from LIDL / ALDI / SPAR / Volg | +150% (absolute floor: 8% of adds) |
| Bounce rate on /deals (first-time mobile) | −15% (removing onboarding block) |
| Return rate via saved email link (7-day) | +20% |
| Per-session sub-category depth (# sub-categories viewed) | +40% |

---

## 12. Wireframe reference

All v3.2 screens are in `basketch-wireframes.html` — look for the blue "V3" highlight chips on the cover, and the dedicated `#v3pattern` design-rationale section after the v2 revisions table. The mobile Deals, desktop Deals, and Compare screens are all rebuilt to the Cheapest Hero + Price Ladder pattern described in §2–§4.

---

## 13. Open questions / deferred decisions

1. **"Show all X deals" long-tail expander on 20+ deal sub-categories** — needed in v3.2 or OK to ship without and add in v3.3? (Recommend: ship without, monitor.)
2. **Should greyed "regular price" rows also show for items the user has on their list but not in Deals?** (Out of scope for Deals; in scope for Compare.)
3. **Band collapse/expand on mobile** — with 11 categories × ~6 sub-categories, Deals can be long. Accordion collapse by sub-category, default expanded? (Recommend: yes, default expanded; collapse after scroll-past.)
4. **Store-chip sidebar filter interaction with bands** — if a user unchecks ALDI, do ALDI ladder rows + ALDI mentions in the no-deal footer both hide? (Recommend: yes, both hide; band continues to render with remaining stores.)
