# QA Report — Data-source copy rework

**Date:** 2026-09-25
**Tested by:** QA Tester Agent
**Branch:** `worktree-agent-a489b7c0dcdb7b06a`, commit `b0459cd` (re-review-approved; a later commit `e38472b` on that branch is test-only, per the coordinator, so `b0459cd` is the right revision to test)
**Spec:** `docs/design/2026-09-25-data-source-copy-rework.md`
**Reviews:** `docs/reviews/2026-09-25-review-data-source-copy.md` (Re-review section — final approved strings)
**Method:** Own throwaway worktree at `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/qa-copy` (checked out at `b0459cd`, isolated from the Builder's worktree). `npm ci` → `npm run build` → `npx next start -p 3124`. Verified with `curl` + text/regex checks (Playwright/screenshot tools were not invoked this run — HTML-source inspection plus CSS-class reasoning covered every check in the brief; no screenshot command was attempted or denied). Compared against live production, `https://basketch.vercel.app` (confirmed as the live domain — `basketch.app` itself did not resolve; `.env.example`'s `NEXT_PUBLIC_SITE_URL=https://basketch.app` is the intended custom domain but DNS/host currently serves off `basketch.vercel.app`, consistent with the prior QA report's usage of that URL).

**Overall verdict: PASS.** All 7 checks pass. No stale/false claims found anywhere in the local build (en or de); the local build's copy also has zero overlap with the still-broken claims confirmed live in production. No regressions: all pages 200 (or the pre-existing, unrelated `de` → un-prefixed 307 redirect), no server/console errors in the `next start` log, and the new content is built with the same wrapping, non-tabular, `flex items-start` pattern the spec calls for, so it will not overflow at mobile widths.

---

## Check 1 — Homepage "How it works" strip (`MethodologyStrip`)

**PASS**, both locales.

| Key | EN found | DE found |
|---|---|---|
| `methodology.step1_d` | "from 7 Swiss retailers" | "von 7 Schweizer Läden" |
| `methodology.step2_t` / `step2_d` | "Category check" / "AI-assigned, usually cross-checked" | "Kategorie-Prüfung" / "KI-zugewiesen, meist gegengeprüft" |
| `methodology.step3` | "Category winners" / "by avg % off" (unchanged) | "Kategoriegewinner" / … (unchanged) |

Evidence (`curl -sL http://localhost:3124/en` / `/de`, grepped):
```
from 7 Swiss retailers
Category check
AI-assigned, usually cross-checked
von 7 Schweizer Läden
Kategorie-Prüfung
KI-zugewiesen, meist gegengeprüft
```
Note: `/de` returns `307` to `/` (pre-existing "as-needed" locale-prefix behaviour, not related to this change — same as documented in the prior "Remove Worth a look" QA report); `curl -L` resolves it to the correct localized `200` page.

## Check 2 — Footer on homepage, /deals, /about, /list

**PASS**, all 6 pages (3 EN + 3 DE).

```
en/home  -> Data from 7 Swiss retailers — Coop via aktionis.ch
en/deals -> Data from 7 Swiss retailers — Coop via aktionis.ch
en/about -> Data from 7 Swiss retailers — Coop via aktionis.ch
en/list  -> Data from 7 Swiss retailers — Coop via aktionis.ch
de/deals -> Daten von 7 Schweizer Läden — Coop via aktionis.ch
de/about -> Daten von 7 Schweizer Läden — Coop via aktionis.ch
de/list  -> Daten von 7 Schweizer Läden — Coop via aktionis.ch
```
Exact match to the approved `footer.source` string (spec §2.9 / review). `Footer.tsx:7-8` has no fixed height/`whitespace-nowrap`, `text-xs leading-5` inside a normal block — will wrap if needed, no clipping risk.

## Check 3 — /about page

**PASS** on every sub-item.

- **How-it-works (3 steps):** rendered text matches the re-review's final approved strings exactly, both locales, e.g. EN step2: *"Each product is sorted into Fresh, Long-life or Household by an AI model, and a second AI model normally double-checks the answer. If the two still disagree, the deal is shown marked 'Category unverified'."* (period correctly outside the quote — N-5 confirmed). DE step2 closing quote uses the correct German typographic marks „…" (U+201E / U+201C, verified via `python3` codepoint inspection) — N-1 confirmed fixed.
- **Per-retailer source list — dash, all 7, display order:** confirmed by parsing the rendered HTML (`<span class="font-semibold …">{name}</span> — <!-- -->{description}`, an RSC hydration-boundary comment sits between the dash and the text, which is why a naive `grep` for the literal joined string returns nothing — parsed with Python instead):

  ```
  Migros — the public weekly flyer (Issuu, Zurich edition)
  Coop   — aktionis.ch, a public deal site (coop.ch blocks automated access)
  LIDL   — the public weekly flyer
  ALDI   — the public weekly flyer
  Denner — denner.ch, the store's own site
  SPAR   — the public weekly flyer
  Volg   — volg.ch, the weekly offers page
  ```
  (DE rows match, all with correct â€” separator and umlauts.) All 7 stores present, each has a dash and a non-empty description. Order is Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg — this differs from the spec doc's illustrative ASCII mockup (which listed Denner 3rd), but it exactly matches `STORE_DISPLAY_ORDER` in `web-next/src/lib/store-tokens.ts:11-20`, explicitly documented there as *"Fixed display order for store chips per spec v2.1 §D.5: 'Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg'"* — i.e., the component correctly reuses the project's one canonical display-order constant rather than inventing a new order for this list. Judged correct, not a defect.
- **Data note mentions the home-page banner:** EN — "Collected Monday, Tuesday and Thursday. If data is more than 9 days old, a banner **on the home page** tells you so." DE — "…siehst du das mit einem Hinweis **auf der Startseite**." Matches M-2's fix; `StaleBanner` is in fact only rendered on `app/[locale]/page.tsx` (confirmed by reading the file), so this is now true.
- **Privacy bullet 3:** EN "Your list is saved only in your browser — we don't store it on a server." DE "Deine Liste wird nur in deinem Browser gespeichert — wir speichern sie nicht auf einem Server." Matches the S-4 fix (no more "nothing is sent to a server" overclaim).
- **Contact section:** `hello@basketch.app` present in both locales, tone softened per spec §2.8 intent (out of scope per PM/review — expected, not touched, not re-flagged).

## Check 4 — No stale/false claims anywhere

**PASS.** Swept `home`, `deals`, `about`, `list`, and a non-existent path (404) in both `en` and `de` (10 pages total) for every banned pattern in one pass:

```
grep -l "all data comes from aktionis|alle Aktionsdaten.*aktionis|refreshed weekly|
wöchentlich aktualisiert|no scraping|kein Scraping|Email is optional|
E-Mail ist optional|track your regular items|verfolge deine üblichen|
Migros vs Coop|Migros vs\. Coop|since 2006|seit 2006" ...
→ no matches (grep exit 1) across all 10 pages
```

## Check 5 — Before/after vs. live production (`https://basketch.vercel.app`)

**PASS** (i.e., confirms the fix). Live production (still on the pre-rework copy) was fetched and checked for the same strings as a control:

| Surface | Live production (today) | This build (`b0459cd`) |
|---|---|---|
| Footer | "Data from aktionis.ch" | "Data from 7 Swiss retailers — Coop via aktionis.ch" |
| Methodology card 1 | "from aktionis.ch" | "from 7 Swiss retailers" |
| Methodology card 2 | "Normalised prices" | "Category check" / "AI-assigned, usually cross-checked" |
| About → data sources | "All deal data comes from aktionis.ch, a public Swiss deal aggregator **since 2006**." | Per-retailer list, 6 direct + Coop via aktionis, no 2006 claim |
| About → stores list | "Stores tracked: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg." (flat sentence) | Deleted; superseded by the per-retailer list |
| About → data note | "No scraping of protected websites. Deal data is refreshed weekly." | "Collected Monday, Tuesday and Thursday. If data is more than 9 days old, a banner on the home page tells you so." |
| About → privacy bullet 3 | "Email is optional and only used to find your list." | "Your list is saved only in your browser — we don't store it on a server." |
| About → how-it-works step 3 | "…or track your regular items for a personal comparison." | "Browse all deals, or add items to a list and share it with whoever's shopping." |
| Share verdict text | "Migros vs Coop" (appears in home/about copy) | "This week's grocery deals across 7 Swiss stores, side by side." |

All 8 rows confirmed present verbatim on live and absent from the new build via direct `curl`/`grep` against both.

## Check 6 — No other regressions

**PASS.**
- **HTTP status:** `en/{home,deals,about,list}` → 200 directly. `en/<random-404-path>` → 404 directly. `de/*` → 307 to the un-prefixed path (pre-existing "as-needed" i18n routing, not from this change — matches the same behaviour previously documented for `/de/deals`, `/de/about` etc. in `docs/qa/2026-09-25-qa-remove-worth-a-look.md`), then 200/404 respectively once followed (`curl -L`).
- **Server log:** `next start` log shows only `✓ Ready in 147ms` plus one pre-existing, unrelated Node runtime warning (`--localstorage-file was provided without a valid path`, also present during `next build` — a Node/Next internal notice, not app code, not new). No errors, no stack traces.
- **Mobile overflow (reasoned from source, no screenshot tool used):**
  - `about/page.tsx:100-116` — the retailer list is a `<ul className="mt-5 flex flex-col gap-3">` of `<li className="flex items-start gap-2">` rows, each with a 12px (`h-3 w-3`) `aria-hidden` dot + a `<p>` containing `{name} — {description}`. No fixed width, no table, no `whitespace-nowrap` — exactly the spec's "no horizontal scroll, no table, vertical list" requirement (§1a). Long German compound words in the descriptions wrap naturally within the `<p>`.
  - `MethodologyStrip.tsx:19` — `grid gap-6 md:grid-cols-3`, i.e., single-column stack below `md`, so the 3-card strip does not force 3 narrow columns on a 320–375px phone.
  - `Footer.tsx:7-8` — `text-xs leading-5` inside a plain block div, no fixed height — the now-longer `footer.source` string (per spec §1c, ~15% longer) will wrap to a second line if needed rather than clip.

## Check 7 — German reads naturally (Swiss shopper tone)

**PASS**, with one already-known, already-accepted minor nit carried forward from the code review (not a new finding).

Read through every changed DE string in context:
- Data-sources intro, per-retailer rows, freshness note, how-it-works steps, footer, methodology strip, privacy bullet — all read as plain, understated Swiss German: no exclamation marks, no superlatives, correct "du" form throughout, Swiss spelling (no ß) confirmed in the new strings.
- "Aktionen-Seite" / "Aktionen dieser Woche" terminology matches the existing nav (`nav.deals` = "Aktionen"), so the new copy stays consistent with the rest of the site's vocabulary.
- The one wording that reads slightly less naturally is `source_denner`: "Denner — denner.ch, die Website des Anbieters selbst" (a more idiomatic phrasing would be "die eigene Website von Denner"). This is exactly N-5 from the code review, which the reviewer explicitly accepted as the Builder's judgement call (avoiding redundant repetition of "Denner") — flagging for completeness, not re-opening it.
- No new awkward phrasing found beyond that.

---

## Findings summary

No FAIL items. No new MUST/SHOULD findings beyond what the code review already tracked (R-1/R-2, both test-strength follow-ups on `copy-accuracy.test.ts`, out of scope for a QA pass against the running app).

## Cleanup performed

- `next start` server on port 3124 stopped (`next-server` PID 42782 and its `npm exec` parent PID 42756 killed).
- `web-next/.env.local` (copied from the main checkout for local testing) deleted from the `qa-copy` worktree.
- Worktree removed: `git -C /Users/kiran/ClaudeCode/basketch worktree remove --force .claude/worktrees/qa-copy`.
- No source files were modified, pushed, or merged at any point during this test.
