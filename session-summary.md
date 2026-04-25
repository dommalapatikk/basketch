# basketch — session summary

**Date range:** 2026-04-24 → 2026-04-25
**Outcome:** Full redesign (M0–M8) built and shipped, then v2.1 corrective patches applied based on external designer's audit. All 13 patch tasks complete; live at basketch.vercel.app (renamed from basketch-redesign.vercel.app on 2026-04-25 after legacy Vite app was retired).

---

## Live state (after v2.1)

| | |
|---|---|
| 🌐 Live site | https://basketch.vercel.app |
| 🌐 Old Vite app | RETIRED 2026-04-25 — archived to `archive/web-vite/`, Vercel project deleted |
| 🔀 PR | https://github.com/dommalapatikk/com/dommalapatikk/basketch/pull/1 |
| 🌿 Branch | `redesign` (4 commits ahead of `main`) |
| 🏗️ Vercel project | `dommalapatikks-projects/basketch-redesign` |
| 🐙 Latest prod deploy | `dpl_3ohTqzzrS2TfJv5jvdXGuusuoY6e` (m5n3bk0dq) — promoted via `vercel deploy --prebuilt --prod` |
| 📄 Latest commit | `d90694b` — v2.1 redesign — apply external designer's corrective spec (B1–B10) |

---

## What's new in v2.1 (this session, 2026-04-25)

External designer audited the live v1 build, filed 10 defects (B1–B10) with 8 hard rules and 12 acceptance criteria. We ran a 3-agent team review (Tech Lead, VP Engineering, in-house Designer), the user resolved 5 open decisions, then 10 patches shipped in one push.

**v2.1 spec lives at:** `Documents for claude code to refer/basketch-redesign-spec-v2.1.md` (amends `Claude Cowork output/basketch-redesign-spec-v2.md`).

### Patches applied

| # | Defect | Fix |
|---|---|---|
| Patch 1 | B1 — store-color rail on every card | Removed rail span + `pl-3` from DealCard; brand color confined to 6px dot inside StorePill (HR1) |
| Patch 2 | B2 — wordmark missing basket icon | Added `ShoppingBasket` glyph to Header, all viewports (HR2) |
| Patch 3 | B5 — mobile card text overlap | Rewrote DealCard as strict CSS grid `[120px_minmax(0,1fr)]` mobile, `[192px_minmax(0,1fr)]` desktop. PriceBlock uses `flex-wrap` so savings drops below price on narrow rows (HR4/HR8) |
| Patch 4 | B3 — `/about` is 404 | Built `[locale]/about/page.tsx` with 5 sections (How it works, Data sources, What we compare, Privacy, Contact). DE + EN message bundles |
| Patch 5 | B4 — `/en/asdf` shows German | Added `[locale]/[...rest]/page.tsx` catch-all calling `notFound()`. Without this, Next 16 routes unmatched URLs to the root `app/not-found.tsx` (locale-agnostic). See `node_modules/next/dist/docs/01-app/.../not-found.md` line 131 |
| Patch 6 | B8 — section headings have no icons | Built `IconHeading` component, mapped 25+ sub-categories to Lucide icons (incl. v2.1 §D.3 additions: Dairy/Bakery/Eggs/Pet/Baby) |
| Patch 7 | B7 — duplicate "Cheapest" indicator | Replaced savings `<Tag>` with plain `text-positive` text in PriceBlock (HR6). Tag tone="positive" now uses `bg-positive-bg` (the explicit token, not color-mix) |
| Patch 8 | B6 + filter regression | Fixed `subCategoryCounts` to NOT hide chips when stores filter changes (HR7). Added `STORE_DISPLAY_ORDER`. Mobile FilterSheet sub-cat list scrolls internally with fade mask. Added 6 new vitest tests |
| Patch 9 | B9 — page title shows URL | Added `generateMetadata` to `/deals` (per-locale title + description) and `/list` (with `robots: noindex`) |
| Patch 10 | acceptance gates | Installed Playwright + @axe-core/playwright. Wrote `e2e/v2-acceptance.spec.ts` covering AC1, AC2, AC3, AC4, AC5, AC7, AC8, AC9, AC11, AC12. Two projects: desktop 1440×900, mobile iPhone 13 |

### Token + design changes (v2.1 §D)

- `globals.css`: added `--color-positive-bg` (light `#E5F4ED` / dark `#1A2B22`) to both root scopes + `@theme` block
- `globals.css`: darkened `--color-focus` light-mode value from `#94A5FF` (2.6:1, fails WCAG) to `#5A6FE8` (4.6:1, passes). Dark-mode `#6E86FF` unchanged
- All HR1 enforcement: store color appears only inside the 6px dot

### CI changes

`.github/workflows/ci.yml` extended with 5 new jobs for `web-next/`:
1. `lint-and-typecheck-web-next`
2. `test-web-next` (vitest)
3. `build-web-next`
4. `e2e-web-next` (Playwright + axe, uploads report on failure)

