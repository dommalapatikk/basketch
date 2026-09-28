# QA Report — Stale Expired Deals / Zurich-Date Cache Fix

**Date:** 2026-09-28
**Tested by:** QA Tester Agent
**Branch:** `worktree-agent-ada672819484965c9`, HEAD `3623f87`
**Environment:** local production build (`next build` + `next start -p 3127`), live Supabase data (anon key, read-only)
**ADR under test:** `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md`

## Setup
- Copied `web-next/.env.local` from the main checkout into the worktree, `rm -rf .next && npm run build` (Next.js 16.2.4, Turbopack, Cache Components enabled), `npx next start -p 3127` in background.
- Build succeeded: `✓ Compiled successfully`, TypeScript finished clean, all 23 pages generated.
- After testing: server killed, copied `.env.local` deleted, `git status --short` confirmed clean in the worktree.

---

## Check 1 — Build output: PPR + no baked-in counts — **PASS**

Route table confirms Partial Prerender (`◐`) for both target routes:
```
├ ◐ /[locale]
├ ◐ /[locale]/deals
```

Grepped `.next/server/app/de.html`, `.next/server/app/en.html`, `.next/server/app/de/deals.html`, `.next/server/app/en/deals.html` (the prerendered shells) for `Aktionen aus` and `deals across` — **zero matches in all four**, and zero matches for any digit-prefixed pattern (`[0-9.,]* Aktionen`, `[0-9.,]* deals`).

The only files where `deals across` appears at all are the RSC segment payloads and `about`/`list`/`deals` segment caches, and in every case it's the **static share-dialog copy** (`"This week's grocery deals across 7 Swiss stores, side by side."` — a fixed translation string where "7" is the number of retailers in the product, not a computed deal count). This is unrelated to the defect; it's a hardcoded i18n message, not verdict data.

**Conclusion:** the prerendered HTML shell contains no deal/store counts — confirms D2 (Suspense boundary keeps deal data out of the stored page).

---

## Check 2 — Live-data correctness vs Supabase — **PASS**

Homepage (both locales), local build, port 3127:
- `/` (de): **"1.537 Aktionen aus 6 Schweizer Läden"**
- `/en`: **"1,537 deals across 6 Swiss stores"**

Identical count and store count across locales.

Read-only Supabase query (anon key), Zurich today = `2026-09-28`:

| Query | Result |
|---|---|
| `valid_from.lte.today AND valid_to.gte.today` (in-effect window, any `is_active`) | **1618** |
| same + `is_active=eq.true` | **1537** ✅ matches homepage exactly |
| same + `is_active=eq.false` | **81** (explains the gap: 1618 − 81 = 1537) |
| `valid_from.gt.today AND valid_to.gte.today` (not-yet-started/upcoming) | **0** — no upcoming deals today, so the "listed but excluded from verdict" edge case doesn't apply right now |
| distinct `store` among in-effect + active deals | `coop 593, denner 241, aldi 68, spar 53, migros 34, lidl 11` = **6 stores** ✅ matches "6 Schweizer Läden" — **Volg has zero in-effect active deals today**, which is exactly the scenario the original defect was about |

**Explanation of the 1618 vs 1537 difference:** `is_active` is a pipeline-maintained flag meaning "withdrawn or replaced" (per the ADR — orthogonal to date validity; "expired is never stored"). 81 deals are inside today's date window but were withdrawn/replaced by a later pipeline run, so the app correctly excludes them via the `is_active` filter on top of the date-range safety net. This is expected behavior, not a bug.

**No-expired-deal spot check on the actual rendered `/en/deals` page:** parsed all `validFrom`/`validTo` pairs out of the rendered RSC payload — **1537 deal entries found** (matches the headline count exactly), **0 with `validTo < today`**, **0 with `validFrom > today`**. Confirms the fix holds at the rendered-item level, not just the aggregate count.

---

## Check 3 — Repeat-request consistency + headers — **PASS**

6 consecutive requests to `/` all returned **"1.537 Aktionen aus 6 Schweizer Läden"** — no drift.

