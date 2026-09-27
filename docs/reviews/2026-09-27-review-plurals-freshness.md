# Code Review — `fix/plurals-freshness` (main..0f423ff)

**Reviewer:** code-reviewer (opus) · **Date:** 2026-09-27
**Commits:** 9e749b4, 3bd9c3b, 6720cdc, 0f423ff
**Spec:** `docs/design/2026-09-27-shared-list-expiry-and-plurals.md` Part B, with Tech Lead TL.1/TL.2 and Design Challenger M1/M2/S5/S7 taking precedence. Part A is out of scope for this branch.

## Summary

| File | Verdict |
|---|---|
| `web-next/src/lib/freshness-format.ts` | Approved |
| `web-next/src/lib/freshness-format.test.ts` | Approved |
| `web-next/src/components/list/AvailabilityStrip.test.tsx` | Approved |
| `web-next/src/messages/en.json` / `de.json` | Needs Changes (the strings are right, but two call sites pass numbers as text, see MF-1) |
| `web-next/src/messages/plurals.test.ts` | Needs Changes (gaps in the guard, see SF-2) |

What I checked myself: the 5 affected test files pass (65 tests). `./node_modules/.bin/tsc --noEmit -p tsconfig.json` exits 0. The working tree is clean at 0f423ff. I added one untracked probe test to render real call-site arguments, then deleted it. Nothing was committed.

---

## MUST-FIX

### MF-1: Deal counts are passed as text, so from 1,000 up they show "NaN deals" in EN and a wrong number in DE. This branch introduced the bug.

- `web-next/src/components/landing/VerdictHero.tsx:40` passes `deals: snapshot.totalDeals.toLocaleString(locale)`
- `web-next/src/app/[locale]/deals/DealsClient.tsx:186` passes `count: filtered.length.toLocaleString(locale)`

Both values are now fed to `{…, plural}`. intl-messageformat turns the value back into a number with `value - offset` to pick the plural form and to render `#`. That works up to 999. It breaks as soon as `toLocaleString` adds a thousands separator. I rendered the real arguments through `createTranslator` with the en.json and de.json from this branch:

| n | EN `deals.subline` / `home.stat` | DE `deals.subline` / `home.stat` |
|---|---|---|
| 999 | `999 deals` | `999 Aktionen` |
| 1000 | **`NaN deals`** / **`Based on NaN deals…`** | **`1 Aktion`** ("1.000" is read as 1) |
| 1234 | **`NaN deals`** | **`1,234 Aktionen`** ("1.234" is read as the decimal 1.234) |
| 2500 | **`NaN deals`** | **`2,5 Aktionen`** |

Before this branch, the bare `{deals}` / `{count}` placeholder printed the text as-is ("1,234 deals"), so this is a regression. It is reachable: CLAUDE.md puts a normal source at about 200 offers, and there are 7 retailers, so the home `stat` total is about 1,400 in a normal week. The home hero would read "Based on NaN deals across 7 Swiss stores."

**Fix:** pass plain numbers (`deals: snapshot.totalDeals`, `count: filtered.length`). ICU `#` already formats the number with the locale's thousands separator, and for `de`/`en` the output matches what `toLocaleString` produced before.

**Test first:** add rows to `plurals.test.ts` for `home.stat` and `deals.subline` at 1234 that assert `1,234 deals` / `1.234 Aktionen`. Better still, add a render test of `VerdictHero` with `totalDeals: 1234`, so the test goes through the real call site. The current tests only pass numbers, which is why this slipped through. Also consider narrowing the argument type, for example with a small `plural(n: number)` helper or a lint rule, so a text value in a plural slot fails to compile.

---

## SHOULD-FIX

### SF-1: The share-card image hard-codes the same stat line and still says "1 Swiss stores" / "1 Schweizer Läden"

`web-next/src/app/card/route.tsx:52-55` builds `${activeStores} Schweizer Läden` / `${…} Swiss stores` from template strings. It has the same class of bug B.1 fixed for `home.stat`, where the spec says `stores` can be 1. It is also a second copy of the `home.stat` wording. The spec's B.0 grep only covered `messages/*.json`, so this was missed, and the guard in `plurals.test.ts` cannot see it. **Fix:** use `getTranslations({ locale, namespace: 'home' })` and `t('stat', { deals: n, stores: n })` with numbers. The card text then gains the "Based on" prefix, so the Designer should confirm that wording or supply a shorter `home.stat_short` key. Add a regression test with `activeStores = 1`.

### SF-2: The regex guard works for today's messages but misses cases the parser would catch. Ruling: switch to the parser.

