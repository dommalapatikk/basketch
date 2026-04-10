# UX Review: basketch

**Reviewer:** User Researcher Agent (UX + Desk Research)
**Date:** 10 April 2026
**Scope:** Full codebase review of all pages and components, live site check
**Method:** Heuristic evaluation against PRD acceptance criteria, mobile-first analysis, Swiss market fit assessment

---

## Executive Summary

basketch is a well-structured, mobile-first MVP with a clean 3-step onboarding flow and a clear split shopping list. The core value proposition -- "which of MY items are on sale where" -- comes through in the comparison page. However, several friction points risk undermining activation and retention, particularly around first-impression clarity, the email-dependent return flow, and missing feedback for the "no deals" state. The Swiss tone is appropriate (understated, not hyped), though the hero copy could be sharper.

**Overall verdict:** Solid foundation. The issues below are fixable without architectural changes.

---

## 1. First-Time User Experience

### What works
- **Clean hero section.** The heading "Smart grocery shopping for Swiss shoppers" and the subtext mentioning CHF 20-40 savings give a clear value proposition.
- **Single primary CTA.** "Build my shopping list" is prominent and full-width -- good for mobile thumbs.
- **No clutter.** No cookie banner, no splash screen, no account creation gate. This matches the PRD constraint of zero-friction entry.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 1.1 | High | **Hero headline is generic.** "Smart grocery shopping for Swiss shoppers" could be any grocery app. It does not communicate the core differentiator: personalized Migros vs Coop comparison. The PRD's own quote -- "Just tell me: Migros or Coop this week? For what?" -- is more compelling than the current headline. | Rewrite to something closer to: "Migros or Coop this week?" with a subline like "See which of your regular items are on sale at each store." This is more specific, more Swiss, and answers the JTBD in 5 seconds. |
| 1.2 | Medium | **No visual proof of value on the home page.** Sarah lands and sees text + a button. There is no screenshot, illustration, or example of what the comparison looks like. She has to complete the entire onboarding flow before seeing any value. | Add a static mockup or simplified example below the hero showing a split list ("Buy at Migros: Milk CHF 1.50 / Buy at Coop: Butter CHF 2.90"). This gives Sarah a preview of the "aha moment" before she invests 60 seconds in setup. |
| 1.3 | Low | **"Save CHF 20-40 per month" is unsubstantiated on the page.** Swiss shoppers are skeptical of unverified claims. Without even anecdotal evidence, this reads like marketing copy rather than a credible promise. | Either remove the specific number or add context: "Based on typical weekly deal differences between Migros and Coop." Or defer this claim until post-comparison, where it can be shown with the user's actual matched deals. |
| 1.4 | Low | **Meta description is good** (`index.html` line 6: "Your groceries. Two stores. One smart list.") but the `<title>` ("basketch -- Migros vs Coop deals") does not match the hero copy. Minor SEO/messaging inconsistency. | Align title tag with the primary value proposition for consistent messaging across search results and the page itself. |

---

## 2. Onboarding Friction

### What works
- **3-step progress bar** (pick, edit, save) is clearly communicated with color-coded segments. The `aria-label` attributes ("Step 1 of 3", "Step 2 (current)") are good for accessibility.
- **Template picker with "Recommended" badge** on the first pack reduces decision paralysis.
- **"Build my own list" escape hatch** lets users skip templates without feeling trapped.
- **Back button** is present on steps 2 and 3, with a 44px min-height touch target.
- **Real-time item count** ("Compare deals (12 items)") gives clear feedback.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 2.1 | High | **Template picker shows only 4 item previews** (`pack.items.slice(0, 4)`) before "+X more". On a 2-column grid, each card is narrow. Sarah cannot tell if "Swiss Basics" actually contains her regular items without tapping it -- and tapping immediately triggers the import (no confirmation). If she picks wrong, there is no undo. | Show 6-8 item previews per card. Add a brief confirmation or make the template selection reversible (allow switching templates on step 2 without losing custom additions). |
| 2.2 | High | **Selecting a template is irreversible.** `handlePackSelect` creates a new favorite and imports items in one click. If Sarah taps "Indian Kitchen" by mistake, she cannot go back to "Swiss Basics" -- the back button on step 2 goes to step 1, but a new favorite has already been created, and re-selecting creates another orphan record. | Either (a) allow re-selection on step 2 that replaces items, or (b) defer the DB write until the user advances to step 3. |
| 2.3 | Medium | **"Build my own list" starts with an empty state.** The empty state message ("Add your first product to see this week's best deals") is clear, but the path to adding items requires tapping "+ Add item", then searching. That is 3 taps before adding the first item (button > type query > tap "Add"). Consider auto-opening the search when the list is empty. | Auto-expand ProductSearch when `items.length === 0` in the FavoritesEditor. |
| 2.4 | Medium | **Product search placeholder says "milch, butter, poulet"** -- these are German product names in an English UI. This is actually correct behavior (products are stored in German), but it may confuse English-speaking users who try searching in English. | Add a brief hint: "Search in German (e.g. milch, butter, poulet)" to set expectations. |
| 2.5 | Medium | **Email capture step uses "Secure your list" as heading.** The word "secure" implies a security action, which may trigger hesitation. The PRD says "no account needed," but "secure" sounds like creating an account. | Change to "Save your list" or "Remember my list" -- less security-loaded, more casual. |
| 2.6 | Low | **Step 3 offers "Continue without saving" but does not explain the consequence.** Sarah may not realize that without saving, her only way back is the URL bookmark. | Add a one-line note: "You can still bookmark the next page to return later." |