Headers on every request:
```
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
x-nextjs-prerender: 1
x-nextjs-postponed: 1
x-nextjs-stale-time: 300
```
`no-store`/`must-revalidate` + `x-nextjs-postponed: 1` confirm the deal content is streamed per-request (D1/D2), not served from a stored page — consistent with the ADR's uncached-snapshot design.

---

## Check 4 — `/card` image + cache headers — **PASS**

`GET /card?locale=en&d=2026-09-28` → **200**, `content-type: image/png`, PNG confirmed (1200×630, `file` tool output).

`Cache-Control: public, max-age=0, s-maxage=900, stale-while-revalidate=60` — **no `immutable`, no 1-year max-age**. Matches the SF-6 fix in the ADR exactly (replacing `next/og`'s default `public, immutable, no-transform, max-age=31536000`).

---

## Check 5 — Shared list page / list drawer — **PASS (page) / NOT ATTEMPTED (drawer)**

Pulled one current in-effect+active deal id from Supabase (`7c4e338e-dfab-4b0f-9c1d-163ec601e336`) and requested `/en/list?items=<id>` → **200**, page renders (32,680 bytes), the deal id appears in the payload.

**List drawer (Playwright):** browser-launch tooling was denied in this session (no Playwright/browser MCP tool available) — per instructions, **did not retry**. Not tested; flagging as an open gap for a session with browser automation available.

---

## Check 6 — Before/After comparison vs live `https://basketch.vercel.app` — **PASS (fix confirmed materially different from live)**

| | Local fixed build (port 3127) | Live production (unfixed, cached) |
|---|---|---|
| `/` count | 1.537 Aktionen aus 6 Läden | **1.599** Aktionen aus 6 Läden |
| `/en` count | 1,537 deals across 6 stores | **1,599** deals across 6 stores |
| de vs en match? | Yes, identical | Yes, identical (but both stale — see below) |
| `/` Cache-Control | `private, no-cache, no-store, max-age=0, must-revalidate` | `public, max-age=0, must-revalidate` |
| `/` cache status | n/a (no CDN locally) | **`x-vercel-cache: HIT`**, `age: 12`→`13`s across repeated requests — a genuinely stored/served-from-cache page |
| `x-nextjs-postponed` | `1` (present — streaming) | **absent** on live `/` |
| `/deals` cache status | n/a | `x-vercel-cache: PRERENDER` |
| `/card` Cache-Control | `public, max-age=0, s-maxage=900, stale-while-revalidate=60` | `public, max-age=0, must-revalidate` (no `immutable`/1-year — already fixed live) |

**Reading:** live production's homepage count (1,599) does **not** match today's Supabase ground truth (1,537) and is being served from Vercel's edge cache (`HIT`, growing `age`) rather than computed per-request — this is exactly the pre-fix stale-cache behavior the ADR describes, still visible on the currently deployed production site (this worktree branch has not been merged/deployed). The local build under test shows the corrected, per-request, cache-busted behavior. Note live `/en` and `/` show the *same* stale number (1,599) — this doesn't mean live is bug-free today, just that whatever cached snapshot is currently stored happens to agree between locales; the ADR's original defect (1,623 vs 1,599 mismatch) was from a specific point-in-time snapshot mismatch that will recur under the old caching design.

---

## Summary

| Check | Result |
|---|---|
| 1. Build output — PPR, no baked-in counts | PASS |
| 2. Live-data correctness vs Supabase | PASS |
| 3. Repeat-request consistency + headers | PASS |
| 4. `/card` image + short cache header | PASS |
| 5a. Shared list page | PASS |
| 5b. List drawer (Playwright) | NOT ATTEMPTED — browser launch denied, not retried per instructions |
| 6. Before/after vs live | PASS — fix confirmed distinct from live's still-cached, stale behavior |

**No critical or major issues found.** The fix behaves as designed: per-request rendering, date-keyed cache, no expired deals in the rendered set, short-lived `/card` cache header, and the homepage/`/deals` counts tie out exactly to a live Supabase read-only query once the `is_active` pipeline-withdrawal filter is accounted for.

**Open gap:** list-drawer interaction on `/en/deals` untested (no browser automation tool available in this session).
