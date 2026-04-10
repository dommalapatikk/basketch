# UX Review — basketch (April 2026)

Combined findings from Product Designer and UX Researcher reviews.

## Fixes Implemented

### From Designer Review

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | No confirmation when email saved | Added success banner ("List saved!") with 1.5s delay before redirect |
| 2 | Product images too small (80px) | Increased to 120px |
| 3 | "Skip" button language unclear | Changed to "Build my own list" and "Continue without saving" |
| 4 | No feedback on add/remove favorites | Added loading state on remove button (disables + shows "...") |
| 5 | No savings summary | Added CHF totals per store at top of comparison page |

### From UX Researcher Review

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | No direct URL sharing (retention killer) | Added "Save this list" section with Copy + Share buttons on comparison page |
| 2 | Homepage value prop too generic | Changed to "Smart grocery shopping for Swiss shoppers" + "Save CHF 20-40/month" |
| 3 | Email capture lacks confirmation | Added success state before redirect |
| 4 | Comparison cards hard to scan | Added savings summary cards (Migros total / Coop total) above the split list |
| 5 | Template picker has no guidance | Added "Recommended" badge on first pack + sample item preview |

### Additional Fixes

- Loading spinner added (CSS animation)
- Pack grid switches to single column on small phones (<400px)
- Empty state copy improved: "Add your first product to see this week's best deals"
- "No results" search copy clarified: "No current deals found... You can still add it to track future deals"
- Logo made bigger (36px)

## What's Working Well (Keep)

- Clean, minimal CSS design system
- Progressive disclosure (3-step onboarding)
- Smart defaults + flexibility (templates OR custom)
- Migros orange / Coop green color coding
- Keyboard navigation + accessibility attributes

## Deferred to Phase 2

- Email confirmation with verification link
- Weekly email reminders with deal summary
- Compact checklist mode (one-line per item)
- Print-friendly shopping list
- Language localization (German UI)