The `redesign` branch is now in CI's `push` trigger.

---

## Key user decisions made this session

1. Install Playwright + browsers in CI (Y)
2. Add CI jobs for web-next (Y)
3. HR1 store color: pure 6px dot — no compromise (external designer's call)
4. Hero copy: keep three sentences (external designer's call)
5. Focus token: darken to `#5A6FE8` per external designer's Option B (passes WCAG 2.2 AA)

---

## ⚠️ Known issue uncovered this session — REQUIRES MANUAL FIX

**Vercel project `basketch-redesign` is misconfigured:** Root Directory is set to `.` (repo root), not `web-next/`. So git auto-deploy reads the repo-root `vercel.json` and builds the OLD `web/` Vite app, NOT the new `web-next/` Next.js app.

**Why this hasn't been fatal yet:** I worked around it by deploying via `vercel build --prod && vercel deploy --prebuilt --prod` from `web-next/`. The current production at basketch.vercel.app is the correct v2.1 Next.js build.

**Fix needed (5 min, web dashboard):**
1. Open https://vercel.com/dommalapatikks-projects/basketch-redesign/settings
2. General → Root Directory → change `.` to `web-next`
3. Save → next git push to redesign will build the correct folder

Until this is fixed, future `git push origin redesign` will deploy the wrong build. Always use `vercel build --prod && vercel deploy --prebuilt --prod` from `web-next/` to deploy the right code.

---

## Verification (live at basketch.vercel.app)

Curl-tested 2026-04-25 15:51 CET:
- ✅ `/` → 200, `<title>basketch — Schweizer Wochenangebote im Vergleich</title>`, served from Next.js (`_next/static`)
- ✅ `/en/about` → 200, `<h1>About basketch</h1>` (Patch 4)
- ✅ `/en/asdf` → 404, EN copy (Patch 5)
- ✅ `/de/asdf` → 307 → `/asdf` → 404, DE copy (correct next-intl `as-needed` behavior)
- ✅ Header has `aria-label="basketch — home"` + `<svg>` glyph (Patch 2)
- ✅ Header is sticky with backdrop-blur

Not verified by curl (need browser):
- AC5 (no overlap on mobile) — Playwright suite covers this
- AC8 (icons in headings) — Playwright suite covers this
- AC10 (Lighthouse ≥ 90) — needs CI run
- AC11 (axe 0 violations) — Playwright suite covers this

The Playwright suite is wired into CI and will run on the next push once the Vercel root-directory issue is fixed.

---

## What still needs human hands (post-launch)

These were already documented in `docs/adr-M0-decisions.md` §15 — refresh:

- **Fix Vercel Root Directory** (NEW, see ⚠️ above) — 5 min web dashboard fix
- **Open the live URL on a real phone** — vaul drawer drag-to-close, snap-rail swipe gestures, hit-target touch (only true mobile QA possible on a device)
- **Cutover decision:** swap `basketch.vercel.app` (or a custom domain) to point at `basketch-redesign` project → archive the old `web/` project
- **Sentry + PostHog DSNs:** create accounts, paste DSNs into Vercel env, replace stub bodies in `web-next/src/lib/observability.ts`
- **Real PWA icons** (192×192 + 512×512 PNGs in `/public/`) — current SVG works for most installers
- **FR / IT translations:** drop `fr.json` + `it.json` into `web-next/src/messages/` and add to `routing.ts`
- **CommandMenu ⌘K, undo snackbar, region picker, virtualization** — spec polish items; not blocking
- **Vercel CLI upgrade**: 50.43.0 → 52.0.0 — `npm i -g vercel@latest`

---

## How to resume

When you say "pick up basketch":

1. Read this file
2. Read `docs/adr-M0-decisions.md` (especially §13 carry-over and §15 follow-ups)
3. Read `Documents for claude code to refer/basketch-redesign-spec-v2.1.md` (the corrective spec)
4. Read `web-next/AGENTS.md` (warns this is Next.js 16, not the version Claude knew)
5. Check Vercel Root Directory has been fixed before any new push to redesign
6. Hit `vercel ls --cwd web-next` to see deployment state

Folder map:
- `web-next/` — Next.js 16 app, **LIVE at basketch.vercel.app**
- `archive/web-vite/` — RETIRED legacy Vite app (was at the old basketch.vercel.app project, deleted 2026-04-25)
- `pipeline/` — TS+Python data pipeline, runs on GH Actions cron Mon/Tue/Thu
- `docs/` — PRD, architecture, redesign ADR
- `Documents for claude code to refer/` — design specs (basketch-redesign-spec.md = v1; basketch-redesign-spec-v2.1.md = v2 amendments)
- `Claude Cowork output/` — externally-authored specs (basketch-redesign-spec-v2.md = the audit)
- `shared/` — shared TypeScript types
