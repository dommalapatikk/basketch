# Design Challenge: basketch Design Spec v2.0

**Date:** 12 April 2026
**Reviewer:** Design Review Engineer (Design Challenger Agent)
**Scope:** Full red-team of design-spec-v2.md against PRD v2.0, Use Cases v2.0, Architecture v2.1, Design System v1.0, and previous review findings
**Method:** 5 challenge tests (mobile stress, state coverage, accessibility, visual hierarchy, subtraction) applied to every page and component

---

## Summary Verdict

The design spec is thorough and well-structured. It addresses most findings from Round 1 and Round 2 reviews, introduces the Wordle card and deals browsing page correctly, and handles state coverage with unusual diligence. The feature sequencing (verdict-first, favorites-second) is reflected consistently in the layout hierarchy.

However, there are real issues that would confuse users or break on mobile. The most significant: the home page is too long to deliver the "aha in 5 seconds" promise, the two-tier Coop status wording will confuse non-technical users, the Wordle card has WhatsApp survival risks at its current spec, and the category pills lack a visible scroll affordance.

**Verdict breakdown:**

| Rating | Count | Items |
|--------|-------|-------|
| **Confirmed** | 14 | Color system, typography, about page, 404 page, footer, header, step progress bar, loading spinner, error card, toast, form patterns, OG meta tags, navigation flow, sort order |
| **Adjust** | 9 | Home page length, Wordle card sizing, two-tier Coop wording, category pills scroll affordance, deals page empty state, onboarding auto-advance, comparison page URL row, starter pack card descriptions, desktop deals scroll |
| **Weakened** | 2 | Home page "5 seconds" claim, 30-item soft cap UX |
| **Rejected** | 0 | -- |

---

## Page-by-Page Challenge

### 1. Home Page (`/`)

#### Mobile Stress Test (375px)

**Issue: The page is too long to deliver on the "5 seconds" promise.**

The spec stacks: hero (H1 + subtitle) -> verdict banner (label + text + transparency line + 2 buttons) -> Wordle card (~420-480px height) -> 3 category cards -> Browse CTA -> favorites promo -> email lookup -> data freshness -> footer.

On a 375px viewport with a 56px sticky header, the visible area above the fold is roughly 319px of usable vertical space. The hero section alone (H1 at 28px with line-height 1.2 = ~34px for one line, but the question is long enough to wrap to 2 lines = ~68px, plus subtitle ~40px, plus 32px padding top + bottom) consumes roughly 170px. The verdict banner (label + text + transparency + buttons) is another ~140px minimum. That pushes even the verdict transparency line below the fold.

The Wordle card at 420-480px is taller than the entire viewport. A user scrolling past the verdict sees the Wordle card filling their entire screen. The category cards with actual deal previews -- arguably the most useful "browse" content -- are buried 800-900px down.

**Verdict: Weakened.** The "aha in 5 seconds" claim holds for the verdict text alone, but the full home page experience requires significant scrolling. The Wordle card's placement directly below the verdict creates a "wall" that obscures the category cards.

**Recommendation (Adjust):** Move the Wordle card BELOW the category cards. The verdict banner is the 5-second answer. The category cards are the 15-second depth. The Wordle card is a sharing artifact -- it does not add informational value beyond what the verdict banner already provides. Putting it third preserves the information hierarchy while keeping it visible on the page.

#### State Coverage

States are well-defined. All five conditions (loading, error, partial, stale, no data) are specified with concrete behavior. The email lookup has five states. This is thorough.

**One gap:** What happens when the user lands on `/` with a `favoriteId` in localStorage (returning user who previously set up favorites)? The spec shows no personalized greeting or shortcut. The PRD says both return paths are primary, but the home page design treats returning users the same as new users -- they must scroll past the verdict, category cards, and favorites promo to reach the email lookup section at the bottom.

**Recommendation (Adjust):** If `localStorage` contains a `favoriteId`, show a small persistent banner or card near the top: "Welcome back. [View your deals ->]" linking to `/compare/:id`. This costs one Card component and dramatically improves the return-visitor experience.

