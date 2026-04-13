# Design System: basketch

**Version:** 1.2
**Date:** 12 April 2026
**Author:** Product Designer (Mobile-First) Agent
**Status:** Updated to match design-spec v2.1 color values and terminology

---

## 1. Design Principles

1. **Mobile-first.** 80% of visits are on phones. Every layout begins at 375px width. Desktop is an enhancement, not the default.
2. **Scannable in 5 seconds.** The verdict or comparison must be readable without scrolling on mobile. Deal cards communicate price and store at a glance.
3. **Store identity is color.** Migros = orange (#e65100). Coop = green (#007a3d). These are the only brand colors. Everything else is neutral.
4. **No decoration.** No gradients, no illustrations, no hero images. Content IS the interface.
5. **Accessible by default.** WCAG AA contrast ratios. Minimum 16px body text. 44x44px touch targets.
6. **Swiss sensibility.** Clean typography, generous whitespace, structured grids. Think SBB app, not American grocery coupons.

---

## 2. Colors

### 2.1 Store Brand Colors

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `migros` | Migros Orange | `#e65100` | Store badges, backgrounds, buttons. 4.6:1 contrast on white (passes AA). |
| `migros-light` | Migros Light | `#FFF3E6` | Background tint for Migros comparison panels, Migros tags |
| `migros-text` | Migros Text | `#c54400` | Orange text on light backgrounds. 4.7:1 on `#FFF3E6`. |
| `coop` | Coop Green | `#007a3d` | Store badges, backgrounds, buttons. 5.3:1 contrast on white (passes AA). |
| `coop-light` | Coop Light | `#e6f4ec` | Background tint for Coop comparison panels, Coop tags |
| `coop-text` | Coop Text | `#006030` | Green text on light backgrounds. 5.0:1 on `#e6f4ec`. |

**Note on Coop's color:** Updated from the original red (#E10A0A) to green (#007a3d) in design-spec v2.0. Green is closer to Coop's actual brand identity and creates clear visual distinction from Migros orange (orange vs green instead of orange vs red).

### 2.2 Neutral Palette

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `bg` | Background | `#FAFAFA` | Page background |
| `surface` | Surface | `#FFFFFF` | Cards, panels, header |
| `text` | Text Primary | `#1A1A1A` | Body text, headings |
| `text-muted` | Text Muted | `#666666` | Secondary text, captions, labels |
| `border` | Border | `#E5E5E5` | Card borders, dividers, input borders |

### 2.3 Semantic Colors

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `accent` | Accent Blue | `#2563EB` | Primary CTA buttons, active states, focus rings, step indicators |
| `success` | Success Green | `#147a2d` | Savings callouts, "Either store" tags, completed steps. 5.8:1 on white. |
| `warning` | Warning Amber | `#b45309` | Stale data banners, lookup errors. 4.8:1 on white. |
| `error` | Error Red | `#dc2626` | Form validation errors, error messages. 4.5:1 on white. **Not shared with any store color.** |

### 2.4 Dark Mode

Not in MVP. Design for light mode only.

---

## 3. Typography

### 3.1 Font Family

System font stack (no external font load -- maximum performance):

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

### 3.2 Type Scale

| Level | CSS class | Size | Weight | Line Height | Usage |
|-------|-----------|------|--------|-------------|-------|
| Hero | `.hero-title` | 1.75rem (28px) | 800 (ExtraBold) | 1.2 | Home page hero heading |
| Page title | `.page-title` | 1.5rem (24px) | 700 (Bold) | 1.3 | Page headings (Comparison, Onboarding, About) |
| Section title | `.section-title` | 1.1rem (17.6px) | 600 (SemiBold) | 1.4 | Card headings, section labels |
| Body | (default) | 1rem (16px) | 400 (Regular) | 1.5 | Paragraph text, verdict text |
| Small | `.text-sm` | 0.875rem (14px) | 400 | 1.5 | Helper text, descriptions, deal details |
| Caption | (various) | 0.75rem (12px) | 600 (SemiBold) | 1.4 | Tags, store name labels, footer |
| Micro | `.compare-store-name` | 0.7rem (11.2px) | 600 | 1.3 | Uppercase store labels in comparison |

### 3.3 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Favorite item labels |
| SemiBold | 600 | Section titles, buttons, tags, store labels |
| Bold | 700 | Page titles, prices |
| ExtraBold | 800 | Hero title only |

---

## 4. Spacing & Layout

### 4.1 Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `2px` | 2px | Micro gaps (store name to price in compare card) |
| `4px` | 4px | Tag padding vertical, step bar height |
| `8px` | 8px | Gaps between inline elements, small margins |
| `10px` | 10px | Input/button padding vertical, favorite item vertical padding |
| `12px` | 12px | Card padding (compare cards), gap between cards, split header padding |
| `16px` | 16px | Card padding (standard), page side padding, standard vertical spacing |
| `20px` | 20px | Button horizontal padding, list indentation |
| `24px` | 24px | Large vertical spacing (hero CTA margin, section breaks, footer padding) |
| `32px` | 32px | Hero top/bottom padding |
| `48px` | 48px | Loading/empty state vertical padding |

### 4.2 Page Layout

| Property | Value |
|----------|-------|
| Max content width | 640px |
| Page horizontal padding | 16px |
| Page centering | `margin: 0 auto` |

### 4.3 Grid

| Context | Layout |
|---------|--------|
| Starter pack grid | 2 columns, 12px gap |
| Compare stores (within card) | 2 columns, 8px gap |
| General stacking | Single column, 12px gap between cards |

---

## 5. Design Tokens (CSS Custom Properties)

The current implementation uses CSS custom properties (not Tailwind config). These are the tokens:

```css
:root {
  --color-migros: #e65100;
  --color-migros-text: #c54400;
  --color-migros-light: #FFF3E6;
  --color-coop: #007a3d;
  --color-coop-text: #006030;
  --color-coop-light: #e6f4ec;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
  --color-border: #e5e5e5;
  --color-accent: #2563eb;
  --color-success: #147a2d;
  --color-warning: #b45309;
  --color-error: #dc2626;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --max-width: 640px;
}
```

### Tailwind Config (for future migration)

If the project migrates to Tailwind utility classes, the following config would apply:

```typescript
// tailwind.config.ts (partial)
export default {
  theme: {
    extend: {
      colors: {
        migros: {
          DEFAULT: '#e65100',
          light: '#FFF3E6',
          text: '#c54400',
        },
        coop: {
          DEFAULT: '#007a3d',
          light: '#e6f4ec',
          text: '#006030',
        },
        bg: '#FAFAFA',
        surface: '#FFFFFF',
        text: {
          DEFAULT: '#1A1A1A',
          muted: '#666666',
        },
        border: '#E5E5E5',
        accent: '#2563EB',
        success: '#147a2d',
        warning: '#b45309',
        error: '#dc2626',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.1)',
      },
      maxWidth: {
        content: '640px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
}
```

---

## 6. Component Specs

### 6.1 VerdictBanner

**Purpose:** Shows the weekly verdict -- which store wins each category. First meaningful content on the home page.

**Visual spec:**
- White card with border, 8px radius, subtle shadow
- Centered text layout
- Label: "WEEKLY VERDICT" in uppercase, 0.8rem, muted, letter-spaced
- Verdict text: 1rem, SemiBold, primary color
- Stale data warning: 0.75rem, warning amber, below verdict text
- 16px padding, 16px bottom margin

**States:**
- **Default:** Shows verdict summary text (e.g., "This week: Migros for Fresh, Coop for Household")
- **Tie:** "It's a tie this week!"
- **Stale data:** Shows amber warning text below verdict
- **Partial data:** Shows "Partial data -- one source is missing"
- **Null/no verdict:** Renders nothing (returns null)

**Mobile (375px):** Full width within 640px container. Above the fold if hero is compact.
**Desktop (768px+):** Same layout, constrained to 640px max-width.

### 6.2 TemplatePicker

**Purpose:** First onboarding step. User picks a starter pack ("How do you cook?").

**Visual spec:**
- Section title + helper text description
- 2-column grid of pack cards, 12px gap
- Each pack card: white bg, 2px border, 8px radius, 16px padding, centered text
- Selected state: blue accent border + light blue background (#EFF6FF)
- Pack label: 0.95rem, SemiBold
- Pack description: 0.75rem, muted
- Item count: 0.875rem, muted

**States:**
- **Loading:** Centered loading text
- **Error:** Red error message card
- **Empty:** "No starter packs available" message
- **Default:** Grid of selectable pack cards

**Touch target:** Each pack card is a full button, well above 44x44px minimum.

### 6.3 FavoritesEditor

**Purpose:** Second onboarding step. User customizes their favorites list (remove from template, add via search).

**Visual spec:**
- Flex header: "Your favorites" title + "+ Add item" outline button
- List of favorite items with bottom borders
- Each item: label (Medium weight) + keyword (0.8rem, muted) + remove button (x)
- Item count footer: 0.875rem, muted
- "Add item" expands ProductSearch in a card above the list

**States:**
- **Empty:** "No items yet. Add some favorites to compare deals."
- **With items:** Scrollable list with remove buttons
- **Adding:** ProductSearch component visible in a card

### 6.4 CompareCard

**Purpose:** Shows side-by-side deal comparison for a single favorite item.

**Visual spec:**
- White card, 1px border, 8px radius, 12px padding
- Header row: product label (bold) + keyword (muted) + recommendation tag (right-aligned)
- 2-column grid for store comparison (8px gap)
- Each store column: tinted background (Migros light / Coop light), 8px padding, 6px radius
- Store name: 0.7rem uppercase, SemiBold, letter-spaced
- Price: 1.1rem, Bold
- Discount: 0.75rem, SemiBold
- Product name: 0.875rem, muted
- "No deal" state: muted, italic

**Tags:**
- Migros: orange text on orange-light bg, pill shape (20px radius)
- Coop: coop-text color on coop-light bg
- Either: success green text on green-light bg (#E8F5E9)
- No deals: muted text on neutral bg (#F5F5F5)

### 6.5 SplitList

**Purpose:** Organizes CompareCards into shopping list sections (Buy at Migros / Buy at Coop / Either / No deals).

**Visual spec:**
- Each section has a header: colored dot (12px circle) + section label (SemiBold)
- Dot colors: Migros orange, Coop green, success green, muted grey
- CompareCards stack vertically with 8px gap

**States:**
- **Empty:** "Add some favorites to see your comparison."
- **Populated:** Sections shown only if they contain items (graceful hiding)

### 6.6 EmailCapture

**Purpose:** Third onboarding step. Optional email save for list retrieval.

**Visual spec:**
- Standard card container
- Section title + helper text
- Email input + "Save" primary button in flex row
- Error state: red text below input
- Skip note: muted helper text below

### 6.7 ProductSearch

**Purpose:** Search active deals to add items to favorites.

**Visual spec:**
- Search input + "Search" primary small button in flex row
- Results shown as a list (same layout as favorites list)
- Each result: product name + price/discount/store info + "Add" primary small button
- "No results" state with "Add anyway" outline button for custom keywords

### 6.8 Page Layout (Layout.tsx)

**Purpose:** Shared shell for all pages -- header, main content, footer.

**Visual spec:**
- Header: sticky top, white bg, bottom border, 12px vertical / 16px horizontal padding
  - Left: "basketch" logo text (1.25rem, Bold, link to home)
  - Right: nav links ("My List", "About") in 0.875rem, muted, 16px gap
- Main: flex-grow, 640px max-width, 16px padding, auto margins
- Footer: centered, 0.75rem, muted, 24px padding -- "basketch -- Migros vs Coop, side by side"

### 6.9 HomePage

**Purpose:** Landing page for new and returning users.

**Visual spec:**
- Hero section: centered, 32px vertical padding
  - Title: 1.75rem ExtraBold, line-height 1.2
  - Subtitle: 1rem muted, 8px top margin
  - CTA: full-width primary button, 24px top margin
- Verdict banner below hero
- "Already have a list?" card with email lookup form

### 6.10 OnboardingPage

**Purpose:** 3-step wizard: Pick template -> Edit favorites -> Save email.

**Visual spec:**
- Page title + contextual subtitle (changes per step)
- Step progress bar: 3 segments, 4px height, 2px radius
  - Inactive: border color
  - Active: accent blue
  - Done: success green
- Step content renders below

### 6.11 ComparisonPage

**Purpose:** The payoff. Shows the split shopping list for a user's favorites.

**Visual spec:**
- Page title: "Your deals this week"
- Subtitle: item count + Migros/Coop breakdown
- SplitList component
- "Edit my list" link at bottom (centered, outline small button)

### 6.12 AboutPage

**Purpose:** How it works, data sources, privacy, attribution.

**Visual spec:**
- Stacked cards with 16px gap
- Each card: section title + content
- Ordered list for "how it works", unordered list for data sources

---

## 7. Mobile Wireframes (Text-Based)

### 7.1 Home Page (375px)

```
+---------------------------+
| basketch     My List About| <- Sticky header
+---------------------------+
|                           |
|     Your groceries.       |
|     Two stores.           |
|     One smart list.       |
|                           |
|   See which of your       |
|   regular items are on    |
|   sale this week...       |
|                           |
| [Build my shopping list]  | <- Full-width primary CTA
|                           |
+---------------------------+
| WEEKLY VERDICT            |
| This week: Migros for     |
| Fresh, Coop for Household |
+---------------------------+
|                           |
| Already have a list?      |
| Enter the email you       |
| saved it with.            |
|                           |
| [your@email.com] [Find]   |
|                           |
+---------------------------+
| basketch -- Migros vs     |
| Coop, side by side        |
+---------------------------+
```

### 7.2 Onboarding - Step 1: Template Picker (375px)

```
+---------------------------+
| basketch     My List About|
+---------------------------+
| Set up your list          |
| Choose a template to get  |
| started fast.             |
|                           |
| [===][    ][    ]         | <- Step 1 of 3
|                           |
| Pick a starter pack       |
| Choose a template that    |
| matches your shopping...  |
|                           |
| +----------+----------+  |
| | Swiss    | Indian   |  |
| | Basics   | Kitchen  |  |
| | 15 items | 18 items |  |
| +----------+----------+  |
| +----------+----------+  |
| | Mediter. | General  |  |
| | 12 items | 20 items |  |
| +----------+----------+  |
|                           |
| [Start from scratch]      |
+---------------------------+
```

### 7.3 Comparison Page (375px)

```
+---------------------------+
| basketch     My List About|
+---------------------------+
| Your deals this week      |
| 15 items | 4 at Migros    |
| | 3 at Coop               |
|                           |
| * Buy at Migros (4)       | <- Orange dot
+---------------------------+
| Milk          [Migros]    |
| +----------+----------+  |
| | MIGROS   | COOP     |  |
| | CHF 1.50 | CHF 1.80 |  |
| | -25%     | -15%     |  |
| +----------+----------+  |
+---------------------------+
| Butter        [Migros]    |
| +----------+----------+  |
| | MIGROS   | COOP     |  |
| | CHF 2.10 | No deal  |  |
| | -30%     |          |  |
| +----------+----------+  |
+---------------------------+
|                           |
| * Buy at Coop (3)         | <- Green dot
+---------------------------+
| Cheese        [Coop]      |
| ...                       |
+---------------------------+
|                           |
|      [Edit my list]       |
|                           |
+---------------------------+
```

---

## 8. Responsive Breakpoints

| Breakpoint | Width | Behaviour |
|-----------|-------|-----------|
| Mobile (default) | < 640px | Single column. 16px padding. Content fills width. |
| Content max | 640px | Content area caps at 640px with auto margins. No layout change -- just centering. |

**Note:** The current implementation uses a single breakpoint approach. All content is constrained to 640px max-width. There is no tablet or desktop-specific layout. This is appropriate for the MVP -- the tool is used for 30 seconds on a phone. A wider layout adds complexity without value.

---

## 9. Accessibility Requirements

### 9.1 Contrast Ratios (WCAG AA = 4.5:1 minimum for normal text)

| Combination | Foreground | Background | Ratio | Status |
|-------------|-----------|------------|-------|--------|
| Primary text on page bg | #1A1A1A | #FAFAFA | ~16:1 | Pass |
| Primary text on surface | #1A1A1A | #FFFFFF | ~17.5:1 | Pass |
| Muted text on surface | #666666 | #FFFFFF | ~5.7:1 | Pass |
| Muted text on page bg | #666666 | #FAFAFA | ~5.4:1 | Pass |
| Migros tag text on light bg | #c54400 | #FFF3E6 | ~4.7:1 | Pass |
| Coop tag text on light bg | #006030 | #e6f4ec | ~5.0:1 | Pass |
| White on accent blue | #FFFFFF | #2563EB | ~4.6:1 | Pass |
| White on Migros orange | #FFFFFF | #e65100 | ~4.6:1 | Pass |
| White on Coop green | #FFFFFF | #007a3d | ~5.3:1 | Pass |
| Warning text on surface | #b45309 | #FFFFFF | ~4.8:1 | Pass |

### 9.2 Touch Targets

- Minimum: 44x44px (Apple HIG / WCAG 2.5.5)
- All buttons, inputs, links, and pills enforce `min-height: 44px` (updated in design-spec v2.1).
- Pack cards: Large tap targets (full card). **Pass.**
- Input fields: enforce `min-height: 44px`. **Pass.**

### 9.3 Other Requirements

- All interactive elements must be keyboard accessible (links, buttons, inputs)
- Remove buttons must have `aria-label` (currently implemented on fav-remove)
- Focus states must be visible (currently: input focus ring implemented)
- No reliance on color alone to convey information (tags have text labels -- pass)

---

## 10. Design References

### Swiss Utility Apps (What to Borrow)

| App | What to borrow | What to avoid |
|-----|---------------|---------------|
| **SBB Mobile** | Clean information hierarchy. Content-first. No decoration. Functional color use (red for SBB brand, otherwise neutral). | Their desktop version is more complex than basketch needs. |
| **Twint** | Single-purpose clarity. Opens, does one thing, closes. System font stack. | Rounded UI elements and illustrations are too playful for a comparison tool. |
| **comparis.ch** | Comparison table layout. Side-by-side store presentation. Structured data display. | Their UI is information-dense and cluttered for mobile. basketch should be simpler. |
| **tutti.ch** | Card-based listings. Clean mobile layout. Minimal header. | Their category navigation is more complex than basketch needs. |

### What basketch Should NOT Look Like

- American coupon/deal sites (Groupon, Slickdeals): cluttered, noisy, aggressive CTAs
- Full-featured grocery apps (Rappn, Profital): too many features, app install required
- Price comparison sites with 50+ columns: information overload

### Design Lineage

basketch's visual identity sits between:
- **SBB app** (functional Swiss utility) -- our north star for restraint
- **comparis.ch** (Swiss comparison site) -- our north star for data presentation
- **Apple Notes** (minimal, system-font, content-first) -- our north star for simplicity