### Tap count to first value

| Path | Taps | Time estimate |
|------|------|---------------|
| Home > "Build my shopping list" > Select template > "Compare deals" > (skip email) | 4 taps | ~30 seconds |
| Home > "Build my shopping list" > "Build my own" > "+ Add item" > search > add > "Compare deals" > (skip email) | 7+ taps | ~90 seconds |

**Assessment:** The template path (4 taps, ~30 seconds) meets the PRD target of "under 60 seconds." The manual path is significantly slower. This is acceptable for MVP since templates are the recommended path.

---

## 3. Comparison Page Usability

### What works
- **Split list is the right pattern.** Grouping items by "Buy at Migros" / "Buy at Coop" / "Same deal at both" / "No deals this week" directly answers JTBD-2 and JTBD-3.
- **Color-coded section headers** with store-colored dots (orange for Migros, green for Coop) are instantly scannable.
- **Summary cards at top** (Migros: CHF X / Coop: CHF Y) give a quick verdict.
- **CompareCard shows both stores side by side** for each item, with images, prices, original prices, and discount percentages. This is the core "aha moment."
- **Share and copy link** are both present. Native share API with fallback to clipboard copy is the right approach.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 3.1 | High | **No overall verdict sentence.** The PRD specifies: "This week: Migros wins for Fresh, Coop wins for Household." The comparison page shows raw numbers (CHF totals per store) but no human-readable verdict. The user has to interpret the numbers themselves. | Add a verdict banner above the summary cards: "This week: buy X items at Migros, Y items at Coop. You save CHF Z by splitting your trip." This is the 5-second answer Sarah needs. |
| 3.2 | High | **"No deals this week" items show two empty "No deal" columns.** For items where neither store has a deal, the CompareCard still renders two empty columns with "No deal" text. This is visual noise. On a list of 15 items where only 5 have deals, 10 items show double "No deal" cards -- that is a lot of wasted scroll. | Collapse "No deals" items into a simple list (just item names, no cards) with a note: "Check back next week." Save the full card layout for items that actually have deals. |
| 3.3 | Medium | **Summary totals show sale prices, not savings.** The top cards show "CHF 12.50 (3 items)" for Migros -- but this is the total sale price, not the savings. Sarah wants to know "how much do I save by splitting?" not "how much will I spend at Migros." | Show both: total sale price AND total savings (sum of original_price - sale_price for each matched item). Lead with savings: "Save CHF 8.40 across 5 items." |
| 3.4 | Medium | **"Edit my list" link at the bottom is easy to miss.** It is a small outline button below the "Save this list" card, at the very bottom of the page. If Sarah has 15+ items, she has to scroll past all of them to find it. | Move "Edit my list" to a more discoverable position -- either in the header area near the title, or as a sticky bottom bar action. |
| 3.5 | Medium | **No indication of deal validity dates.** The PRD specifies showing validity dates, and the data model has `valid_from` / `valid_to` fields, but the CompareCard does not display them. Sarah does not know if a deal expires tomorrow or lasts all week. | Show validity period on each deal card, at minimum "valid until [date]." |
| 3.6 | Low | **Item count "X items compared" is ambiguous.** Does "compared" mean "matched with deals" or "total items in list"? If Sarah has 15 items and 5 have deals, is X=15 or X=5? | Clarify: "15 items in your list -- 5 have deals this week." |