#### Visual Hierarchy

The hierarchy is correct in intent: verdict -> categories -> browse -> favorites -> email lookup. The question H1 is a strong choice (Design Decision #12 is well-reasoned). Store names in store colors within the verdict text is confirmed as the right pattern.

#### Subtraction

The "Share verdict" button and "Copy card" button below the verdict banner AND below the Wordle card creates redundancy. Two sharing touchpoints for the same content. For 10-50 users, the Wordle card's own "Copy card" button below it is sufficient.

**Recommendation (Consider):** Remove the share buttons from directly below the verdict banner. Keep them only below the Wordle card. This reduces clutter in the above-the-fold area and concentrates sharing actions in one place.

---

### 2. Deals Browsing Page (`/deals`)

#### Mobile Stress Test (375px)

**Issue: Category pills have no visible scroll affordance.**

The spec says: "Horizontal scroll, no scrollbar visible (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`, hide scrollbar with CSS)." With 11 categories, only 3-4 pills are visible at 375px. There is no visual cue that more pills exist to the right. Users unfamiliar with horizontal scroll patterns may never discover categories 5-11.

**Recommendation (Adjust):** Keep the hidden scrollbar, but ensure the last visible pill is cut off mid-word (not cleanly ending at the viewport edge). A half-visible pill is the strongest natural affordance for "there's more to the right." If the pills happen to fit cleanly, add a subtle fade/gradient on the right edge.

**Issue: Long German product names in DealCard.**

The spec says product names are 16px, SemiBold, with `line-clamp-2`. Good. But German compound words are long. "Knorr Aromat Nachfullbeutel Streuwurze" is 40+ characters. At 16px SemiBold in a card with 12px padding and a 64x64px image, the available text width is roughly 200px (375 - 32 page padding - 24 card padding - 64 image - 12 gap). At ~8px per character average for SemiBold 16px, that is about 25 characters per line, so 50 characters across 2 lines. Most names fit. But edge cases with multi-pack descriptors ("Emmi Caffe Latte Macchiato 3x230ml") push it.

**Verdict: Confirmed.** The `line-clamp-2` handles this correctly. The truncation is acceptable.

#### State Coverage

Good coverage. Loading skeletons (6 cards), error with retry, empty category state (keeps section visible with message), stale data warning. The URL query parameter for deep-linking categories (`/deals?category=fresh`) is a nice detail.

**One gap:** What if the user selects a category and both stores have zero deals? The spec defines empty per-store-section but not empty for the entire page after filtering. Show both empty sections (correct) but also add a subtle "No deals in this category this week. Try another category." message.

**Recommendation (Adjust):** Add a whole-page empty state for when both store sections are empty after category filtering.

#### Desktop Deals Scroll

The spec says "On desktop, columns scroll independently within a shared viewport." This is technically complex and potentially confusing. Independent scroll containers within a page feel non-standard and can trap keyboard focus. For 10-50 users, this is over-engineered.

**Recommendation (Adjust):** Use a simpler layout: side-by-side columns that scroll together with the page. No independent scroll containers. This is easier to build with Tailwind (just a two-column grid) and avoids scroll-trapping accessibility issues.

---

### 3. Onboarding (`/onboarding`)

#### Mobile Stress Test (375px)

**Issue: Pack card descriptions are too similar.**

Looking at the starter packs in the 2-column grid at 375px:

| Pack | Description |
|------|-------------|
| Swiss Basics | "The essentials for a Swiss kitchen" |
| Indian Kitchen | "Spices, rice, lentils, and more" |
| Mediterranean | "Olive oil, pasta, herbs, vegetables" |
| Studentenküche | "Budget basics for students" |
| Familientisch | "Family meals, snacks, and bulk items" |
| Start from scratch | "Build your own list" |

In a 2-column grid at ~155px per card, these descriptions are adequate. But three of them ("Swiss Basics", "Mediterranean", "Familientisch") could overlap significantly in content. A user choosing between Swiss Basics and Familientisch has no idea what differentiates them until they select one and see the items.

**Recommendation (Adjust):** Add 2-3 preview item names to each card below the description. Example: "Swiss Basics -- milk, bread, butter, eggs..." This gives an immediate preview without requiring selection. The `line-clamp-2` on descriptions already exists; add a third line for preview items in 12px muted text.

#### Auto-advance on Pack Selection

The spec says: "Selection auto-advances to step 2 after 300ms delay." This is a usability risk. If the user taps a pack accidentally (fat thumbs on 375px), they are immediately moved to step 2 with 15 items pre-loaded. They have to tap "Back" to change their selection. The 300ms delay is too short to register as intentional.

**Recommendation (Adjust):** Remove auto-advance. Instead, show a "Next" button that appears (or becomes enabled) after a pack is selected. This adds one tap but eliminates the "wrong pack" recovery problem. The 60-second setup target easily absorbs one extra tap.

#### 30-Item Soft Cap UX

**Verdict: Weakened.** The spec defines: warning at 30, hard disable at 40. The warning text "Your list is getting long -- shorter lists give better results" is vague. "Better results" how? Fewer items means fewer matches, which could mean FEWER deals shown. The user might think "more items = more chance of catching a deal" (which is true). The warning contradicts the user's mental model.

**Recommendation (Adjust):** Reframe the warning: "Lists work best with your top 20-30 items. Focus on what you buy every week." This explains the WHY (focus on regulars) rather than making an ambiguous quality claim.

---

### 4. Comparison Page (`/compare/:id`)

#### Two-Tier Coop Status

**Issue: The distinction between "Not on promotion at Coop this week" and "No Coop data yet" will confuse non-technical users.**

Testing the mental model: Sarah sees "Milk" in her comparison. The Coop column says "No Coop data yet." Sarah thinks: "Does Coop not sell milk? Is the app broken? Will this fix itself?" The phrase "data" is technical jargon. "Yet" implies a promise that it will appear eventually, but Sarah does not know the pipeline mechanics.

Contrast with: "Not on promotion at Coop this week." This is clear and definitive. The user understands: Coop sells it, just no deal this week.

The two tiers serve an important transparency purpose (PRD Section Epic 2), but the wording needs work.

**Recommendation (Adjust):** Change "No Coop data yet" to "Coop status unknown" or, better, "We haven't found this at Coop yet -- check back next week." This is honest, non-technical, and sets a concrete expectation. Additionally, the lighter opacity (0.7) on Tier 2 helps visually distinguish it, which is good. Keep that.

#### URL Row on Mobile

The spec shows: `[ basketch.ch/compare/a1b2.. ] [ Copy ]` in a flex row with a Share button below. UUIDs are 36 characters. "basketch.ch/compare/" is 21 characters. Total: 57+ characters. At 375px with 32px page padding and card padding, the URL display area is roughly 280px. At 14px font, that is about 35 characters visible. The URL will truncate (confirmed: spec says `overflow-hidden text-ellipsis`).

**Issue:** The truncated URL is not useful to the user. They cannot read, verify, or manually type it. The URL display exists only as context for the "Copy" button.

**Recommendation (Adjust):** Replace the visible URL with a simpler message: "Your personal link" followed by "[ Copy link ] [ Share ]" buttons. The URL itself adds no value when truncated. This saves horizontal space and reduces cognitive load.

#### State Coverage

Excellent. The spec defines: loading (skeleton cards), invalid UUID (not found + CTA), data load failure (with retry), empty (all items in "no deals" section with encouraging message), and stale data. The empty state message ("None of your favorites are on sale this week. Check back Thursday...") is well-written.

**Missing state:** What if the user's basket was deleted (e.g., data cleanup)? The "not found" state covers this, but the message "This comparison list was not found. It may have been deleted or the link may be incorrect." is good.

---

### 5. About Page (`/about`)

**Verdict: Confirmed.** Static page, no data dependencies, clean card layout, proper heading hierarchy. The content covers: how it works, data sources, what we compare, privacy, and attribution. The "What we compare" section proactively addresses the price-vs-promotions question (matching PRD Section 6b).

Nothing to challenge. This is straightforward and appropriate for the audience.

---

### 6. 404 Page

**Verdict: Confirmed.** Two CTAs (home + deals), centered layout, clear messaging. The 80px top padding creates breathing room. Both buttons are full-text (not icons), which is correct.

One minor point: the spec says 240px max-width on buttons. At 375px, this creates narrow centered buttons that may look orphaned. Full-width (matching the 640px max-content pattern) would be more consistent with other pages.

**Recommendation (Consider):** Use full-width buttons (matching home page CTAs) instead of 240px constrained buttons.

---

## Component Challenge

### 7. Wordle Verdict Card

This is the highest-stakes component. It must survive WhatsApp compression and be readable in a group chat thumbnail.

#### WhatsApp Compression Survival Test

WhatsApp compresses images aggressively. A screenshotted card at 360x~450px becomes a JPEG at roughly 70-80% quality. Key risks:

1. **14px text on dark background.** At JPEG compression, light text on dark backgrounds develops halos and blur. The "This Week's Verdict" subtitle at 14px regular weight in #9CA3AF (light gray) will become mushy. The deal stats lines ("12 deals | avg 28% off") at 14px #D1D5DB have similar risk.

2. **12px tagline.** "Your weekly promotions, compared." at 12px is the smallest text on the card. The spec says "no text smaller than 12px" as a rule, but 12px is the floor, not a comfortable reading size after compression. In a WhatsApp group chat, the card appears as a thumbnail (roughly 60% of screen width). At 60% scale, 12px becomes ~7px effective. Unreadable.

3. **4px colored bars.** The left-edge indicator bars on category rows are 4px wide. After compression, these become 2-3px of smudged color. The spec says "no fine lines thinner than 2px" but 4px bars at thumbnail scale become sub-2px.

**Recommendation (Adjust):**
- Increase card width from 360px to 400px (still fits on 375px screens with slight horizontal overflow that gets cropped in screenshot -- acceptable since the card is centered).
- Actually, keep 360px but increase the minimum text size: subtitle and stats to 15px, tagline to 13px. The 1px increase has negligible layout impact but measurably improves compression survival.
- Increase category indicator bars from 4px to 6px.
- Consider testing: take a screenshot, send it to yourself on WhatsApp, view it in a group chat. If the stats lines are unreadable, bump text sizes further.

#### Dark Background Choice

**Verdict: Confirmed.** Dark navy (#1a1a2e) on WhatsApp:
- Light mode: card stands out against the beige/white chat background. Good.
- Dark mode: card has subtle but sufficient contrast against WhatsApp dark (#121B22). The card border (#2d2d44) differentiates it. Acceptable.

The design decision log (Decision #1) correctly identifies why dark is better than white for this use case.

#### Fixed 360px Width

**Verdict: Confirmed** with a note. The spec says "most phones are 375px+." True for modern phones. On a 360px-wide phone (older Samsung Galaxy models, still common), the card fills edge-to-edge with zero margin, which means screenshots capture page background on the sides. Not a dealbreaker -- the card has its own background and rounded corners, so it looks intentional.

---

### 8. CompareCard (Comparison Page)

#### Mobile Stress Test (375px)

Each CompareCard has a 2-column grid with 8px gap inside a card with 12px padding, inside a page with 16px padding. Usable width per column: (375 - 32 - 24 - 8) / 2 = ~155px. With 8px column padding, content width is ~139px per column.

Contents per column: store name (11px), sale price (18px), original price (14px), discount (12px), product name (14px, line-clamp-2). The product name at 139px width, 14px font, fits roughly 17 characters per line, 34 across 2 lines. "M-Drink Milch 1l" (16 chars) fits. "Coop Naturaplan Bio Joghurt Erdbeer 180g" (41 chars) gets truncated. This is correct behavior -- `line-clamp-2` handles it.

**Verdict: Confirmed.** The card layout works at 375px.

#### Two-Tier Status Visual Distinction

The spec uses italic text for both tiers, with Tier 2 having "lighter opacity (0.7)." On a white card with #666666 muted text at 0.7 opacity, the effective color is approximately #999999 on white, which has a contrast ratio of about 2.8:1. **This fails WCAG AA (4.5:1).**

**Recommendation (Must-Do):** Do not use opacity to distinguish tiers. Instead, use a slightly different text treatment:
- Tier 1: "Not on promotion at Coop this week" -- 14px, muted (#666), italic. (5.7:1 on white -- passes)
- Tier 2: "We haven't found this at Coop yet" -- 14px, muted (#666), italic, with a small info icon (circle-i) before the text. Same color, same contrast, differentiated by icon rather than opacity.

---

### 9. CategoryFilterPills (Deals Page)

#### Accessibility

The spec correctly uses `role="tablist"` with `role="tab"` and `aria-selected`. Arrow key navigation is specified. Focus ring is specified.

**Issue:** The spec says pills are keyboard navigable with left/right arrow keys, which is the correct pattern for `role="tablist"`. But it does not specify what happens when the user presses Tab while focus is on a pill. Per WAI-ARIA tablist pattern, Tab should move focus OUT of the tablist to the next focusable element (the deal content below), not to the next pill. Left/Right arrows move between pills. This is a subtle but important keyboard interaction that the builder needs to implement correctly.

**Recommendation (Adjust -- add to spec):** Note explicitly: "Tab exits the pill list. Left/Right arrows move between pills. Only the active pill is in the Tab order (roving tabindex pattern)."

---

### 10. DealCard (Deals Page)

#### Discount Badge Contrast

The spec says: "Inline pill. Store-colored background, white text. '-40%'."

- White on Migros (#e65100): 4.6:1 -- passes AA, barely.
- White on Coop (#007a3d): 5.3:1 -- passes AA.

At 12px SemiBold text size, this is technically "large text" by WCAG standards (14px bold or 18px regular). Large text only needs 3:1. So both pass comfortably.

**Verdict: Confirmed.**

---

### 11. Store Colors

The updated color system (Migros #e65100, Coop #007a3d) is a significant improvement over Round 1. The colors are visually distinct (orange vs green), both pass AA contrast for white text, and both have dedicated text variants for light backgrounds.

**Issue from CLAUDE.md:** The CLAUDE.md file lists store colors as "Migros #FF6600 (bg) / #CC5200 (text). Coop #E10A0A (bg) / #B80909 (text)." This contradicts the design spec v2.0 which uses #e65100 and #007a3d. The design system v1.0 also still references the old values.

**Recommendation (Must-Do):** Update CLAUDE.md and design-system.md to reflect the production color values established in design-spec-v2.0 Section 0.1. Inconsistent color references across docs will cause the builder to use wrong values.

---

## Cross-Cutting Concerns

### Consistency

**Typography:** Consistent across all pages. H1 is 24px Bold everywhere except home (28px ExtraBold). H2 is 18px SemiBold. Body is 16px/14px. Captions are 12px. No drift.

**Spacing:** 16px page padding, 16px card padding, 12px gap between cards. Consistent.

**Colors:** Consistent use of design tokens across all pages. No arbitrary hex values in component specs.

**Component reuse:** Header, Footer, DataFreshness, ErrorCard, LoadingSpinner, Toast, Button, Card, Input, Badge are shared across pages. Good.

**One inconsistency:** The Wordle card uses its own typography scale (20px logo, 18px winner line, 14px stats, 12px tagline) that does not align with the page typography scale. This is intentional (compression survival) and documented (Design Decision #1), so it is acceptable.

### Accessibility

**Confirmed good:**
- Heading hierarchy is correct on all pages (single H1, H2s for sections).
- `role` and `aria-label` specified for all complex components.
- Focus states specified (2px accent ring).
- No color-only information (all colored elements have text labels).
- `<time>` elements for machine-readable dates.
- `role="alert"` on all error messages.
- Touch targets 44px minimum throughout.
- `prefers-reduced-motion` respected.

**Issue found:** The Tier 2 Coop status opacity (0.7) fails contrast (see CompareCard section above).

**Issue found:** The spec does not mention skip navigation. A "Skip to main content" link is standard for keyboard users who do not want to tab through the header on every page.

**Recommendation (Should-Do):** Add a visually hidden "Skip to main content" link as the first focusable element on every page. This is trivial to implement (one CSS class + one link) and is expected for WCAG AA.

### Performance

**Confirmed good:**
- html2canvas lazy-loaded on button click (matches architecture ADR).
- System font stack (no external fonts).
- Product images lazy-loaded.
- localStorage caching with 1-hour stale time.
- Skeleton loading states (better perceived performance than spinners alone).

**Issue:** The home page loads verdict data, category summaries, AND renders the Wordle card on mount. If the Wordle card is rendered as HTML/CSS (not an image), this is fine. But the copy-to-clipboard flow lazy-loads html2canvas to convert DOM to canvas. The spec should clarify: the card is ALWAYS rendered as DOM, and html2canvas is ONLY loaded when "Copy card" is tapped. This is implied but not explicit.

**Verdict: Confirmed** (the architecture doc ADR covers this, but adding a note to the design spec would help the builder).

### Contradictions with Architecture or Coding Standards

1. **CLAUDE.md color values** contradict design spec v2.0 (detailed above).
2. **Design system v1.0** references old color values (#FF6600, #E10A0A, #D97706). The design spec Section 0.1 updates these, but the design-system.md file itself is not updated.
3. **Error color reuse:** Design review Round 2 flagged that `.error-msg` uses `var(--color-coop)` which is now green. The design spec v2.0 correctly defines error as `#dc2626` (Section 0.1) but does not explicitly call out fixing the error-msg class. The builder needs to know this.
4. **AboutPage inline styles:** Round 2 flagged two remaining `style={{ lineHeight: 2 }}` in AboutPage.tsx. The design spec's About page section (5.3) specifies "line-height: 2" for lists but does not note this should be a utility class, not inline.

### Implementation with React + Tailwind + shadcn/ui

**No blockers found.** Every component in the design spec maps cleanly to:
- Tailwind utilities for spacing, typography, colors
- shadcn/ui patterns (CVA for button/badge variants, forwardRef, cn() merging)
- Standard React patterns (conditional rendering for states, localStorage for caching)

The only moderate complexity is:
- Wordle card: html2canvas DOM-to-image on tap. This is well-documented and the lazy-load pattern is specified.
- Category pills: Roving tabindex for keyboard navigation. Requires careful implementation but is standard.
- Two-column desktop deals layout: Simple CSS grid. No complexity if independent scroll containers are removed (per recommendation above).

---

## Previous Review Findings: Status Check

| Round 1 Finding | Status in Design Spec v2.0 |
|-----------------|---------------------------|
| Missing OG meta tags | **Addressed** -- Section 10 defines per-page OG tags, theme-color, canonical, apple-touch-icon |
| Success color contrast failure | **Addressed** -- Section 0.1 shows success darkened to #147a2d (5.8:1) |
| Input touch target < 44px | **Addressed** -- Section 12 requires all inputs enforce min-height 44px |
| Arbitrary font sizes | **Addressed** -- Spec uses consistent type scale throughout |
| Product name truncation | **Addressed** -- line-clamp-2 specified on DealCard and CompareCard |
| TemplatePicker loading spinner | **Addressed** -- Section 3.5 specifies spinner for all loading states |
| Social preview image | **Addressed** -- Section 10 specifies 1200x630px OG image |

| Round 2 Finding | Status in Design Spec v2.0 |
|-----------------|---------------------------|
| Touch targets fixed | **Addressed** -- 44px enforced throughout |
| Contrast ratios corrected | **Addressed** -- Updated color tokens in Section 0.1 |
| VerdictBanner store name colors | **Addressed** -- Specified in Section 1.3 and throughout |
| Coop color changed to green | **Addressed** -- #007a3d used throughout |
| Inline styles in AboutPage | **Not addressed** -- Section 5.3 specifies line-height: 2 but does not note it should be a utility class |
| error-msg using Coop color | **Not addressed** -- Not mentioned in the spec |
| Design system doc outdated | **Not addressed** -- Section 0 updates values but design-system.md itself is not updated |

---

## Recommended Changes

### Must-Do (Fix before building)

| # | Issue | Section | Fix |
|---|-------|---------|-----|
| 1 | Tier 2 Coop status opacity (0.7) fails WCAG contrast | 4.3 | Remove opacity. Use icon differentiation instead. Both tiers use #666 at full opacity. |
| 2 | CLAUDE.md and design-system.md color values outdated | Cross-cutting | Update both files to match design-spec-v2.0 Section 0.1 values |
| 3 | error-msg class uses Coop color (green) instead of error color | Cross-cutting | Change to `var(--color-error)` (#dc2626). Update background to #FEF2F2 |

### Should-Do (Fix before launch)

| # | Issue | Section | Fix |
|---|-------|---------|-----|
| 4 | Home page Wordle card placement pushes category cards too far down | 1.1 | Move Wordle card below category cards |
| 5 | Two-tier Coop status wording is too technical | 4.3 | Change "No Coop data yet" to "We haven't found this at Coop yet" or "Coop status unknown" |
| 6 | Category pills need scroll affordance | 2.5 | Ensure last visible pill is cut off (partial visibility) or add right-edge fade |
| 7 | Onboarding auto-advance on pack selection | 3.6 | Remove 300ms auto-advance. Add explicit "Next" button after selection. |
| 8 | Add skip navigation link | 8.1 | Add visually hidden "Skip to main content" link as first focusable element |
| 9 | Add returning-user shortcut on home page | 1.1 | If localStorage has favoriteId, show "Welcome back. View your deals" card near top |
| 10 | Deals page: add whole-page empty state when both stores empty for a category | 2.7 | "No deals in [category] this week. Try another category." |

### Consider (Improvements, not blockers)

| # | Issue | Section | Fix |
|---|-------|---------|-----|
| 11 | Remove share buttons from below verdict banner (keep only below Wordle card) | 1.1 | Reduces above-the-fold clutter |
| 12 | Starter pack cards: add 2-3 preview item names | 3.3 | Helps users differentiate packs without selecting |
| 13 | Replace visible URL on comparison page with "Your personal link" + buttons | 4.1 | Truncated UUIDs add no user value |
| 14 | Reframe 30-item cap warning | 3.4 | "Lists work best with your top 20-30 items. Focus on what you buy every week." |
| 15 | Wordle card: bump stat text from 14px to 15px, tagline from 12px to 13px | 7.2 | Improves WhatsApp compression survival |
| 16 | Wordle card: increase category indicator bars from 4px to 6px | 7.2 | Survives thumbnail scaling better |
| 17 | Deals desktop layout: use page-scrolling columns, not independent scroll | 2.8 | Simpler to build, avoids scroll-trapping |
| 18 | 404 page: use full-width buttons instead of 240px max-width | 6.4 | More consistent with other pages |
| 19 | Add roving tabindex note for category pills keyboard pattern | 2.9 | Helps builder implement correct WAI-ARIA tablist |
| 20 | Note explicitly that Wordle card is DOM (not image) and html2canvas only on tap | 7.4 | Prevents builder confusion |

---

## Final Verdict

**Approved with adjustments.** The design spec is comprehensive, well-documented, and addresses nearly all previous review findings. The 3 Must-Do items are real accessibility and consistency bugs. The 7 Should-Do items are usability improvements that would noticeably improve the experience for the 10-50 user audience. The 10 Consider items are refinements that the builder can evaluate during implementation.

The design is not over-engineered for the audience size. The Wordle card is the right growth bet. The verdict-first sequencing is correct. The two-tier Coop transparency is honest and important -- it just needs better wording. The component inventory maps cleanly to React + Tailwind + shadcn/ui with no implementation blockers.

**Proceed to building after resolving the 3 Must-Do items.**
