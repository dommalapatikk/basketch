# QA Report — Remove "Worth a look this week" (Surface 3)

**Date:** 2026-09-25
**Tested by:** QA Tester Agent
**Branch:** `worktree-agent-a20642a16603d7f26`
**Worktree:** `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/agent-a20642a16603d7f26`
**Commit tested:** `5c8e49a` (on top of `760a8b4`), reviewed/approved by Code Reviewer
**Spec:** `docs/design/2026-09-25-remove-worth-a-look.md`
**Method:** Built and ran `web-next` locally from the worktree (`next build` + `next start -p 3000`) against the real live Supabase database (copied `.env.local` from the main checkout into the worktree's `web-next/`, deleted after testing). Verified with `curl`, and with Playwright (Chromium, already installed in `~/Library/Caches/ms-playwright`) for real-browser rendering, console-error capture, and screenshots.

**Overall verdict: PASS.** The removal is clean, complete, and matches the spec and acceptance criteria. One issue was found (generic "500 Something went wrong" client-side error UI on any 404 route) — confirmed **pre-existing on live production** and **already tracked/known** in the codebase (explicitly `.skip`'d in `e2e/v2-acceptance.spec.ts` AC4 with a comment describing the same defect), so it is **not a regression from this change** and does not block release.

---

## Setup verification

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` (folder-local binary) | PASS — 0 errors |
| `next build` | PASS — succeeds; route table shows no `/settings/hidden` entry |
| `npm test` (vitest) | PASS — 341/341 tests, 32 files (matches commit message: 340 after WP-11, +1 restored test in 5c8e49a) |
| `playwright test` (existing `e2e/v2-acceptance.spec.ts`, desktop + mobile projects) | PASS — 48 passed, 14 skipped (pre-existing skips, e.g. AC4/AC8/AC16 — not related to this change), 0 failed |

---

## Checks from the task brief

### 1. `/de` and `/en` homepages — section gone, no gap/broken heading, still leads to deals/list, methodology intact

**PASS.**
- `curl http://localhost:3000/en` and `http://localhost:3000/` (de, default locale) both return 200.
- Grepped both HTML payloads for `worth a look`, `worth picking up`, `hidden suggestion`, `restore any` (case-insensitive): **zero matches** in either locale.
- `grep -o 'settings/hidden'` on both homepages: **zero matches** — no dangling link.
- `MethodologyStrip` ("So funktioniert es" / "How it works", `id="how-it-works"`) present and intact on both locales, 3 steps unchanged, no Hidden-Suggestions link (confirmed by reading `MethodologyStrip.tsx` — no `tHidden`, no `Link` import, no `/settings/hidden` reference).
- Nav to deals present: header "Deals"/"Aktionen" link and primary CTA "Alle Aktionen ansehen" / "Browse all deals" both point to `/en/deals` / `/deals`.
- Visual check via Playwright screenshot at 375px (German homepage, saved to `web-next/test-results/qa-screenshots/home-de-375.png`, gitignored): StaleBanner → Hero → 3 CategoryVerdictCards → ShareVerdictButton (WhatsApp/E-Mail/Kopieren) → "So funktioniert es" strip → footer. No visible gap, no orphaned heading, spacing looks intentional (matches spec's "MethodologyStrip already carries its own `mt-20`" prediction).
- Also confirmed via reading `page.tsx`: no import of `worth-picking-up` or `WorthPickingUpClient`, no `wpu` variable, no conditional render block — matches Removal list items in the spec exactly (page.tsx:6, 13, 25-27, 57-61 all gone).

### 2. `/de/settings/hidden` and `/en/settings/hidden` → 404, not a crash

**PASS on HTTP status; pre-existing cosmetic issue on client render (see Findings).**
- `curl -sI`: `/en/settings/hidden` → `404` directly. `/de/settings/hidden` → `307` to `/settings/hidden` (expected next-intl "as-needed" prefix behavior for the default locale, identical to how `/de/deals`, `/de/about`, and even a made-up `/de/nonexistent-page-xyz` all redirect) → final `404`.
- Playwright real-browser navigation confirms `response.status() === 404` for `/en/settings/hidden`, `/de/settings/hidden`, and `/settings/hidden`.
- Server-side rendered payload (inspected the RSC stream) contains the correct localized not-found content ("Page not found" / "Seite nicht gefunden", "Browse deals"/"Back to home" buttons) — the *data* sent to the browser is correct.
- **However**, on actual hydration in a real browser, the page visibly renders the app's generic error boundary ("500 / Something went wrong / We've logged the error. Try again in a moment.") instead of the styled not-found page, with a console error `Error: Connection closed.` from a Next.js runtime chunk. See Findings below — this is **not specific to `/settings/hidden`** and **not introduced by this change**.
- No directory `web-next/src/app/[locale]/settings/hidden/` exists in the worktree (confirmed via `find`).

### 3. Navigation — header, deals, list, about all work; no console errors

**PASS.**
- `/en/deals` (200), `/en/list` (200, empty-list state — "Your 0 items split best across 0 stores" — expected client-only state, no data seeded), `/en/about` (200, h1 "About basketch"), `/en/card` (200, OG share-card route) all load.
- Playwright console/pageerror capture across `/de`, `/en`, `/en/deals`, `/de/deals`, `/en/about`, `/en/list`, `/en/card`: **0 console errors, 0 page errors** on all 7 routes.
- Header nav links (`/en`, `/en/deals`, `/en/about`) and hero CTA all resolve to real, working routes.

### 4. Regressions vs. live production (basketch.vercel.app)

**PASS — no unexpected regressions.**
- Live `/de` (redirects to `/`) and `/de/deals` (redirects to `/deals`) both 200, both structurally comparable (same `id="how-it-works"` methodology section, same header/nav).
- Important finding during comparison: **live production currently still has the WPU feature** — `/settings/hidden` on production returns HTTP 200 with a working "Ausgeblendete Vorschläge" (Hidden Suggestions) page, because this branch has not yet been deployed. The homepage itself shows no WPU text on either environment right now, consistent with the spec's documented N=0 "calm-by-absence" gate (no candidates to show this week) — so the *visible* homepage looks identical between worktree and prod today, but the worktree correctly removes the underlying `/settings/hidden` route and all WPU code paths, while prod's route still exists (just currently empty). This is the expected, intended difference for this change and confirms the removal actually changes behavior rather than being a no-op.
- No other structural differences observed (nav, hero copy pattern, category cards, footer disclaimer all match in shape).

### 5. Repo-wide import check (AC5 in spec)

**PASS.**
- `grep -rn "WorthPickingUp\|worth-picking-up\|HiddenSuggestions\|worth_picking_up\|hidden_suggestions" web-next/src`: the only hits are in `src/app/[locale]/page.test.tsx`, and they are **prose/comments and test assertions belonging to the regression test added in 5c8e49a** (e.g. `expect(queriedTables).not.toContain('worth_picking_up_candidates')`), not imports of the deleted modules. No production code imports remain.
- Locale files (`en.json`, `de.json`) confirmed to have zero `worth_picking_up` / `hidden_suggestions` keys.

### 6. e2e suite (`web-next/e2e/v2-acceptance.spec.ts`, documented via `npm run e2e` / `playwright test` in `package.json`)

**PASS.** 48 passed / 14 skipped / 0 failed across desktop (1440x900) and mobile (iPhone 13, 390x844) projects. Skips are pre-existing (`test.describe.skip('AC4 — localized 404', ...)` and viewport-conditional AC8/AC16 cases), unrelated to this change — confirmed by reading the skip's inline comment, which predates this branch and describes the same not-found defect noted below.

---

## Findings

### Major (pre-existing, not a regression — informational only)
**Generic 404 routes render the app's error boundary ("500 Something went wrong") instead of the styled not-found page, despite a correct HTTP 404 status.**
- Evidence: Playwright navigation (real Chromium) to `/en/settings/hidden`, `/de/settings/hidden`, `/settings/hidden`, and unrelated made-up routes `/en/asdf`, `/de/asdf`, `/en/nonexistent-abc`, `/en/deals/nonexistent` **all** show body text `"500 / Something went wrong / We've logged the error. Try again in a moment."` in the browser, with console error `Error: Connection closed.` from a Next.js internal chunk, even though `response.status()` is `404` for all of them and the SSR payload contains the correct localized not-found copy.
- **Confirmed pre-existing and not introduced by this branch:** the exact same behavior reproduces on **live production** (`https://basketch.vercel.app/en/asdf-nonexistent-xyz` → status 404, body renders "500 Something went wrong").
- **Already tracked internally:** `web-next/e2e/v2-acceptance.spec.ts` has `test.describe.skip('AC4 — localized 404', ...)` with an inline comment: *"catch-all (Patch 5 from v2.1 didn't actually work). Needs proper Next.js 16 + next-intl debug — likely either: (a) restructure root not-found to be locale-detecting, or (b) wrap [locale]/[...rest] differently."*
- **Verdict:** No new bug from this PR. The removal correctly returns 404 for `/settings/hidden`, which is the same (imperfect but known) 404 experience every other missing route on the site already has. Flagging only so it isn't mistaken for something this change caused; recommend Tech Lead re-open the AC4 fix separately (unrelated to Surface 3 removal).

### Minor / no action needed
- `/en/list` renders an empty-list state ("Your 0 items split best across 0 stores") on a fresh browser session with no localStorage — expected, unrelated to WPU (list state is client-local, not seeded by this test).
- Locale routing: `de` is the default locale under `as-needed` prefix, so `/de/...` 307-redirects to the un-prefixed path (`/`, `/deals`, `/settings/hidden`, etc.) before resolving. This is pre-existing i18n routing config (`src/i18n/routing.ts`), not something this change touches, and both prefixed and un-prefixed forms resolve correctly.

---

## Evidence files (gitignored, inside the worktree — not committed)
- `web-next/test-results/qa-screenshots/home-de-375.png` — German homepage, 375px, full page. Shows Hero → 3 category cards → Share → "So funktioniert es" strip → footer, no gap, no WPU section.
- `web-next/test-results/qa-screenshots/home-en-1280.png` — English homepage, desktop width.
- `web-next/test-results/qa-screenshots/hidden-404-en.png` — `/en/settings/hidden` as rendered in a real browser (shows the pre-existing "500 Something went wrong" boundary described in Findings, for reference).

## Cleanup performed
- `.env.local` copied into the worktree's `web-next/` for local testing, deleted after all tests completed (`git status` in the worktree shows clean tree — the file was gitignored and never staged).
- All ad-hoc debug Playwright specs used to isolate the 404 finding were deleted from `web-next/e2e/` after use; only the original `v2-acceptance.spec.ts` remains.
- Local `next start` server on port 3000 stopped.

## Acceptance criteria checklist (spec §5)
1. `/settings/hidden` returns 404 in de/en (the app's only 2 live locales; fr/it are not routed — `src/i18n/routing.ts` confirms `locales: ['de', 'en']`) — **PASS**
2. Homepage renders with no WPU section, no code path can render it — **PASS**
3. `MethodologyStrip` has no Hidden Suggestions link, 3-step content unchanged — **PASS**
4. No unused-import/translation-key errors; `tsc --noEmit` clean — **PASS**
5. No remaining import of deleted modules anywhere in `web-next/src` — **PASS**
6. `user_interest` table / Notify-me flow untouched — **PASS** (not modified by this diff; out of scope to re-verify DB writes per QA constraints, but code path confirmed untouched by `git show --stat`)
7. Full `web-next` test suite green — **PASS** (341/341)
