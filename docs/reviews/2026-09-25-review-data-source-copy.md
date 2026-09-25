# Code review: data-source copy rework (commit 425e43c)

**Reviewer:** Independent Code Reviewer · **Date:** 2026-09-25
**Branch / worktree:** `worktree-agent-a489b7c0dcdb7b06a` · diff `eeb2a0e..425e43c` (7 files, +349 / −43)
**Spec:** `docs/design/2026-09-25-data-source-copy-rework.md` · **Facts:** `docs/design/2026-09-25-data-source-facts.md` · **PM:** `docs/decisions/2026-09-25-pm-decisions.md`
**Out of scope (PM):** `about.contact.*`, "Cheapest" tag logic (P-7).

## Summary

| | Count |
|---|---|
| MUST-FIX | 3 |
| SHOULD-FIX | 4 |
| NIT | 5 |

**Verdict: Needs Changes.** The main goal is met: every "all data from aktionis.ch" claim is gone from en/de/fr/it, and the per-retailer list is accurate against `live-sources.ts`. But the rework adds two new claims that are not true. It says every answer gets a second AI check, and it puts the stale banner on the deals page, when it is really on the home page. The per-retailer rows also render with no separator between the store name and its description.

**Gates run (by me, in the worktree):**
- `npx vitest run`: 34 files, **355/355 passed**.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`: **exit 0**.
- After the mutation runs, `git status --short` was empty (clean).

**What was done well:**
- Store names come from `STORE_BRAND`, not from hard-coded text.
- `DataSourceKey` is a template-literal type, so a missing key fails type-checking.
- The brand dot is decorative (`aria-hidden`), and the store name is the text, so colour is never the only signal.
- The fr/it footers were fixed as well.
- Tests are named after the defect they prevent.
- The `setRequestLocale` mock is explained.

---

## MUST-FIX

### M-1: "a second AI checking every answer" is false in four code paths
`web-next/src/messages/en.json:13`, `de.json:13` (`about.how_it_works.step2`), and to a lesser degree `en.json:66` / `de.json:66` (`methodology.step2_d` "cross-checked" / "gegengeprüft").

Evidence from the pipeline code:
1. **No judge for the whole run.** `pipeline/composition.ts:238`: `judgeMayRun = Boolean(env.OPENROUTER_API_KEY) && spendCeiling.ceilingMicros !== null`. If the key is missing, the key has no credit limit, or the OpenRouter account cannot be read, `judge` is `null` (logged as `spend-unguarded: running WITHOUT the judge this run`). The `judge` node in `classify-graph.ts` then marks every answer `status: 'classified', judgeVerdict: null`, so products are published **unchecked and not flagged**.
2. **Judge rate-limited or out of credit.** `port-guards.ts:49-66` turns any judge failure (402, 429, parse error) into `verdict: 'unavailable'`. `foldJudgeResults` treats every verdict except `'wrong'` as `classified`, so these products ship **unflagged**. `classify-deals.ts:926` logs this itself: "those shipped with NO independent check".
3. **Sampling on a cold start.** `selectForJudging` skips items when `judgeSampleRate < 1`. `classify-deals.ts:574-587` logs "judge sampled at 1 in N for this cold start".
4. **Escalation budget used up.** `!mayEscalate(...)` goes to `acceptedWithoutJudging`, which is also classified and unflagged.

So the true statement is that answers are checked by a second model **when it is available**, and unchecked answers are **not** marked. The second sentence is also slightly wrong. When the judge disputes an answer and the model then changes its category, the product is `classified`, not marked (`reflectOne`, `changed ? 'classified' : 'uncertain'`). "Category unverified" appears only when the two models **still** disagree after the reconsideration step (or that step returns nothing).

Suggested copy (keep the tone understated):
- **EN:** "Each product is sorted into Fresh, Long-life or Household by an AI model, and a second AI model normally double-checks the answer. If the two still disagree, the deal is shown marked 'Category unverified'."
- **DE:** "Jedes Produkt wird von einem KI-Modell in Frisch, Lange haltbar oder Haushalt eingeordnet; ein zweites KI-Modell prüft die Antwort in der Regel nach. Bleiben die beiden uneinig, erscheint die Aktion mit dem Hinweis „Kategorie ungeprüft“."
- `methodology.step2_d`: "AI-assigned, usually cross-checked" / "KI-zugewiesen, meist gegengeprüft". Alternatively, drop "cross-checked" and use "AI-assigned" / "KI-zugewiesen".

Also add a test that no `en`/`de` string matches `/checking every answer|prüft jede Antwort/i`.

### M-2: The stale banner is on the home page, not the deals page
`en.json:26`, `de.json:26` (`about.data_sources.note`): "…a banner tells you so on the deals page" / "…mit einem Hinweis auf der Aktionen-Seite".

Evidence: `StaleBanner` is rendered only in `web-next/src/app/[locale]/page.tsx:27` (the home page). `grep -rln StaleBanner app components` finds nothing under `deals/`. `DealsClient.tsx:183-186` shows only the neutral "Updated {date}" subline, with no staleness warning. This came from the spec §2.3, but the code does not support it, so fix the copy (or add the banner to `/deals`, which is a product decision).
- **EN:** "…a banner on the home page tells you so."
- **DE:** "…siehst du das an einem Hinweis auf der Startseite."

(The `how_it_works.step1` claim "the exact date is on the deals page" **is** true, via `deals.subline`.)

### M-3: Per-retailer rows have no separator ("Migros the public weekly flyer…")
`web-next/src/app/[locale]/about/page.tsx:110-113`: `<span>{label}</span>{' '}{t('data_sources.source_<store>')}`.

Rendered text, confirmed by reading the component:
- EN: "**Migros** the public weekly flyer (Issuu, Zurich edition)", "**Coop** aktionis.ch, a public deal site…", "**Denner** denner.ch, the store's own site"
- DE: "**Migros** der öffentliche Wochenflyer…", "**Coop** aktionis.ch, ein öffentliches Angebotsverzeichnis…"

Bold alone does not separate them. The sentences read as broken, and screen readers get no pause at all. The spec §2.2 strings had "Migros — …". The Builder's decision to keep only the description in JSON and take the name from `STORE_BRAND` is **correct** (spec line 100, one source of truth for names). The separator just needs to go in the component. An em dash works in both languages and needs no i18n:
```tsx
<span className="font-semibold …">{STORE_BRAND[store].label}</span>
{' — '}
{t(`data_sources.source_${store}` as DataSourceKey)}
```
German lowercase after a dash ("— der öffentliche Wochenflyer") is correct. Add the rendered "Migros — " form to the about-page test (see S-1).

---

## SHOULD-FIX

### S-1: The about-page test says it checks descriptions, but it does not (proven by mutation)
`web-next/src/app/[locale]/about/page.test.tsx:35`: the test is called "renders all 7 retailers, **each with its own source description**", but it only checks store labels. **Mutation M4** removed `{t(\`data_sources.source_${store}\`…)}` from `page.tsx`, so every row showed only the store name, and the test still **passed (2/2)**. Assert each `messages.about.data_sources[`source_${store}`]` string appears in `sectionText` (ideally as `${label} — ${description}` after M-3).

### S-2: No guard against the old "refreshed weekly" / "no scraping" note coming back (proven by mutation)
**Mutation M5** restored `about.data_sources.note` to "…No scraping of protected websites. Deal data is refreshed weekly." **All 14 tests passed.** That is fact sheet §5a item 4, the one stale string this rework fixed without a test. Add `/refreshed weekly|wöchentlich aktualisiert|no scraping|kein scraping/i` to the flattened-string checks.

### S-3: The aktionis allowlist is too loose (proven by mutation)
`copy-accuracy.test.ts:46-51` (`isCoopScopedAktionisMention`): any string containing "7", "seven", "sieben", or "sept"/"sette" (no word boundary, so "September" also matches) gets through. **Mutation M6** set `footer.source` to "All 7 stores: data from aktionis.ch", which is a sole-source claim, and **all 12 tests passed**. The footer test (`/\b7\b|coop/i`) is fooled in the same way. Suggested fix: require `coop` in any non-`source_coop` string that mentions aktionis, and fail on `/(all|alle|every|jede).{0,30}aktionis/i`.

### S-4: The privacy bullet slightly overclaims once a list is shared
`en.json:36`, `de.json:36`: "nothing is sent to a server". Building and saving the list is local (`stores/list-store.ts`, zustand `persist` to localStorage). But **sharing** puts the deal IDs in the URL (`lib/share-url.ts:29-33`, `/list?items=…`). The server then reads them (`app/[locale]/list/page.tsx:50-57`), and Vercel request logs are UNVERIFIED (fact sheet §4a). A more exact version: "Your list is saved only in your browser — we don't store it on a server." / "Deine Liste wird nur in deinem Browser gespeichert — wir speichern sie nicht auf einem Server."

---

## NIT

- **N-1: Wrong closing quote in German.** `de.json:13` has „Kategorie ungeprüft\" with an ASCII `"` as the closing mark. It should be `“` (U+201C): „Kategorie ungeprüft“. This also removes the JSON escape.
- **N-2: Duplicate parity test.** `copy-accuracy.test.ts:196-213` repeats the DE↔EN key-parity check that already exists in `messages/messages.test.ts:22` ("i18n key parity"). The spec §4.8 said "extend, don't duplicate". Delete the new block.
- **N-3: A deleted bullet passes silently.** In `copy-accuracy.test.ts:123`, `if (bullet3 === undefined) continue` also skips en/de, so deleting `bullet3` there would pass without notice. Only skip fr/it, and assert that en/de have the key.
- **N-4: Formatting mixed into the feature commit.** `about/page.tsx` also reorders the `Metadata` import and reformats the `AboutPage` signature, the intro `<p>` and the `how_it_works` cast. This is harmless, but it breaks the Two Hats rule (formatter noise mixed with the feature). Commit such changes separately next time.
- **N-5: Wording.** EN `step2` puts the full stop inside the quotes ('Category unverified.'), so the label reads as if it included the full stop. Prefer "…marked 'Category unverified'." DE `source_denner` "die Website des Anbieters selbst" is fine, but "die eigene Website von Denner" reads more naturally.

---

## Check-by-check answers

1. **Truth of the claims.** Checked against the code:
   - True:
     - Per-retailer sources: `live-sources.ts:271-357`; Denner `denner.ch/search-api`; Volg `volg.ch/sortiment/wochenaktionen/`; Coop `coop-aktionis-source.ts:46` `SITE = 'https://www.aktionis.ch'`; Migros Issuu `-d-zh`.
     - "Up to three times a week" / "Monday, Tuesday and Thursday": `pipeline.yml:6-10`.
     - The 9-day threshold: `lib/format.ts:125-130`.
     - The list is stored in the browser: `list-store.ts`, zustand persist.
     - "The exact date is on the deals page": `DealsClient.tsx:185`.
     - Footer, share text and methodology `step1_d`.
   - Not true: see **M-1** (the judge is not guaranteed; if it is rate-limited, unavailable, sampled out or over budget, the product ships unflagged), **M-2** (the banner's location) and **S-4**.
2. **German quality and terms.** "Aktionen-Seite" matches the DE nav (`nav.deals` = "Aktionen") and `deals.headline` "Aktionen dieser Woche". Swiss spelling is used (no ß in the new strings), and the tone is understated with no exclamation marks. The only problems are **N-1** (closing quote) and the separator in **M-3**.
3. **Builder's judgement call (description in JSON, name from STORE_BRAND).** The approach is correct, but the rendered sentence is missing its separator: see **M-3**.
4. **Mutation proof.** The tests catch regressions in these cases:
   - **M1:** restoring EN `footer.source` to "Data from aktionis.ch" makes 2 tests fail.
   - **M2:** restoring the DE `about.data_sources.body` "Alle Aktionsdaten … seit 2006" makes 4 tests fail (3 JSON + 1 about page).
   - **M3:** removing the LIDL row from the component makes both locales fail in the about test.

   These gaps are not caught:
   - **M4:** removing the descriptions from the rows still passes (S-1).
   - **M5:** restoring "refreshed weekly" still passes (S-2).
   - **M6:** "All 7 stores: data from aktionis.ch" still passes (S-3).

   Every mutation was restored with `git checkout -- <file>`, and `git status --short` was clean afterwards.
5. **Other stale strings in `web-next/src`.** Nothing live remains:
   - `layout.tsx:35-38`, `deals/page.tsx:22-24`, `manifest.ts:11` and the `about` metadata (`t('intro')`) list all seven stores and name no source.
   - The `card/route.tsx` OG image uses no hard-coded source text.
   - `home.*` strings are clean.
   - Stale strings remain only in unrendered or out-of-scope places:
     - `variant_picker.*` / `availability.*` e-mail and "notify" strings (V3 preview, not routed), including `no_match_helper` "in your region".
     - `about.contact.*` (PM: out of scope).
     - `deals.cheapest` (P-7).
     - Code comments: `server/data/provider.contract.ts:4` "aktionis.ch is a pipeline-only input", the `lib/v3-types.ts:20-33` `aktionisSlug`, and `lib/domain/validity.ts:6` (historical). These are tech debt already listed in fact sheet §5b and not user-facing.
6. **Gates.** vitest 355/355 passed; `tsc --noEmit` exit 0.

## Final verdict

**Needs work.** Fix M-1 to M-3 (copy plus one JSX separator) and S-1 to S-3 (tighten the tests so these regressions fail). Then re-review only those items.

---

## Re-review: commit b0459cd (on top of 425e43c)

**Date:** 2026-09-25. **Scope:** only the findings listed above.

**Gates (run by me):**
- `npx vitest run`: 34 files, **358/358 passed**.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`: **exit 0**.
- `git status --short` was empty after the mutation runs.

### Finding-by-finding

| Id | Status | Evidence |
|---|---|---|
| M-1 | **Resolved** | See "M-1: is the new wording now true?" below. |
| M-2 | **Resolved** | `en.json:26` says "a banner on the home page", and `de.json:26` says "Hinweis auf der Startseite". This matches `StaleBanner` in `app/[locale]/page.tsx:27`. A new guard test exists, and mutation D proves it (below). |
| M-3 | **Resolved** | `about/page.tsx:112-113` now renders `{' — '}` between the bold name and the description. Rows read "Migros — the public weekly flyer (Issuu, Zurich edition)" and "Coop — aktionis.ch, ein öffentliches Angebotsverzeichnis (…)". Mutation A (separator removed) fails the test in both locales. |
| S-1 | **Resolved** | `page.test.tsx` now checks the whole row `${label} — ${description}` for all 7 stores in en and de. Mutation B (description removed) now **fails**; before this fix it passed. |
| S-2 | **Resolved** | New test for `/refreshed weekly\|wöchentlich aktualisiert\|no scraping\|kein scraping/i` across all locales. |
| S-3 | **Partly resolved.** The count-word loophole is closed, but the new "all/every" guard catches almost nothing. See R-1. | |
| S-4 | **Resolved** | "we don't store it on a server" / "wir speichern sie nicht auf einem Server". This is true: localStorage only, and the shared link carries IDs that are not stored. |
| N-1 | **Resolved** | `de.json:13` now uses „Kategorie ungeprüft“ with the correct closing mark and no JSON escape. |
| N-2 | **Resolved** | The duplicate parity block was removed, with a pointer to `messages.test.ts`. |
| N-3 | **Resolved** | en/de must now have `bullet3` (`toBeTruthy`), and only fr/it are skipped. |
| N-5 | **Resolved; the Denner wording was kept, which I accept.** | The EN full stop is now outside the quote. With the M-3 separator, the row reads "Denner — denner.ch, the store's own site". Repeating "Denner" would be redundant, so the Builder's choice is right. |
| N-4 | **Skipped by the coordinator; I accept this.** | It was cosmetic. Rewriting a pushed commit only to split formatter noise costs more than it gains. Carried forward as a process note for later commits. |

### M-1: is the new wording now true?

- **EN:** "…a second AI model **normally** double-checks the answer. If the two **still** disagree, the deal is shown marked 'Category unverified'."
- **DE:** "…prüft die Antwort **in der Regel** nach. Bleiben die beiden uneinig…"
- **methodology.step2_d:** "usually cross-checked" / "meist gegengeprüft".

Checked against the paths where the judge is skipped:
- **Normal case.** When the OpenRouter key is present and capped, a warm run judges every product. `classify-deals.ts:587` logs "warm runs judge every product", and the fact-sheet run log shows the judge active with $3.32 of $5 left. So "normally" matches what usually happens.
- **Exceptions.** No judge this run (`composition.ts:238`), judge `'unavailable'`, sampling on a cold start, and escalation budget used up. These are all degraded or exceptional runs. "Normally" / "usually" no longer promises they never happen.
- **"If the two still disagree → marked".** This matches `reflectOne`. A reconsidered answer that keeps its category becomes `'uncertain'`, and a changed one becomes `'classified'`. A dispute that runs out of budget, or a reconsideration that returns nothing, also ends as `'uncertain'`, so it is marked too. Nothing is overstated.

**Verdict on M-1: the wording is now true.**

### Mutation proof (each restored with `git checkout -- <file>`)

| # | Mutation | Result |
|---|---|---|
| A | Put the `{' '}` back in place of `{' — '}` in `about/page.tsx` | **Failed**: 2 (en + de row test) |
| B | Remove the description `t(...)` from the row | **Failed**: 2 (this passed before the fix) |
| C | Put back "with a second AI checking every answer" in `en.json` step2 | **Failed**: 1 (M-1 guard) |
| D | Put back "Hinweis auf der Aktionen-Seite" in `de.json` note | **Failed**: 1 (M-2 guard) |
| E | `en.json` footer.source → "All deal data from aktionis.ch, Coop included" | **Passed (gap)**: see R-1 |
| F | `en.json` step2_d → "AI-assigned, cross-checked" (qualifier dropped) | **Passed (gap)**: see R-2 |

### Remaining findings

**MUST-FIX: none.**

**R-1 (SHOULD-FIX, test only): the "all/every" guard does almost nothing.** `copy-accuracy.test.ts`, `CLAIMS_ALL_DATA_IS_AKTIONIS = /(all|alle|jede[rs]?|every|tout(e|es)?|tutt[eoi])\W{0,30}aktionis/i`. The comment says "within ~30 characters", but `\W{0,30}` allows only **non-word** characters in between. So it matches "all aktionis" or "all: aktionis" and nothing with a word in the middle. Mutation E ("All deal data from aktionis.ch, Coop included") is a sole-source claim that names Coop, and the suite still passes it. The prefix alternatives also have no `\b`, so "all" would match inside "small" if the gap were widened. Suggested fix:

`/\b(all|alle|jede[rs]?|every|tout(e|es)?|tutt[eoi])\b[^.]{0,40}aktionis/i`

This keeps the match inside one sentence. Re-run it against the current en/de/fr/it strings to confirm there are no false positives. The live copy itself is correct, which is why this is SHOULD and not MUST.

**R-2 (NIT): `methodology.step2_d` has no guard.** Dropping the "usually" / "meist" qualifier passes (mutation F). If you want it guarded, one line in the M-1 test does it: `/(?<!usually |meist )(cross-checked|gegengeprüft)/i` on `methodology.step2_d`, or an exact-value assertion.

### Re-review verdict

**Approved.** There are no MUST-FIX findings, and every MUST/SHOULD finding from the first review is resolved in the copy and the component. R-1 (the regex that catches almost nothing) and R-2 are test-strength follow-ups. They don't block shipping this copy, but R-1 should be fixed in the next commit that touches `copy-accuracy.test.ts`, because its comment claims coverage it doesn't provide.
