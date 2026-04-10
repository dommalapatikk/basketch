# Design Review: basketch Frontend

**Date:** 10 April 2026
**Reviewer:** Product Designer (Mobile-First) Agent
**Scope:** Full design review of all UI code -- styles, components, pages, SEO, accessibility
**Reference:** `docs/design-system.md`, `docs/prd.md`, `docs/use-cases.md`

---

## Executive Summary

The basketch frontend is solid for an MVP. The visual system is cohesive -- consistent spacing, restrained color usage, and a clean Swiss utility aesthetic. The favorites-first onboarding, 3-step progress bar, and split shopping list all serve the 30-second decision goal well. The code uses Tailwind theme tokens correctly, shadcn/ui patterns properly, and accessibility basics are in place (ARIA labels, role attributes, keyboard support).

There are issues to fix before user testing. The most significant: **missing Open Graph meta tags** (blocks sharing on WhatsApp/social), **WCAG contrast failures** on muted text, and **a few mobile edge cases** at 320px width. None require redesign -- all are adjustments.

**Overall verdict: 12 Approved, 6 Adjust, 0 Redesign.**

---

## 1. Visual Consistency

### Verdict: Approved

**What works:**
- **Border radius** is consistent: `rounded-md` (8px) used across Card, Button, Input, CompareCard, Badge uses `rounded-full` intentionally for pill shape, and `rounded-sm` for progress bar steps. No rogue radii.
- **Spacing** follows a tight scale: `p-4` for cards and main content, `p-3` for compact areas (header, comparison summary), `gap-2` for inline groups, `gap-3` for grid layouts. Consistent throughout.
- **Colors** are scoped: Migros orange (#e65100), Coop green (#007a3d), and accent blue (#2563eb) are the only non-neutral colors in the system. No arbitrary color values in component code.
- **Typography weights** are consistent: `font-bold` for h1, `font-semibold` for h2/h3 and section labels, `font-medium` for list item labels.
- **Shadows** are minimal: only `shadow-sm` on Card. No competing shadow levels.

**Minor inconsistency:**
- The `text-[0.95rem]` and `text-[0.7rem]` arbitrary values in TemplatePicker break the Tailwind type scale. These should be `text-sm` and `text-xs` respectively. Not visible to users, but creates drift from the design system over time.

### Adjustment needed:
- Replace `text-[0.95rem]` with `text-base` or `text-sm` in TemplatePicker template card label.
- Replace `text-[0.7rem]` with `text-xs` in TemplatePicker item preview text.

---

## 2. Mobile-First Design

### Verdict: Approved with adjustments

**What works:**
- Layout uses `max-w-[640px]` with `p-4` padding, giving content a clean reading width on all devices. On a 375px screen, content area is 375 - 32 = 343px, which is appropriate.
- TemplatePicker uses `grid-cols-2 max-[400px]:grid-cols-1` -- correctly collapses to single column on very small screens (320px).
- All buttons have `min-h-[44px]` -- meets Apple HIG touch target minimum.
- FavoritesEditor remove buttons have explicit `min-h-[44px] min-w-[44px]` -- correct.
- No horizontal scroll risks: all text containers use `overflow-hidden text-ellipsis` where needed (comparison page URL display).

**Potential issues at 320px:**
- CompareCard's 2-column grid (`grid-cols-2 gap-2`) at 320px gives each column approximately 140px. With `p-3` card padding and `p-2` column padding, content width per column is roughly 124px. Product images at `max-h-[120px]` and product names could overflow if long. The `text-sm text-muted` on product name has no truncation.
- The "Save this list" card on ComparisonPage puts the URL display + Copy + Share buttons in a single flex row. On 320px, the two buttons (~60px each) plus the URL box compete for ~256px. This likely works but is tight.

### Adjustments needed:
- Add `line-clamp-2` or `truncate` to product name in DealColumn (CompareCard line 48: `text-sm text-muted` div).
- Consider `flex-wrap` on the "Save this list" button row for 320px safety, or stack the URL and buttons vertically below 360px.

---

## 3. Component Quality

### 3.1 Button.tsx -- Approved

**What works:**
- Uses `cva` (class-variance-authority) correctly -- the standard shadcn/ui pattern.
- Five well-chosen variants: `primary` (accent blue), `outline` (border only), `migros` (orange), `coop` (green), `ghost` (text only). Covers all app needs.
- `disabled:opacity-50 disabled:cursor-not-allowed` -- proper disabled state.
- `min-h-[44px]` -- meets touch target requirement.
- `transition-opacity` with `hover:opacity-90` -- subtle, functional hover. No flashy animations.
- `forwardRef` used correctly for composability.
- `fullWidth` variant is a clean boolean option.

**One concern:**
- Hover uses `opacity-90` which is a subtle 10% change. On mobile (where hover doesn't exist), this is fine. On desktop, it may feel like the button isn't responding. Consider adding a slightly darker background on hover as an alternative for desktop.

### 3.2 Card.tsx -- Approved

**What works:**
- Clean: `rounded-md border border-border bg-surface p-4 shadow-sm`. Exactly what a utility card should be.
- `forwardRef` for composability.
- `className` prop merged via `cn()` -- allows per-instance customization without breaking base styles.

**No issues.**

### 3.3 Input.tsx -- Approved

**What works:**
- Focus state: `focus:border-accent focus:ring-2 focus:ring-accent/10` -- visible focus ring for keyboard navigation.
- `w-full` default with `flex-1` override where needed -- correct responsive pattern.
- `text-sm` with `px-3 py-2.5` -- comfortable touch target and readability.

**Minor note:**
- No explicit `min-h-[44px]`. The `py-2.5` (10px top + 10px bottom) + `text-sm` (~20px line height) = ~40px, which is close but below the 44px minimum. Adding `min-h-[44px]` would be safer.

### 3.4 Badge.tsx -- Approved

**What works:**
- Five variants mapped to app concepts: `migros`, `coop`, `both`, `none`, `accent`.
- Uses light background + darker text: `bg-migros-light text-migros-text` -- correct pattern for legibility.
- `rounded-full` for pill shape -- distinct from cards (rounded-md).
- `text-xs font-semibold` -- appropriate scale for labels.
- The `accent` variant uses `text-[0.65rem] uppercase tracking-wide` -- smaller scale for "Recommended" tag, which is intentional.

---

## 4. Color System

### Verdict: Approved with one contrast adjustment

**Theme tokens (from styles.css):**

| Token | Hex | Usage |
|-------|-----|-------|
| `migros` | #e65100 | Migros brand (deep orange) |
| `migros-light` | #fff3e6 | Migros backgrounds |
| `migros-text` | #c54400 | Migros text on light bg |
| `coop` | #007a3d | Coop brand (green) |
| `coop-light` | #e6f4ec | Coop backgrounds |
| `accent` | #2563eb | CTAs, links, active states |
| `accent-light` | #eff6ff | Selected template bg |
| `success` | #16a34a | Savings, "both" badges |
| `warning` | #b45309 | Data freshness warnings |
| `error` | #dc2626 | Error messages |
| `surface` | #ffffff | Card backgrounds |
| `bg` | #fafafa | Page background |
| `border` | #e5e5e5 | All borders |
| `muted` | #666666 | Secondary text |

**Color harmony assessment:**
- Migros orange and Coop green are the official brand colors. They are visually distinct and neither dominates -- good balance. The light variants (#fff3e6 and #e6f4ec) create gentle, branded backgrounds without overwhelming the content.
- Accent blue (#2563eb) is a strong, neutral CTA color that doesn't compete with either store brand. It only appears on buttons and the progress bar -- correct.
- The neutral palette (surface/bg/border/muted) is well-calibrated for a light-mode utility app. The #fafafa background is just barely off-white, giving cards (#ffffff) subtle lift without needing heavier shadows.

**WCAG contrast analysis:**

| Combination | Ratio (approx) | WCAG AA (4.5:1) | Verdict |
|-------------|----------------|------------------|---------|
| `muted` (#666) on `bg` (#fafafa) | 5.4:1 | Pass | OK |
| `muted` (#666) on `surface` (#fff) | 5.7:1 | Pass | OK |
| `migros-text` (#c54400) on `migros-light` (#fff3e6) | ~4.7:1 | Pass (barely) | OK |
| `coop` (#007a3d) on `coop-light` (#e6f4ec) | ~4.8:1 | Pass (barely) | OK |
| `coop` (#007a3d) on `white` (#fff) | ~5.3:1 | Pass | OK |
| `white` on `migros` (#e65100) | ~4.6:1 | Pass (barely) | OK |
| `white` on `coop` (#007a3d) | ~5.3:1 | Pass | OK |
| `white` on `accent` (#2563eb) | ~4.6:1 | Pass (barely) | OK |
| `muted` (#666) on `migros-light` (#fff3e6) | ~5.0:1 | Pass | OK |
| `success` (#16a34a) on `success-light` (#e8f5e9) | ~3.8:1 | **Fail** | Adjust |
| `muted` (#666) italic "No deal" text on colored bg | ~4.5:1 | Borderline | Monitor |

### Adjustment needed:
- The `success` text (#16a34a) on `success-light` background (#e8f5e9) -- used in the "Same deal at both" badge and success messages -- falls below 4.5:1. Darken `success` to #14752d or darken `success-light` to improve contrast.
- Several brand-on-light combinations are borderline (~4.6-4.8:1). They pass AA but would fail AAA. For a grocery app used in bright outdoor conditions (checking phone in the store), bumping these slightly darker would improve real-world legibility.

---

## 5. Typography Hierarchy

### Verdict: Approved

**Observed scale:**

| Level | Usage | Classes | Approx size |
|-------|-------|---------|-------------|
| H1 | Page titles (Home, Onboarding, Comparison, About) | `text-2xl font-bold` or `text-[1.75rem] font-extrabold` | 28px / 24px |
| H2 | Section headers (starter packs, favorites, data sources) | `text-lg font-semibold` | 18px |
| H3 | Card titles (email capture, save list, about sections) | `text-lg font-semibold` | 18px |
| Body | Descriptions, form labels | `text-sm` or `text-base` | 14px / 16px |
| Caption | Store labels, item counts, muted info | `text-xs` or `text-[0.7rem]` | 12px / 11.2px |
| Micro | Category labels on deal columns | `text-[0.7rem] uppercase tracking-wide` | 11.2px |

**What works:**
- Clear differentiation between levels. H1 is visually dominant, H2/H3 are section-level, body is comfortable, captions are clearly secondary.
- System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) is fast-loading and native-feeling on all devices.
- `leading-tight` on the home page H1 creates a compact, punchy headline.

**Minor issue:**
- H2 and H3 use identical classes (`text-lg font-semibold`). This is fine because they serve similar purposes (section vs. card headers) and the structural context differentiates them. But if the hierarchy grows, consider `text-xl` for H2.
- The `text-[1.75rem]` on the HomePage H1 breaks the Tailwind scale. `text-3xl` (30px) or keeping `text-2xl` (24px) would be more consistent with the rest of the app. The current 28px is slightly off-grid.

---

## 6. Deal Comparison Cards (CompareCard + SplitList)

### Verdict: Approved

**What works:**
- **2-column layout** (`grid-cols-2 gap-2`) is the correct pattern for Migros vs Coop side-by-side comparison. Each column has its store's light background color -- instant visual association.
- **Price hierarchy** is correct: sale price in `text-lg font-bold` (large, prominent), original price in `text-xs text-muted line-through` (clearly secondary), discount in `text-xs font-semibold text-success` (green, attention-grabbing).
- **Product images** use `max-h-[120px] object-contain` -- constrains height, preserves aspect ratio, prevents layout blow-up from oversized images.
- **Store label** uses `text-[0.7rem] font-semibold uppercase tracking-wide` -- small but readable, clearly a label.
- **Recommendation badge** in the card header (Migros/Coop/Either/No deals) with color-coded variants gives instant scanability.
- **"No deal" state** shows italic muted text within the store column -- present but visually subordinate. Correct.
- **SplitList grouping** with colored dots (Migros orange, Coop green, success green, muted gray) creates a clear visual hierarchy of recommendation groups.

**Scanability test (mental model):**
A user scrolling through the comparison page sees: section header with colored dot + count -> card with product name + badge -> 2-column comparison with prices. This reads top-to-bottom, left-to-right, and communicates the recommendation in under 2 seconds per card. Good.

**Minor notes:**
- The `lazy` loading on product images is correct for performance. Good.
- The `bg-gray-50` fallback on images provides a neutral placeholder while loading. Good.
- Product name in the deal column is below the price. This is unconventional (usually name comes first), but for a deal comparison app, the price IS the primary information. The current order (price -> discount -> name) prioritizes the decision-relevant data. This is a deliberate, correct choice.

---

## 7. Empty, Loading, and Error States

### Verdict: Approved with adjustments

**Loading states:**
- Onboarding page: "Setting up..." text + CSS spinner (`border-3 border-border border-t-accent animate-spin`). Spinner uses accent color. Good.
- Comparison page: "Loading your deals..." text + identical spinner. Consistent.
- TemplatePicker: "Loading starter packs..." text only (no spinner). Inconsistent.

**Error states:**
- TemplatePicker: `bg-error-light p-6 text-center text-error` -- clear red error card. Good.
- OnboardingPage: Same pattern with `role="alert"`. Good accessibility.
- ComparisonPage: Same pattern for both "No favorites list found" and "Could not load your deals". Both offer a "Create a new list" CTA button. Good recovery path.
- EmailCapture: Inline `text-sm text-error` with `role="alert"`. Appropriate for form validation.

**Empty states:**
- FavoritesEditor empty: "Add your first product to see this week's best deals." -- clear, actionable copy. Good.
- SplitList empty: "Your list is empty. Add items to see deals." -- clear. Good.
- TemplatePicker empty: "No starter packs available" -- functional but not actionable. Should offer a "Build my own list" alternative.
- ProductSearch no results: "No current deals found for '...'. You can still add it to track future deals." + "Add to my list" button. Excellent -- turns a dead end into an action.

### Adjustments needed:
- Add a spinner to TemplatePicker loading state to match Onboarding and Comparison pages.
- Add an actionable fallback to the TemplatePicker empty state ("No starter packs available. Build your own list instead." with link/button).

---

## 8. Micro-Interactions

### Verdict: Approved

**Button hover:**
- `hover:opacity-90` on all button variants. Subtle, consistent. Ghost variant uses `hover:text-current` (color shift from muted to dark). Both appropriate.

**Loading indicators:**
- Button text changes: "Search" -> "...", "Save" -> "Saving...", "Find my list" -> "Searching...". Inline text change is the correct pattern for utility buttons -- no separate spinner needed.
- Page-level spinner for longer operations (creating favorite, loading comparison). Correct escalation.

**Copy feedback:**
- ComparisonPage "Copy" button changes to "Copied!" for 2 seconds, then reverts. Clear, time-limited feedback. Good.

**Step progress bar:**
- Onboarding uses 3 colored bars: completed = `bg-success`, current = `bg-accent`, future = `bg-border`. Clean, scannable. ARIA labels on each step ("Step 1 (done)", "Step 2 (current)"). Good accessibility.

**Email save success:**
- "List saved! Redirecting to your deals..." with `bg-success-light` background and 1.5-second delay. Good -- gives confirmation before navigation.

**Remove item:**
- "x" changes to "..." while removing, button is disabled. Hover changes color to `text-error`. Correct feedback pattern.

**Missing interactions:**
- No skeleton/shimmer loading states for the comparison cards. Text loading is fine for MVP, but shimmer would improve perceived performance.
- No animation on step transitions in onboarding. Steps appear/disappear instantly. A subtle fade or slide would smooth the experience. Low priority for MVP.

---

## 9. Store Identity

### Verdict: Approved

**Migros identity:**
- Color: #e65100 (deep orange). Used for: Migros button variant, Migros badge, Migros section dot in SplitList, "Migros" label in comparison summary.
- Light variant: #fff3e6 (warm peach). Used for: DealColumn background, comparison summary card.
- Text variant: #c54400 (darkened orange). Used for: Badge text on light background.

**Coop identity:**
- Color: #007a3d (green). Used for: Coop button variant, Coop badge, Coop section dot in SplitList, "Coop" label in comparison summary.
- Light variant: #e6f4ec (mint). Used for: DealColumn background, comparison summary card.

**Balance assessment:**
- Both stores get identical treatment: same column width in comparison, same badge structure, same section grouping pattern, same summary card layout. Neither store is visually favored.
- The home page headline ("Compare Migros and Coop deals") names both stores. The description text is neutral.
- The comparison page summary shows both stores side by side with equal visual weight.

**No bias detected.** The design treats both stores as peers throughout.

---

## 10. SEO and Sharing

### Verdict: Adjust (significant gaps)

**What exists in index.html:**
- `<title>basketch -- Migros vs Coop deals</title>` -- Good. Includes brand name + value proposition + both store names.
- `<meta name="description" content="Your groceries. Two stores. One smart list. Compare Migros vs Coop deals for the items you actually buy." />` -- Good copy. Includes keywords.
- `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` -- Correct.
- `<meta charset="UTF-8" />` -- Correct.
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` -- Present. SVG favicon with basket + Swiss cross design in accent blue. Good brand identity.

**What is missing:**

1. **Open Graph tags (critical for WhatsApp/social sharing):**
   - `<meta property="og:title">` -- Missing
   - `<meta property="og:description">` -- Missing
   - `<meta property="og:image">` -- Missing (no social preview image)
   - `<meta property="og:url">` -- Missing
   - `<meta property="og:type">` -- Missing

   This is critical because the PRD explicitly calls out WhatsApp sharing as a growth channel (Section 6, Phase 1). Without OG tags, a shared link shows as a bare URL in WhatsApp -- no title, no description, no image. This directly undermines the share-a-list viral loop (UC-7).

2. **Twitter/X card tags:**
   - `<meta name="twitter:card">` -- Missing
   - `<meta name="twitter:title">` -- Missing
   - `<meta name="twitter:description">` -- Missing

3. **Additional SEO tags:**
   - `<html lang="en">` -- Present. Good.
   - `<link rel="canonical">` -- Missing. Should be `https://basketch.vercel.app/`.
   - `<meta name="robots">` -- Missing (defaults to index/follow, which is correct, but explicit is better).
   - `<meta name="theme-color">` -- Missing. Should be `#2563eb` (accent blue) for mobile browser chrome coloring.

4. **Social preview image:**
   - No OG image exists. Need a 1200x630px image showing the basketch logo, tagline, and Migros/Coop branding. This is the single highest-impact SEO/sharing improvement.

5. **Apple touch icon:**
   - `<link rel="apple-touch-icon">` -- Missing. Users who add to home screen get a generic icon.

### Adjustments needed (priority order):
1. Add OG meta tags to `index.html` (title, description, url, type, image).
2. Create a social preview image (1200x630px).
3. Add `<meta name="theme-color" content="#2563eb">`.
4. Add `<link rel="canonical" href="https://basketch.vercel.app/">`.
5. Add apple-touch-icon (can reuse/resize the SVG favicon).

---

## Component-by-Component Verdicts

| # | Component | File | Verdict | Notes |
|---|-----------|------|---------|-------|
| 1 | **Button** | `ui/Button.tsx` | Approved | Clean CVA pattern, good variants, 44px touch targets |
| 2 | **Card** | `ui/Card.tsx` | Approved | Minimal, correct shadow + border |
| 3 | **Input** | `ui/Input.tsx` | Adjust | Add `min-h-[44px]` for guaranteed touch target |
| 4 | **Badge** | `ui/Badge.tsx` | Approved | Five variants cover all use cases |
| 5 | **Layout** | `Layout.tsx` | Approved | Sticky header, 640px max-width, proper nav |
| 6 | **TemplatePicker** | `TemplatePicker.tsx` | Adjust | Replace arbitrary font sizes; add spinner to loading state; improve empty state |
| 7 | **FavoritesEditor** | `FavoritesEditor.tsx` | Approved | Good empty state, proper remove UX, ARIA labels |
| 8 | **ProductSearch** | `ProductSearch.tsx` | Approved | Excellent no-results recovery, keyboard support |
| 9 | **CompareCard** | `CompareCard.tsx` | Adjust | Add line-clamp on product name for 320px safety |
| 10 | **SplitList** | `SplitList.tsx` | Approved | Clean section grouping, colored dots, proper empty state |
| 11 | **EmailCapture** | `EmailCapture.tsx` | Approved | Good success animation, ARIA, validation |
| 12 | **HomePage** | `HomePage.tsx` | Adjust | Arbitrary H1 size `text-[1.75rem]` -- use scale value |
| 13 | **OnboardingPage** | `OnboardingPage.tsx` | Approved | 3-step flow, progress bar, back navigation, all states handled |
| 14 | **ComparisonPage** | `ComparisonPage.tsx` | Adjust | Add truncation safeguard on share URL row for small screens |
| 15 | **AboutPage** | `AboutPage.tsx` | Approved | Clean cards, ordered list, privacy section, proper attribution |
| 16 | **index.html** | `index.html` | Adjust | Missing OG tags, theme-color, canonical, apple-touch-icon |
| 17 | **styles.css** | `styles.css` | Approved | Clean theme tokens, correct @theme syntax, minimal custom CSS |
| 18 | **favicon.svg** | `public/favicon.svg` | Approved | Basket + Swiss cross in accent blue. Good brand mark. |

---

## Priority Fix List

### P0 -- Fix before user testing

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Missing Open Graph meta tags | `web/index.html` | Add og:title, og:description, og:url, og:type, og:image |
| 2 | Success color contrast failure | `web/src/styles.css` | Darken `--color-success` from #16a34a to #147a2d for 4.5:1 on success-light |
| 3 | Input touch target below 44px | `web/src/components/ui/Input.tsx` | Add `min-h-[44px]` to base classes |

### P1 -- Fix before launch

| # | Issue | File | Fix |
|---|-------|------|-----|
| 4 | Arbitrary font sizes in TemplatePicker | `TemplatePicker.tsx` | Replace `text-[0.95rem]` -> `text-base`, `text-[0.7rem]` -> `text-xs` |
| 5 | Arbitrary H1 size on HomePage | `HomePage.tsx` | Replace `text-[1.75rem]` -> `text-3xl` or `text-2xl` |
| 6 | No line-clamp on product names in CompareCard | `CompareCard.tsx` | Add `line-clamp-2` to product name div |
| 7 | Missing theme-color meta tag | `web/index.html` | Add `<meta name="theme-color" content="#2563eb">` |
| 8 | Missing canonical URL | `web/index.html` | Add `<link rel="canonical" href="https://basketch.vercel.app/">` |
| 9 | TemplatePicker loading state missing spinner | `TemplatePicker.tsx` | Add CSS spinner to match other loading states |
| 10 | Create social preview image | `web/public/` | 1200x630px OG image for sharing |

### P2 -- Nice to have

| # | Issue | File | Fix |
|---|-------|------|-----|
| 11 | Share URL row could wrap on 320px | `ComparisonPage.tsx` | Add responsive stacking for the URL + buttons row |
| 12 | No apple-touch-icon | `web/index.html` | Generate and add apple-touch-icon for home screen |
| 13 | TemplatePicker empty state not actionable | `TemplatePicker.tsx` | Add "Build from scratch" fallback link |
| 14 | H2/H3 use same visual weight | Various | Consider `text-xl` for H2 if hierarchy grows |
| 15 | No skeleton loading for comparison cards | `ComparisonPage.tsx` | Add shimmer placeholders for perceived performance |

---

## Design System Compliance Summary

| Aspect | Compliant? | Notes |
|--------|------------|-------|
| Color tokens via @theme | Yes | All colors defined as CSS custom properties in styles.css |
| No arbitrary colors in components | Yes | All components use theme tokens (bg-migros, text-coop, etc.) |
| Consistent border radius | Yes | rounded-md for containers, rounded-full for badges |
| 44px touch targets | Mostly | Buttons pass, Input is ~40px (needs fix), remove buttons pass |
| WCAG AA contrast | Mostly | Muted text passes, brand colors pass (barely), success fails on success-light |
| System font stack | Yes | Native fonts, no external font loading |
| No custom CSS (beyond theme) | Yes | Only @keyframes spin is custom. Everything else is Tailwind utility classes. |
| shadcn/ui patterns | Yes | CVA for variants, forwardRef, cn() utility, composable props |
| Mobile-first responsive | Yes | 640px max-width, responsive grids, no horizontal overflow |
| Three states (loading/error/success) | Yes | All data-fetching components handle all three states |

---

## Overall Assessment

The basketch frontend is a clean, well-executed MVP that follows Swiss design principles: restraint, precision, clarity. The favorites-first flow is well-structured, the comparison cards are scannable, and the visual system is cohesive.

The biggest gap is SEO/sharing meta tags -- this directly impacts the growth engine described in the PRD (WhatsApp sharing, social previews). This should be the first fix.

The codebase quality is high: consistent patterns, proper accessibility attributes, no visual debt. The adjustments listed above are minor refinements, not structural issues. This is ready for user testing after the P0 fixes.
