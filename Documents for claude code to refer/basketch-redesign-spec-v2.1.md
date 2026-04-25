# basketch — Redesign Spec **v2.1** (amendments to v2)

**This document amends v2.** v2 is at `Claude Cowork output/basketch-redesign-spec-v2.md`. Read that first.

v2.1 captures the team review (Tech Lead, VP Engineering, in-house Designer) and the user's resolution of the open decisions on **2026-04-25**. If anything in v2.1 contradicts v2, **v2.1 wins**.

---

## A. User decisions (2026-04-25)

| # | Decision | Resolution |
|---|---|---|
| 1 | Install Playwright + browsers in CI | **Yes.** Required for AC5, AC8, AC11, AC12. |
| 2 | Add CI jobs for `web-next/` (lint, typecheck, test, build, Playwright, Lighthouse, axe) | **Yes.** Today's CI only tests the legacy `web/` app. |
| 3 | HR1 store color: pure 6 px dot only, no compromise | **Yes — pure dot.** No `font-semibold` store name compensation; trust the dot. |
| 4 | Hero copy on landing | **Three sentences (external designer's wording) — keep as-is.** |
| 5 | Focus ring contrast | **Option B — darken `--color-focus` to `#5A6FE8` (4.6:1).** Dark-mode `#6E86FF` stays. |

---

## B. Stack labelling fix

v2 §7 and §6.99 say "Next.js 15". The shipped app is on **Next.js 16.2.4** (App Router, Cache Components, async `params`, `proxy.ts` not `middleware.ts`). All v2 patches work on 16 — no API-level changes needed. Treat v2's "Next.js 15" as a labelling error and use 16 patterns:

- `proxy.ts` (not `middleware.ts`)
- async `params` / `searchParams` everywhere
- Cache Components: no `new Date()` in cached server scope; use static date or hoist to a client island (already the M3 fix)
- `generateMetadata` per route (Patch 9)
- `not-found.tsx` (no leading `_`) — already exists at `src/app/[locale]/not-found.tsx`

---

## C. Scope corrections

### C.1 About page (Patch 4) — DE + EN only

v2 §5.5 implies all 4 locales (DE, EN, FR, IT). Reality: only DE + EN message bundles ship today (FR + IT are deferred per ADR §13). **Build About in DE + EN only.** Do not add empty `fr.json`/`it.json` keys.

### C.2 Patch 5 (404) — diagnose first

v2 §11 Patch 5 reads as "implement `_not-found.tsx`". Reality: `src/app/[locale]/not-found.tsx` already exists with localized copy. The bug B4 (`/en/asdf` shows DE) is a routing fallthrough — `proxy.ts` matcher likely sends unknown segments to the root-level `src/app/not-found.tsx` (DE-only) instead of into the `[locale]` segment.

**Re-scope Patch 5 to:** diagnose the proxy matcher and routing, then fix so unknown URLs under `/{locale}/...` resolve to the locale's `not-found.tsx`.

---

## D. Token + design additions (in-house Designer findings)

### D.1 Add missing tokens to `globals.css`

v2 §3.1 declares these but they are **not** in `web-next/src/app/globals.css`:

```
--color-positive-bg: #E5F4ED   /* light */
--color-positive-bg: #1A2B22   /* dark */
```

Without these, the PositiveTag (Patch 7) renders on `transparent`. Add to both light and dark `:root` blocks of `globals.css` and to the `@theme` block.

### D.2 Darken focus token (Decision 5)

In `globals.css` light scope:
```diff
- --color-focus: #94A5FF
+ --color-focus: #5A6FE8
```
Dark scope `--color-focus: #6E86FF` is unchanged.

### D.3 Icon mapping additions (extend v2 §3.6)

These categories are present in the data feed but missing from v2's icon table — they would fall through to the `Package` fallback. Add:

| Sub-category | Lucide icon |
|---|---|
| `Dairy` (Milchprodukte) | `Milk` |
| `Bakery` (Backwaren) | `Croissant` |
| `Eggs` (Eier) | `Egg` |
| `Pet food` (Tiernahrung) | `PawPrint` |
| `Baby` | `Baby` |
| `Condiments` / `Sauces` | `Soup` (already declared in HR5; map it explicitly here) |
| `Cereals` (Müesli/Frühstück) | `Wheat` (shared with Pasta & rice — note dual use) |

All at 20 px, `ink-3`.

### D.4 Touch target on compact card `+` button

v2 §6.1 compact spec implies `min-h-[44px]` on the row but the `+` button itself is 20 px. Add explicit:
```
min-w-11 min-h-11   /* 44 CSS px each */
```
on the `+ List` button in compact rows. Same on the `×` button in list-drawer rows.

### D.5 HR7 chip ordering

v2 HR7 says "render every distinct sub-category" but doesn't specify order. Pin it:
- **Stores:** fixed order `Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg`
- **Sub-categories:** sorted by deal-count **descending**, then alphabetical on ties
- Disabled chips (count = 0) sort to the bottom of their group

---

## E. Cross-cutting items the spec missed (Tech Lead + VP Eng)

### E.1 Cache invalidation after every patch

After any patch that affects rendered output (1, 3, 6, 7, 8, 9), call:
```ts
fetch(`${WEB_REVALIDATE_URL}?tag=deals`, {
  headers: { Authorization: `Bearer ${WEB_REVALIDATE_SECRET}` }
})
```
Or trigger via the existing `/api/revalidate` webhook. Without this, ISR serves the stale snapshot for up to 1 hour after deploy.

### E.2 Pre-existing filter regression (Patch 8 add-on)

`web-next/src/server/data/filter-deals.ts` line ~58 (`subCategoryCounts`) currently filters sub-categories by the active store selection. This violates HR7. **Patch 8 must also fix:** show every sub-category present in the unfiltered snapshot, with counts that respect the store filter (so chips dim to 0 rather than disappear).

### E.3 OG card cache after visual chrome change

After Patches 1, 6, 7 (chrome / icons / chips), the `/card` PNG endpoint will still render the old layout from cache. Add `revalidate = 0` or call `revalidateTag('card')` from the same webhook to force regeneration on next request.

### E.4 Test additions per patch

Each patch must add or update at least one Vitest test:
- Patch 1: assert `DealCard` has no descendant matching `[style*="background"][style*="--store-"]` of width < 8 px
- Patch 3: render at 360 px container, assert text + price block bounding rects don't intersect (Playwright per AC5)
- Patch 6: assert `h2 > svg` count equals section count (Playwright per AC8)
- Patch 7: assert at most one `bg-positive-bg` per card (Vitest, jsdom OK — class selector)
- Patch 8: assert all stores render in fixed order regardless of filter state (Vitest)

---

## F. Sequencing (Tech Lead recommendation)

```
Patch 5  (404 routing diagnosis)              ← FIRST, may unblock 4 + 9
   ↓
Patch 1, 2, 3, 4  (parallel — no shared files)
   ↓
Patch 6, 7, 8  (parallel — no shared files)
   ↓
Patch 9  (titles — needs all routes to exist)
   ↓
Patch 10  (QA pass: Playwright suite, Lighthouse, axe, keyboard)
   ↓
revalidateTag('deals') + revalidateTag('card')  →  push to redesign  →  verify deploy
```

**Realistic effort: 8–9 working days** (vs v2's 6) once Playwright + CI infra is included.

---

## G. CI additions (parallel with patches)

Add to `.github/workflows/ci.yml`:

1. `lint-and-typecheck-web-next` — `cd web-next && npx tsc --noEmit && biome check .`
2. `test-web-next` — `cd web-next && npx vitest run`
3. `build-web-next` — `cd web-next && npm run build`
4. `playwright-web-next` — install Chromium + run E2E suite against `next start`
5. (Optional, post-deploy) Lighthouse CI against the Vercel preview URL via `treosh/lighthouse-ci-action` — gate on perf/a11y/SEO/best-practices ≥ 0.90

Branch protection on `main` should require all 5 to pass.

---

## H. Acceptance criteria additions (extend v2 §10)

- [ ] **AC13.** `globals.css` declares all 8 new tokens (positive, positive-bg, focus, signal, etc.) in both light and dark `:root` blocks.
- [ ] **AC14.** Sub-category list on `/deals` is identical regardless of selected stores (only counts change). Verified by a Vitest test.
- [ ] **AC15.** `revalidateTag('deals')` and `revalidateTag('card')` are called as part of the deploy script (or wired to a post-deploy step). Verified by a CI step that greps for the call.
- [ ] **AC16.** All five new CI jobs run on every PR and block merge on failure. Verified by reading `.github/workflows/ci.yml`.

---

## I. Open items deferred (not blocking this sprint)

- FR + IT message bundles
- CommandMenu ⌘K, undo snackbar, region picker, virtualization (v2 §1 says "out of scope" — confirmed)
- Real PWA PNG icons (192 + 512) — current SVG works
- Sentry + PostHog DSNs — observability shim stays no-op until accounts exist

---

*End of v2.1. Hand v2 + v2.1 to Claude Code with the directive: "Apply patches §11 of v2 in the order from §F of v2.1. v2.1 amendments override v2 wherever they conflict. Do not advance past a patch until its acceptance criterion in v2 §10 (extended by §H of v2.1) is green."*