Holes I confirmed by reading the regex (`\{name\}` counts as bare; `\{name\s*,\s*plural` counts as pluralised):
1. `{count, number}` and `{count, number, integer}` are not treated as bare, so "{count, number} deals" passes the guard.
2. Whitespace such as `{ count }` is valid ICU but does not match `\{count\}`, so it passes.
3. The check is only "the name appears somewhere with `, plural`". A `{items, plural, …}` anywhere in a message allows a bare `{items}` anywhere else, including outside the plural (for example `"{items, plural, one {…} other {…}} · {items} Artikel"`). It does not check that the bare use sits inside a plural block.
4. False positive only (safe direction): a bare `{n}` inside `{n, selectordinal, …}` would be flagged.
5. fr.json and it.json are not scanned. That is acceptable today because `i18n/routing.ts` only routes `['de','en']` and fr/it are 91-line stubs, but the test should say this, so that adding a locale to routing also adds it to the guard.
6. The guard does not check the Challenger's S7.4 items: every plural has an `other` branch, and EN and DE use the same argument names per key. I checked argument names for the 8 changed keys by hand and they match.

On the "no new dependency" reason: `@formatjs/icu-messageformat-parser` is already installed (`web-next/node_modules/@formatjs/icu-messageformat-parser`, pulled in by next-intl). Importing it from a test without declaring it would rely on a dependency the package does not list. Adding it as a **devDependency** at the installed version costs nothing at runtime and nothing in the bundle. The AST walk is about 20 lines: flag any `argument`/`number` element in `COUNT_NAMES` that has no `plural` ancestor, and `parse()` itself rejects a missing `other` branch. **Ruling:** switch to the parser as S7.1 specified, since the Tech Lead did not overrule it. If the coordinator wants to keep the regex, the Tech Lead has to approve that departure from S7, and at minimum holes 1 and 2 must be covered with self-tests. Not blocking on its own, because every current message passes either way.

### SF-3: The detail sheet still treats "unknown date" as "more than 3 months"

`AvailabilityCellSheet.tsx:115-122` renders `b_header_3plus` ("Hasn't been on deal here for more than 3 months") whenever `age` is null. TL.1's second point says an unparseable date must not claim "3+ months". The function now returns null correctly, and the strip shows `never_short` "—" with the aria text "Off deal". The sheet, though, still makes the 3-month claim for both null and invalid dates. This is not a regression: invalid dates already landed there through `unit: '3plus'`. But TL.1's statement that "fixing the function fixes all three surfaces" is not yet true for this surface. **Fix:** a separate null branch in the sheet with neutral copy from the Designer (for example "Not seen on deal here yet."). Add a test with `lastSeenAt: 'not-a-date'`.

---

## NIT

- **N-1** In `split_summary`, the inner `{items}` is a plain argument, so it prints with `String(n)` and no thousands separator ("1200"), while `#` would give "1,200". This only matters at 1,000 or more items in one list, which is not realistic.
- **N-2** `list/page.tsx:80` puts `split_summary` in an `<h1>` with no store list after it, so "Your item is cheapest here:" ends on a colon that points at nothing. The old string had the same problem. Challenger S4 (Part A) replaces this h1, so leave it for that branch.
- **N-3** `AvailabilityStrip.tsx:165` hard-codes `3+ mo`, which is not translated in DE. This was already there before the branch.
- **N-4** `freshness-format.test.ts` covers everything TL.3 asks for, including day −1, the 6d23h and 29d23h partial days, the 0–400 sweep, and null/''/invalid input. It is well done. The strip test offsets by half a day so the day count stays stable while the test runs, which is also good.

---

## Specific rulings requested

**S5 "yesterday" not implemented: agreed.** `ageFromTimestamp` rounds down over rolling 24-hour periods and gives value 1 for day −1, day 0 and day 1. `one {yesterday}` would therefore say "yesterday" for something seen an hour ago. It is also wrong the other way: seen Mon 23:00 and viewed Wed 08:00 is 33 hours, which gives days = 1, so "yesterday", when it was really two calendar days ago. TL.2 also says explicitly that there is no new today-wording and that day 0 stays "1 day". "Yesterday" would only be honest with calendar-day logic in Zurich time (`lib/domain/validity.ts`). That is a separate, optional change. Close S5 as rejected, with this reason.

**The regex guard:** see SF-2. It works on today's messages and it caught the original bug class (the coordinator's mutation proves it). It has false negatives for `{x, number}`, whitespace, and a bare use outside the plural. It should use the parser that is already installed, as a devDependency.

## Checked and correct

