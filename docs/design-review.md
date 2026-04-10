# Design Review: basketch Frontend

**Date:** 10 April 2026
**Reviewer:** Product Designer (Mobile-First) Agent
**Scope:** All built frontend components and pages
**Reference:** `docs/design-system.md` (created alongside this review)

---

## Executive Summary

The frontend is well-built for an MVP. The architecture follows the favorites-first pivot correctly, the 3-step onboarding flow is clean, and the split shopping list delivers the core value. The visual system is consistent and restrained -- no decoration, no clutter.

However, there are **accessibility failures** (contrast ratios, touch targets) that need fixing before user testing, and a **critical brand color issue** (Coop uses red instead of their official orange/green) that should be a conscious decision, not an accident.

**Overall verdict:** 7 components Approved, 4 Adjust, 1 Redesign concern (VerdictBanner position).

---

## Review by Component

### 1. Layout.tsx -- Approved

**What works:**
- Sticky header with logo + nav is the correct pattern for a utility tool
- 640px max-width is appropriate -- keeps content scannable on all devices
- Footer is minimal and unobtrusive
- `<Outlet />` pattern cleanly separates layout from page content

**Issues (minor):**
- Header nav links ("My List", "About") are 14px without explicit touch target sizing. On mobile, the tap area is only the text width, which may be smaller than 44x44px. Consider wrapping nav links in a container with `min-height: 44px; min-width: 44px; display: flex; align-items: center`.
- Footer lacks the "About" link and "built by Kiran" attribution mentioned in the agent instructions. It only says "basketch -- Migros vs Coop, side by side".

**Verdict: Approved** (with minor touch target note)

---

### 2. VerdictBanner.tsx -- Adjust

**What works:**
- Clean card layout with centered text
- "WEEKLY VERDICT" uppercase label creates visual hierarchy
- Stale/partial data warnings are appropriately subtle (amber, small text)
- Returns `null` when no verdict -- no empty card rendered

**Issues:**

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | **Verdict text does not use store colors.** The design spec says "Must use store colors for store names" (e.g., "Migros" in orange, "Coop" in red). Currently the entire verdict is plain text in `--color-text`. | Medium | Parse the verdict string to wrap store names in colored `<span>` elements. This is the key visual signal -- users should spot their store's color instantly. |
| 2 | **Position on HomePage is below the hero.** The design spec says "The hero element. First thing users see. Above the fold on mobile." Currently the hero section with title + subtitle + CTA button pushes the verdict below the fold on a 667px-height iPhone. | Medium | Move `<VerdictBanner>` above the hero CTA, or reduce hero padding. The verdict is the primary value for returning users; the hero CTA is for first-time users. Consider: verdict first, then hero/CTA. |
| 3 | **No deal count or category breakdown visible.** The verdict says "This week: Migros for Fresh, Coop for Household" but doesn't show how many deals or average discount per category. This was part of the design spec (CategorySection with deal counts). | Low | Acceptable for MVP. The favorites-first pivot makes the generic category breakdown less relevant -- the user's comparison page is personalized. |

**Verdict: Adjust** -- Add store colors to verdict text (issue 1) and consider repositioning above the fold (issue 2).

---

### 3. TemplatePicker.tsx -- Approved

**What works:**
- 2-column grid is scannable on mobile
- Selected state (blue border + light blue bg) provides clear feedback
- Three states handled (loading, error, empty)
- Pack cards are full `<button>` elements -- semantically correct and accessible
- Shows item count per pack -- helps user choose

**Issues (minor):**
- No description shown for the starter packs in the spec mentions "How do you cook?" framing. The current heading is "Pick a starter pack" which is functional but less engaging. The OnboardingPage subtitle covers this with "Choose a template to get started fast" which is acceptable.

**Verdict: Approved**

---

### 4. FavoritesEditor.tsx -- Adjust

**What works:**
- Clean list layout with label + keyword per item
- Remove button has `aria-label` for screen readers
- Item count footer provides context
- "Add item" toggle keeps the UI clean until needed