---

## 4. Mobile Usability

### What works
- **Max-width 640px container** (`max-w-[640px]`) ensures content does not stretch on tablets/desktops.
- **Touch targets are 44px minimum** on all interactive elements: buttons (`min-h-[44px]`), nav links (`min-h-[44px]`), remove buttons in FavoritesEditor (`min-h-[44px] min-w-[44px]`), and the back button (`min-h-[44px]`). This meets Apple HIG.
- **Sticky header** keeps navigation accessible while scrolling.
- **Vertical stacking** of cards and list items works for narrow screens.
- **System font stack** (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`) renders well on all devices.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 4.1 | Medium | **CompareCard uses `grid-cols-2` for the Migros/Coop columns.** On screens under 320px (rare but real -- older iPhones, some Android devices), the two columns may be squeezed. Each column has padding (`p-2`), text, and potentially an image (`max-h-[120px]`). | Add a breakpoint: on very narrow screens (`max-[350px]`), stack the columns vertically instead of side by side. |
| 4.2 | Medium | **The "Save this list" card on the comparison page shows the full URL** (`window.location.href`) in a truncated text box. On mobile, the UUID-based URL is long and the truncation may cut off meaningful parts. The URL box itself is not tappable -- only the Copy button works. | Make the entire URL box tappable to copy, or remove the URL display entirely and just show "Copy link" and "Share" buttons. The raw URL adds no value for the user. |
| 4.3 | Medium | **Template picker uses `grid-cols-2 max-[400px]:grid-cols-1`.** The 400px breakpoint is appropriate, but on a 375px iPhone SE screen in portrait, each card in the 2-column layout gets ~170px width. With the "Recommended" badge, pack name, description, and 4-item preview, this may be cramped. | Test on a 375px viewport. Consider raising the breakpoint to `max-[420px]:grid-cols-1` to give more breathing room on smaller phones. |
| 4.4 | Low | **No `font-size` set on body or html.** The CSS sets `font-family` on `body` but relies on browser defaults (typically 16px). The Input component and various text elements use explicit sizes (`text-sm`, `text-xs`), which map to 14px and 12px respectively. The 12px text in deal cards and item previews is at the lower limit of readability on mobile. | Ensure no text is below 12px. The `text-[0.7rem]` used for store name headers and "Recommended" badge text computes to ~11.2px -- below the 12px minimum. Increase to at least `text-xs` (12px). |
| 4.5 | Low | **No horizontal overflow protection on the email lookup flex container.** The `flex gap-2` layout with Input + Button could overflow on very narrow screens if the button text is long. Currently "Find my list" is short enough, but "Searching..." is wider. | Add `min-w-0` to the Input's container or `shrink-0` to the Button to prevent layout shift. |

---

## 5. Swiss Market Fit

### What works
- **Understated tone.** The copy avoids American-style hype ("Transform your grocery experience!"). Phrases like "Compare Migros and Coop deals for the items you actually buy" are factual and direct. This matches Swiss German communication norms.
- **Privacy-first approach.** No tracking, no ads, optional email only. The About page explicitly states this. Swiss shoppers are privacy-conscious; this is correct.
- **No app install required.** The PRD correctly identifies that Swiss shoppers will not install an app for deal comparison. A web-only approach is right.
- **German product names preserved.** Products appear in German as sourced, which is correct for the Swiss German market.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 5.1 | Medium | **"Smart grocery shopping" headline sounds like a tech pitch.** Swiss shoppers do not think of grocery shopping as something that needs to be "smart." They think: "Is Migros or Coop better this week?" The language should match how Sarah actually talks about this problem. | Use language that mirrors the user's mental model: "Migros or Coop this week?" (even in an English UI, a direct question works for Swiss users) or "Which store has better deals this week?" |
| 5.2 | Medium | **English-only UI in a German-speaking market.** The PRD acknowledges this as an MVP decision, but the disconnect between English interface text and German product names creates cognitive friction. Sarah reads "Buy at Migros" followed by "Vollmilch 1l" -- mixing languages. | Not a blocker for MVP, but track whether this causes confusion in user testing. Consider making section headers bilingual: "Buy at Migros / Bei Migros kaufen." |
| 5.3 | Low | **"basketch" brand name is not immediately parseable.** First-time visitors may not instantly parse "basket" + "ch" (Switzerland). The favicon helps, but the brand story is not told anywhere on the home page. | The About page explains "How it works" but not the name. Consider a subtle tagline or the footer already handles this: "Migros vs Coop, side by side." This is sufficient for MVP. |
| 5.4 | Low | **The About page says "Built by Kiran Dommalapati -- a weekend shopper tired of checking two websites."** This is authentic and appropriate for a Swiss audience (personal, not corporate). Good. No change needed. | No action. |

---

## 6. Return User Experience

### What works
- **Direct URL return path** (UC-6) is the primary return mechanism. The comparison page URL (`/compare/:favoriteId`) is stable and bookmarkable.
- **Copy link and Share buttons** are present on the comparison page.
- **Email lookup** on the home page ("Already have a list?") provides a fallback for lost bookmarks.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 6.1 | High | **The "Save this list" prompt appears ONLY on the comparison page, AFTER onboarding.** But the comparison page is where Sarah is focused on reading her deals, not on saving. She may scan the deals and close the browser without scrolling down to the save card. Next week, she has no way back unless she saved email during onboarding (step 3). | Surface the bookmark/share prompt more prominently. Options: (a) A dismissible banner at the top of the comparison page on first visit: "Bookmark this page to check your deals next week." (b) A native "Add to Home Screen" prompt for mobile browsers. |
| 6.2 | High | **Email lookup is the only return path on the home page, but email is optional during onboarding.** If Sarah skipped email (tapped "Continue without saving"), she cannot use the email lookup. She must have bookmarked the URL. But the home page does not mention bookmarking as an option -- only email. | Add a second return path on the home page: "Have a bookmark? Your saved link still works." Or: "Saved a link? Paste it in your browser to see this week's deals." This sets the mental model that the URL IS the return path. |
| 6.3 | Medium | **"My List" nav link goes to `/onboarding`, not to the user's comparison page.** A returning user who taps "My List" in the header expects to see their comparison, but instead gets the template picker (step 1 of onboarding). This is confusing and could feel like their data was lost. | If the user has a `favoriteId` in localStorage or URL history, "My List" should go to `/compare/:favoriteId`. Only go to `/onboarding` if no existing list is found. |
| 6.4 | Low | **No "last updated" indicator on the comparison page.** Returning users do not know if the deals are from this week or stale from last week. The PRD requires: "Banner if data is > 7 days old." | Show a subtle "Deals updated: [date]" line below the page title. If data is older than 7 days, show a warning banner. |

---

## 7. Accessibility

### What works
- **Screen reader labels** are present: `sr-only` labels on email input and product search input. `aria-label` on remove buttons ("Remove [item name]"). `role="alert"` on error messages. `role="status"` on success messages. `role="group"` with `aria-label` on the step indicator.
- **Keyboard navigation** works: Enter key triggers email lookup and product search. All interactive elements are `<button>` or `<a>` elements (no `<div onClick>`).
- **Focus styles** on inputs: `focus:border-accent focus:ring-2 focus:ring-accent/10`.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 7.1 | High | **Color contrast: `--color-muted: #666666` on `--color-bg: #fafafa`** gives a contrast ratio of approximately 4.85:1. This passes WCAG AA for normal text (4.5:1) but fails for the `text-xs` (12px) and `text-[0.7rem]` (11.2px) text used extensively for prices, descriptions, and labels. Small text requires 4.5:1 at minimum, and best practice is 7:1 (AAA). | Darken muted to `#555555` or `#595959` to achieve at least 5.5:1 contrast for small text. |
| 7.2 | Medium | **No skip-to-content link.** Keyboard users must tab through the header and navigation on every page before reaching main content. | Add a visually hidden "Skip to main content" link as the first focusable element in Layout.tsx, targeting the `<main>` element. |
| 7.3 | Medium | **Step progress indicator is not semantically meaningful to screen readers.** The `div` elements with `aria-label` are not announced as a step indicator. Screen readers will read three unlabeled divs. | Use an `aria-live` region or announce step changes with a visually hidden text block: "Step 2 of 3: Edit your list." |
| 7.4 | Medium | **CompareCard recommendation badges have color-only differentiation.** The Migros badge is orange-on-light-orange, Coop is green-on-light-green, "Either" is green-on-light-green, "No deals" is gray. For colorblind users, "Coop" and "Either" may look identical. | Add an icon or text differentiation beyond color. The current text labels ("Migros", "Coop", "Either", "No deals") help, but ensure the badge text is readable at its small size (see 4.4). |
| 7.5 | Low | **The remove button in FavoritesEditor uses "x" as visible text.** This is visually clear but the `aria-label` is set correctly ("Remove [item name]"), so screen reader users are covered. However, the "x" could be a proper close icon or unicode character for visual consistency. | Minor. Consider using the unicode multiplication sign or an SVG icon for visual polish. |
| 7.6 | Low | **Loading spinner has no accessible text.** The spinner div (`animate-spin`) has no `aria-label` or associated text for screen readers. The "Loading your deals..." text above it is visible, but the spinner itself is an unlabeled animation. | Add `role="status"` and `aria-label="Loading"` to the spinner container, or wrap the text + spinner in a single `role="status"` region. |

---

## 8. Information Architecture

### What works
- **Simple 4-page structure:** Home, Onboarding, Comparison, About. This is appropriate for MVP scope.
- **Sticky header** with logo (home link) and two nav items ("My List", "About").
- **Footer** is minimal and unobtrusive.
- **URL structure** is clean: `/`, `/onboarding`, `/compare/:id`, `/about`.

### Issues

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 8.1 | High | **No 404 page.** Navigating to an invalid URL (e.g., `/compare/invalid-uuid`) shows the error state ("Could not load your deals" + "Create a new list" button), which is decent. But navigating to a completely unknown route (e.g., `/settings`) renders nothing inside the layout -- just the header and footer with blank content. | Add a catch-all route in `App.tsx` that shows a "Page not found" message with a link back to home. |
| 8.2 | Medium | **"My List" always goes to onboarding.** As noted in 6.3, returning users expect "My List" to show their existing comparison, not restart onboarding. The nav label itself is misleading -- it implies viewing an existing list, but the destination is list creation. | Rename to "New List" if it always goes to onboarding, or make it context-aware (see 6.3). |
| 8.3 | Low | **No breadcrumbs or "you are here" indicator in the nav.** The current page is not highlighted in the header. On the onboarding page, "My List" in the nav does not appear active/selected. | Add an active state (e.g., bold text or underline) to the current nav link using `useLocation()` to check the current path. |

---

## Summary of Priorities

### Must-fix before friends beta (M2)

| # | Issue | Impact |
|---|-------|--------|
| 3.1 | No verdict sentence on comparison page | Core value proposition missing -- Sarah has to interpret raw numbers |
| 1.1 | Generic hero headline | First impression does not differentiate from other grocery apps |
| 6.1 | Save/bookmark prompt buried at bottom | Return path is too easy to miss, killing W1 retention |
| 6.2 | No return path for users who skipped email | Creates dead-end for a significant user segment |
| 2.1 | Template selection is blind (only 4 item previews) | Risk of wrong template choice, no easy recovery |

### Should-fix before friends beta

| # | Issue | Impact |
|---|-------|--------|
| 3.2 | "No deals" items take excessive space | Scroll fatigue when most items have no deals |
| 3.3 | Summary shows spend, not savings | Misses the key motivator (savings) |
| 6.3 | "My List" nav goes to onboarding, not comparison | Confusing for returning users |
| 2.2 | Template selection is irreversible | Accidental taps create orphan records |
| 4.4 | Text below 12px (`text-[0.7rem]`) | Readability issue on mobile |
| 7.1 | Muted text contrast borderline for small sizes | Accessibility risk |
| 8.1 | No 404 page | Broken experience for mistyped URLs |

### Nice-to-have (post-beta)

| # | Issue | Impact |
|---|-------|--------|
| 1.2 | No visual proof of value on home page | Lower conversion, but template path is fast enough |
| 3.4 | "Edit my list" buried at bottom | Discoverable enough for now |
| 3.5 | No deal validity dates shown | Minor -- deals are weekly |
| 5.2 | English/German language mixing | Acknowledged MVP trade-off |
| 7.2 | No skip-to-content link | Accessibility polish |
| 8.3 | No active state on nav links | Navigation polish |

---

## Methodology Note

This review is based on a full code audit of all 14 source files (4 pages, 7 components, 4 UI primitives, 1 CSS file, 1 HTML entry point) plus the matching logic. The live site at `https://basketch.vercel.app` was checked but returns only the HTML shell to automated fetches (client-side rendered SPA), so detailed visual testing was done via code analysis.

Findings are graded by severity relative to the PRD's success criteria:
- **High** = blocks a success metric (activation rate, time to decision, retention)
- **Medium** = degrades experience but does not block core value delivery
- **Low** = polish item, not user-facing in most scenarios