- **DE grammar:** `aus 1 Schweizer Laden` / `aus 2 Schweizer Läden` (dative after "aus"; "Schweizer" does not decline; the dative plural "Läden" takes no extra -n). `vor # Tag/Tagen`, `Vor # Woche/Wochen`, `Vor # Monat/Monaten` all use the dative correctly. `Vor kurzem` is a valid spelling. `auf # Läden` is accusative plural and correct. `in einem Laden` is dative and correct. `Dein Artikel ist` / `Deine 3 Artikel sind` / `verteilen sich` agree with their subjects. The du-form is consistent. No ß is used.
- **EN:** subject and verb agree in every branch. M1 is fixed ("ago" appears in every branch, and `=0` reads "recently").
- **`split_summary` with items=1 and stores>1:** this case cannot happen. `list/page.tsx` takes `stores` as the distinct stores of those items, and `ListDrawer` builds its groups from the items, so one item means one store. Ignoring `stores` in the `one` branch is correct. "Your item is cheapest here:" is followed by the one-store list in the drawer. items≥2 with stores=0 also cannot happen.
- **Call sites and argument names:** `stat` (deals, stores), `avg_off` (pct, count, where count is a number), `subline` (date, count), `split_summary` (items, stores) in both `list/page.tsx:80` and `ListDrawer.tsx:280`, and `aria_b_*` (store, n) in `AvailabilityStrip.tsx:190`. Every name matches. Type problems are only in MF-1. `stale_strip` still has no call site (B.3 orphan, still open for PM/TL). `show_n_deals` was already plural and gets a number from `FilterSheet.tsx:330`.
- **Other count strings in en/de:** the only remaining bare counts are `from_n_items` and `filters.reset`, both exempted with reasons that match spec B.3. The `b_header_*` keys use `{date}`, which is fine. The `age_short_*` abbreviations do not change for number, which is fine.
- **fr/it:** not touched and not routed. The EN↔DE key-parity test (`messages.test.ts`) passes. fr/it still have the "1 jours" bug, which is already flagged for the PM in B.3.
- **Freshness null for an invalid date:** both consumers already handle `null`: the strip shows `never_short` + `aria_b_never`, and the sheet shows `b_header_3plus` (SF-3). `formatDate` is never reached with an invalid date. No crash path.

## Final verdict: **Needs work**

One must-fix. MF-1 is a user-visible regression on the home hero ("NaN deals") in any week with 1,000 or more deals. The fix is two lines plus tests. After that: SF-1 and SF-2 in this branch (small), and SF-3 as a Designer copy follow-up. Re-review only MF-1, SF-1 and SF-2.

---

# Re-review: 0f423ff..0d16c5c (scope: MF-1, SF-1, SF-2, plus a ruling on SF-3)

What I checked myself: `vitest run src/messages src/lib/count-args.test.ts` gives 57 passing. `tsc --noEmit -p tsconfig.json` exits 0. The working tree is clean.

| Finding | Status | Evidence |
|---|---|---|
| **MF-1** counts passed as text | **Closed** | 655f091: `VerdictHero.tsx:40` passes `snapshot.totalDeals`, and `DealsClient.tsx:186` passes `filtered.length`. `plurals.test.ts:147-160` pins 1623 as `1,623 deals` / `1.623 Aktionen`, and 1234 for `subline`, in EN and DE. The new `lib/count-args.test.ts` scans the source for any count argument built with `toLocaleString(`, and a self-test checks the pattern against the defect. |
| **SF-1** share card stat | **Closed** | e560a18: the new key `share_verdict.card_stat` in EN and DE uses the same ICU forms as `home.stat` but without "Based on", so no new wording needs Designer sign-off. The route calls `createTranslator` with plain numbers. `locale` is limited to `'en'|'de'` at route.tsx:48. Tests are at plurals.test.ts:168. |
| **SF-2** parser-based lint | **Closed** | 0d16c5c: `@formatjs/icu-messageformat-parser` is pinned at 3.5.4 as a devDependency. The AST walk tracks which plural each element sits inside, so it flags a bare `{x}`, `{ x }`, `{x, number}`, a bare use beside the plural for the same name, and a count inside a select. `selectordinal` is also treated as a plural (it parses as a plural element). The parser rejects a plural with no `other` branch. The test checks that EN and DE use the same argument names for each key. It records why fr/it are not scanned. The "passes" cases cover the nested `{items}` used inside its own plural. The regex version is removed. |
| **SF-3** detail sheet shows "3+ months" for an unknown date | **Ruling: accepted as a tracked follow-up, not blocking** | This is not a regression. Invalid dates already reached `b_header_3plus` before this branch. The fix needs new Designer copy, which puts it outside a plurals branch. It must be written up as a ticket or flag, with TL.1 cited, and the Designer should write the copy before the code change. It stays open as a known concern under the Universal Resolution Loop. |

### New NITs (non-blocking)
- **N-5** `count-args.test.ts` checks one line at a time. It will miss a formatted count stored in a variable first (`const c = n.toLocaleString(); t('x', { count: c })`) or an argument split across lines. The runtime tests and the MF-1 regression rows cover today's call sites, so this is fine as is.
- **N-6** Running biome on the touched files reports organizeImports/format problems in `DealsClient.tsx` and `VerdictHero.tsx`, `noArrayIndexKey` in `card/route.tsx:108` and `VerdictHero.tsx:32`, and a format problem in `messages.test.ts`. All of these are on lines this branch did not change, and `messages.test.ts` is identical to main, so they predate the branch. Fix them in a separate style-only commit if wanted, not in this fix.

## Final verdict (re-review): **Approved. Ready to merge.**
There are no open MUST-FIX or SHOULD-FIX items left in this branch's scope. SF-3 is carried as a tracked follow-up.