**Issues:**

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | **Remove button ("x") touch target is too small.** Padding is 4px vertical, 8px horizontal. With 1.2rem font, the effective size is approximately 24x24px -- well below the 44x44px minimum. | High | Increase padding to at least `12px 16px` or use `min-width: 44px; min-height: 44px`. The "x" character should also be replaced with a proper icon or the text "Remove" for clarity. |
| 2 | **Inline style on section title.** `style={{ marginBottom: 0 }}` overrides the CSS class. This breaks the pattern of CSS-only styling. | Low | Add a utility class `.mb-0 { margin-bottom: 0; }` to styles.css. |

**Verdict: Adjust** -- Fix remove button touch target (critical accessibility issue).

---

### 5. ProductSearch.tsx -- Adjust

**What works:**
- Search + results pattern is intuitive
- "Add anyway" fallback for no-results is smart UX -- users can add items not currently on sale
- Deduplication of results by product name prevents confusion
- Enter key support for search

**Issues:**

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | **"Add" button uses `.btn-sm` (6px/12px padding).** Effective height is ~28px. Below 44px minimum touch target. | High | Use standard `.btn` sizing or add `min-height: 44px`. |
| 2 | **"Search" button uses `.btn-sm`.** Same touch target issue. | High | Same fix. |
| 3 | **Store name in results is plain text without color.** Results show "CHF 1.50 (-25%) | migros" but "migros" is not visually differentiated with brand color. | Low | Wrap store name in a small StoreBadge or colored text span. |

**Verdict: Adjust** -- Fix button touch targets.

---

### 6. EmailCapture.tsx -- Approved

**What works:**
- Clean card layout with clear purpose
- "No password needed" copy reduces anxiety
- Skip option is clearly offered ("You can also skip this and bookmark the comparison page")
- Enter key support for email submission
- Error state handled gracefully

**Issues (minor):**
- Error text uses `style={{ color: 'var(--color-coop)' }}` -- this is an inline style. Should use a CSS class like `.text-error`.
- The error color is the Coop brand color, which is semantically wrong. Errors should use a dedicated error color. In this case `--color-coop` and error red happen to be the same (#E10A0A), but the semantic intention is unclear.

**Verdict: Approved** (with note about semantic color usage)

---

### 7. CompareCard.tsx -- Approved

**What works:**
- Side-by-side 2-column layout is the core design pattern -- clean execution
- Store-specific background tints (Migros light, Coop light) create instant visual grouping
- Recommendation tag with pill shape provides quick scanning
- "No deal" state is clearly differentiated (muted, italic)
- Price is prominently sized (1.1rem, Bold)

**Issues (minor):**
- Inline style `style={{ marginLeft: 8 }}` on the keyword span. Should be a CSS class.
- Inline style `style={{ marginTop: 2 }}` on product name. Should be a CSS class.
- The keyword shown after the label (e.g., "Milk milch") is useful for debugging but may confuse end users who don't understand the matching system. Consider hiding it or showing it only in a tooltip.

**Verdict: Approved**

---

### 8. SplitList.tsx -- Approved

**What works:**
- Four-section split (Migros / Coop / Either / No deals) matches the design spec perfectly
- Colored dots next to section headers provide instant store identification
- Sections only render when they have items -- no empty sections cluttering the page
- Empty state message is clear

**Verdict: Approved** -- Clean, well-structured component.

---

### 9. HomePage.tsx -- Adjust

**What works:**
- Hero copy is strong: "Your groceries. Two stores. One smart list." -- clear, concise, action-oriented
- Subtitle explains the value proposition in one sentence
- Full-width CTA is easy to tap
- Email lookup for returning users is below the fold -- appropriate secondary action
- Three states for verdict loading

**Issues:**

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | **Verdict banner is below the hero, below the fold on most phones.** See VerdictBanner issue #2 above. For returning users, the verdict is the primary content. For new users, the CTA is primary. These audiences have competing needs. | Medium | Consider: if user has a saved email in localStorage, show verdict first then CTA. If new user, show CTA first. Or simply move verdict above the email lookup card (it currently sits between hero and email card, which is correct ordering, but the hero pushes it down). |
| 2 | **Lookup error uses inline style** `style={{ color: 'var(--color-warning)' }}`. | Low | Use a CSS class. |
| 3 | **No loading state shown while fetching deals for verdict.** The `!loading &&` guard means nothing renders while deals load. A skeleton or "Loading this week's verdict..." would be better. | Low | Add a skeleton or loading indicator in the verdict position. |

**Verdict: Adjust** -- Address verdict positioning for returning users.

---

### 10. OnboardingPage.tsx -- Approved

**What works:**
- 3-step wizard is clear and linear
- Step progress bar provides orientation (where am I?)
- Contextual subtitle changes per step -- good wayfinding
- "Start from scratch" option respects user agency
- "Skip -- just show my deals" after email step reduces friction
- "Compare deals (X items)" CTA shows item count -- reassuring
- Loading state handled for pack import

**Issues (minor):**
- The step bar uses 4px height bars. These are purely visual (not interactive), which is correct.
- When returning to edit from comparison page, the flow starts at "pick" again. Consider deep-linking to the "edit" step if the user already has a favoriteId.

**Verdict: Approved**

---

### 11. ComparisonPage.tsx -- Approved

**What works:**
- Page title and subtitle give immediate context ("15 items compared | 4 at Migros | 3 at Coop")
- SplitList is the right component for this page
- "Edit my list" link at the bottom provides a clear exit/modify path
- Error state with "Create a new list" CTA is recovery-friendly
- Loading state is present

**Issues (minor):**
- No VerdictBanner shown on the comparison page. The user sees their personalized comparison but not the overall weekly verdict. Consider adding it at the top for context.

**Verdict: Approved**

---

### 12. AboutPage.tsx -- Approved

**What works:**
- Clean card-based layout with clear sections
- "How it works" as an ordered list is easy to scan
- Data sources are transparent (Migros API, aktionis.ch)
- Legal note ("Only publicly available data") is present
- Privacy section is clear and reassuring
- "Built by" section is personal and honest

**Issues (minor):**
- Inline styles for list padding (`style={{ paddingLeft: 20 }}`). Should be CSS classes.
- No link to GitHub repo (mentioned in design spec).
- Footer repeats the tagline but About page doesn't link back to Home.

**Verdict: Approved**

---

## Cross-Cutting Issues

### Issue A: CSS Architecture -- Custom CSS vs Tailwind

The coding standards document specifies Tailwind + shadcn/ui. The built frontend uses **plain CSS with custom properties** in `styles.css`. No Tailwind classes are used. No shadcn/ui components are used.

**Assessment:** The plain CSS approach works well for this MVP. The styles are organized, consistent, and maintainable at this scale (~550 lines). However, it diverges from the documented coding standards. This is a decision to formalize, not a bug to fix.

**Recommendation:** Either (a) update coding-standards.md to reflect the plain CSS decision, or (b) plan a Tailwind migration before the codebase grows. At the current size, either approach is fine.

### Issue B: Coop Brand Color

The CSS uses `--color-coop: #e10a0a` (red). Coop Switzerland's official primary brand color is orange (#FF8C00). Their logo uses orange, white, and grey.

However, using orange for Coop would create a visual conflict with Migros (#FF6600) -- both would be shades of orange, making instant store differentiation impossible.

**Assessment:** The red choice is defensible as a design decision for differentiation. But it should be documented as intentional, not mistaken for the "official" brand color. The agent instructions say "Migros = orange, Coop = green" -- neither matches what's implemented (Coop is red, not green).

**Recommendation:** Consider using Coop's secondary green/teal from their "Coop Naturaplan" or sustainability branding, or a deep green (#007A3D or similar) that many Swiss shoppers associate with Coop's physical stores and signage. Green vs orange provides maximum differentiation and matches the agent spec ("Migros = orange, Coop = green").

### Issue C: Accessibility Failures

Three categories of failure need attention before user testing:

1. **Touch targets below 44px:** `.btn-sm` (28px), `.fav-remove` (24px), header nav links (text-height only)
2. **Contrast ratio failures:** Migros tag text on light bg (3.2:1), white on Migros orange buttons (3.0:1), warning amber on white (3.5:1)
3. **Button minimum heights:** Standard `.btn` is approximately 38px -- just below the 44px minimum

**Recommendation:** Add `min-height: 44px` to all `.btn` variants. Darken Migros tag text to `#CC5200` and warning text to `#B45309` for WCAG AA compliance.

### Issue D: Inline Styles

Multiple components use `style={{ }}` for one-off spacing or color overrides:
- `CompareCard.tsx`: `style={{ marginLeft: 8 }}`, `style={{ marginTop: 2 }}`
- `FavoritesEditor.tsx`: `style={{ marginBottom: 0 }}`
- `EmailCapture.tsx`: `style={{ color: 'var(--color-coop)' }}`
- `HomePage.tsx`: `style={{ color: 'var(--color-warning)' }}`
- `AboutPage.tsx`: `style={{ paddingLeft: 20 }}`

**Recommendation:** Add small utility classes to `styles.css` (e.g., `.ml-8`, `.mt-2`, `.mb-0`, `.pl-20`, `.text-error`, `.text-warning`). This keeps all visual decisions in one place and avoids scattered inline styles.

### Issue E: Missing Components from Original Architecture

The original architecture (technical-architecture.md) specified these components that do not exist in the build:
- `DealCard.tsx` -- replaced by `CompareCard.tsx` (appropriate pivot -- favorites-first means no generic deal browsing)
- `CategorySection.tsx` -- replaced by `SplitList.tsx` sections (appropriate pivot)
- `StoreBadge.tsx` -- store identity is handled via tags in CompareCard (acceptable)
- `DataWarning.tsx` -- stale data warning is inline in VerdictBanner (acceptable)

**Assessment:** These changes are correct. The favorites-first pivot changed the UI from "browse all deals by category" to "see your items with store comparison." The new components serve the new architecture better.

---

## Priority Action Items

### Must Fix (Before User Testing)

| # | Issue | Component | What to Do |
|---|-------|-----------|------------|
| 1 | Touch targets below 44px | FavoritesEditor, ProductSearch, Layout | Add `min-height: 44px` to all interactive elements |
| 2 | Contrast ratio failures | styles.css | Darken Migros tag text, warning text. Test white-on-brand-color buttons. |
| 3 | Store colors in verdict text | VerdictBanner | Wrap "Migros" and "Coop" in colored spans |

### Should Fix (Before Friends Beta)

| # | Issue | Component | What to Do |
|---|-------|-----------|------------|
| 4 | Coop brand color decision | styles.css | Decide: keep red, switch to green, or use official orange. Document the decision. |
| 5 | Inline styles cleanup | Multiple | Add utility classes to styles.css, remove inline styles |
| 6 | Verdict banner positioning | HomePage | Test whether verdict appears above the fold on iPhone SE (375x667). Adjust hero padding if not. |

### Nice to Have (Post-Beta)

| # | Issue | Component | What to Do |
|---|-------|-----------|------------|
| 7 | GitHub repo link on About page | AboutPage | Add link per design spec |
| 8 | Footer attribution | Layout | Add "Built by Kiran" to footer per spec |
| 9 | Coding standards alignment | docs/coding-standards.md | Update to reflect plain CSS approach (or plan Tailwind migration) |
| 10 | Loading skeleton for verdict | HomePage | Replace blank space during load with skeleton |

---

## Component Verdict Summary

| Component | Verdict | Key Issue |
|-----------|---------|-----------|
| Layout.tsx | **Approved** | Minor: nav link touch targets |
| VerdictBanner.tsx | **Adjust** | No store colors in text; position below fold |
| TemplatePicker.tsx | **Approved** | -- |
| FavoritesEditor.tsx | **Adjust** | Remove button touch target too small |
| ProductSearch.tsx | **Adjust** | Button touch targets too small |
| EmailCapture.tsx | **Approved** | Minor: inline style for error color |
| CompareCard.tsx | **Approved** | Minor: inline styles |
| SplitList.tsx | **Approved** | -- |
| HomePage.tsx | **Adjust** | Verdict position; loading state |
| OnboardingPage.tsx | **Approved** | -- |
| ComparisonPage.tsx | **Approved** | -- |
| AboutPage.tsx | **Approved** | Minor: missing GitHub link |
| styles.css | **Approved** | Consistent, well-organized, appropriate for MVP scale |
