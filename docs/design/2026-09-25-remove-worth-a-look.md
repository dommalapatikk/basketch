# Design spec: remove "Worth a look this week" (Surface 3)

**Status:** Ready for Builder
**PM decision:** Remove the homepage section titled "Worth a look this week" / cold-start subtitle
"Strong deals across the basics" — 3 deal cards (Add / Not now / Don't suggest again) + "Show all 10".
Not re-opening whether to remove it — this spec covers what removal touches and how the page reads without it.
**Superseded design source:** `docs/design-3-new-surfaces.md` §3 (Surface 3) and its challenge doc no longer
describe shipped UI once this lands — mark both retired as a follow-up (not blocking Build).

---

## 1. Homepage after removal (mobile-first, 375px)

**Current flow:** StaleBanner → Hero (VerdictHero + CategoryVerdictCard list) → ShareVerdictButton →
`mt-8` Worth Picking Up section → `mt-20` MethodologyStrip (+ link to Hidden Suggestions).

**After removal:** StaleBanner → Hero → ShareVerdictButton → `mt-20` MethodologyStrip.

- No new component fills the gap. `MethodologyStrip` already carries its own `mt-20` top margin
  (`web-next/src/app/[locale]/page.tsx:63`), independent of whatever precedes it, so removing the
  WPU block does not collapse spacing or leave a smaller-than-intended gap — verify visually at
  375/768/1240px, but no class change is predicted.
- `ShareVerdictButton` can render `null` pre-hydration (`origin` not yet set — `ShareVerdictButton.tsx:29-31`);
  that null state already exists today with WPU present, so removing WPU does not introduce a new
  empty-gap case — same behaviour, one less sibling.
- **Information hierarchy is unchanged and, if anything, sharper:** the page now leads Verdict Hero →
  category verdicts → share → "how it works", a straight line to the core goal (per-item
  cheapest-store routing into a forwardable list) with no personalised-suggestions detour in
  between. This satisfies the subtraction test (Zhuo Q6 / Rams #10) — the section did not carry
  the core task, it was an adjacent discovery feature.
- No empty-state design is needed: the section already had a documented N=0 "calm-by-absence"
  behaviour (`WorthPickingUp.tsx:33`, `page.tsx:57` gates rendering on `candidates.length > 0`).
  Removal generalises that same state to 100% of visits instead of the cold-start subset — no new
  state to design.
- No heading/copy elsewhere needs adjusting: `MethodologyStrip`'s own heading/steps do not reference
  WPU. Only its footer link (§2 below) does.

## 2. Removal list (file : line)

### Delete entirely
| Path | Lines | What |
|---|---|---|
| `web-next/src/components/landing/WorthPickingUp.tsx` | 1–103 | whole file |
| `web-next/src/components/landing/WorthPickingUp.test.tsx` | 1–161 | whole file |
| `web-next/src/components/landing/WorthPickingUpCard.tsx` | 1–241 | whole file |
| `web-next/src/components/landing/WorthPickingUpCard.test.tsx` | 1–111 | whole file |
| `web-next/src/components/landing/WorthPickingUpClient.tsx` | 1–42 | whole file |
| `web-next/src/server/data/worth-picking-up.ts` | 1–304 | whole file (incl. `coldStartCandidates`, `inEffectCandidateRows`, `toPriceBasisOrNull`) |
| `web-next/src/server/data/worth-picking-up.test.ts` | 1–540 | whole file |
| `web-next/src/app/[locale]/settings/hidden/page.tsx` | 1–33 | whole file — exists only to serve WPU (`page_subtitle` in every locale explicitly says "Restore any to see them again in Worth picking up") |
| `web-next/src/app/[locale]/settings/hidden/HiddenSuggestionsClient.tsx` | 1–128 | whole file |
| `web-next/src/app/[locale]/settings/hidden/` | — | remove the now-empty directory (route disappears: `/settings/hidden` should 404) |

### Edit
| Path | Lines | Change |
|---|---|---|
| `web-next/src/app/[locale]/page.tsx` | 6 | remove `import { getWorthPickingUpCandidates } from '@/server/data/worth-picking-up'` |
| `web-next/src/app/[locale]/page.tsx` | 13 | remove `import { WorthPickingUpClient } from '@/components/landing/WorthPickingUpClient'` |
| `web-next/src/app/[locale]/page.tsx` | 25–27 | remove the `wpu` comment block + `const wpu = await getWorthPickingUpCandidates(...)` |
| `web-next/src/app/[locale]/page.tsx` | 57–61 | remove the `{wpu.candidates.length > 0 && (...)}` block |
| `web-next/src/components/landing/MethodologyStrip.tsx` | 1, 7, 34–38 | remove `tHidden` translations import usage, the `const tHidden = useTranslations('hidden_suggestions')` line, and the `<p><Link href="/settings/hidden">...</Link></p>` block. `Link` import (line 3) stays only if another link in this file still needs it — currently it does not, so remove the `Link` import too once this is the only usage. |
| `web-next/src/app/[locale]/page.test.tsx` | 39–43, 64–73 | remove the `getWorthPickingUpCandidatesMock` + its `vi.mock('@/server/data/worth-picking-up', ...)`, and the `describe('HomePage wires WeeklySnapshot.today into getWorthPickingUpCandidates', ...)` block — this test's entire purpose was proving `page.tsx` forwards `today` into a function that no longer exists |

### Copy keys — remove from all 4 locale files
| File | `worth_picking_up` block | `hidden_suggestions` block |
|---|---|---|
| `web-next/src/messages/en.json` | lines 197–222 | lines 223–235 |
| `web-next/src/messages/de.json` | lines 197–222 | lines 223–235 |
| `web-next/src/messages/fr.json` | lines 80–105 | lines 106–118 |
| `web-next/src/messages/it.json` | lines 80–105 | lines 106–118 |

(Confirm exact closing-brace line with the file at edit time — line numbers above are from the
current file state and will shift if either JSON file is touched by another change first.)

### Keep — shared, do not remove
- **`user_interest` table.** Written by `AvailabilityCellSheet.tsx:135` for the Surface 2
  "Notify me" flow (unrelated feature, different signal). Only WPU's own reads/writes against it
  (the interest-count gate in `worth-picking-up.ts:134-138`, and the three `TODO` write comments in
  `WorthPickingUpClient.tsx`) go away with the files above — the table and the Notify-me writer stay.
- **`worth_picking_up_candidates` materialised view** (Supabase). This is a DB object, not a
  frontend file, so it is out of Designer/Builder scope for this pass — flag it to Tech Lead as a
  candidate for a follow-up migration to drop it, since after this change nothing reads it. It is
  still referenced by the pipeline's view-refresh list (`pipeline/v3-cutover.ts:225`,
  `pipeline/migrate/fix-dairy-miscategorisation.ts:135`, `pipeline/migrate/seed-v3-from-deals.ts:256`)
  — removing it from those lists is part of that same follow-up, not this one.
- **`PriceConditionNote` pattern, `formatMemberPriceLabel`/`formatMinQuantityLabel`, `PriceBasis`
  domain type** — all shared with `components/deals/DealCard.tsx` and the wider deals surface. Not
  touched by this removal; `WorthPickingUpCard.tsx`'s own copy of the note component dies with the file.
- **`/deals` route, `Header.tsx` nav link to it (`Header.tsx:31`), `VerdictHero`'s link to it, filters,
  `DealCard`** — entirely unaffected.

## 3. What the user loses, and coverage

- **Personalised re-surfacing of previously-added items ("worth picking up this week").** Not
  covered elsewhere — this was a real feature (score-ranked MV, `personal` mode), currently unused
  in production (`page.tsx:26` comment: "Solo project: no email yet, so always cold-start" — the
  personal path has never actually served a user). Loss is theoretical today, real if email capture
  ships later; note for PM if that roadmap item returns.
- **Cold-start "top discount this week" discovery (the 3 cards actually shown today).** Partially
  covered: `/deals` is reachable from `Header.tsx:31` (persistent nav) and `VerdictHero`'s own link,
  so discount browsing is not lost entirely. But `/deals` has **no sort-by-discount control**
  (checked `web-next/src/lib/filters.ts`, `DealsClient.tsx`, `FilterSheet.tsx` — filtering only, by
  category/store, no ordering by `discount_percent`) — a user can no longer land on "here are the
  single best discounts this week" without filtering category-by-category. This is a real, if minor,
  discovery gap against the core goal's supporting job (not the core goal itself, which is per-item
  cheapest-store routing and is untouched). Flag to PM/Tech Lead as a possible future `/deals`
  default-sort-by-discount, not part of this removal.
- **Hidden-suggestions management UI.** No loss — it only existed to undo WPU's own dismiss actions.

## 4. Side observation (data quality — not a design fix, log for pipeline team)

PM's screenshot showed a Migros card with product name `"coffeebkaffeemaschineglobe"` (garbled/concatenated,
not a real product name) and an empty grey image slot (no product photo resolved). This is a data-quality
defect in the collection/normalisation pipeline (name concatenation + missing `image_url`/crop), not a UI
bug — `WorthPickingUpCard.tsx:91-104` already renders the empty-image case correctly (grey placeholder,
`aria-hidden`, no broken `<img>`). Record for the pipeline team; not something this removal needs to fix,
and moot once the section is removed, but the underlying defect can surface anywhere else the same
product/image resolution is reused (e.g. `/deals` `DealCard`) so it should still be tracked.

## 5. Acceptance criteria

1. `/settings/hidden` returns 404 in all 4 locales.
2. Homepage renders with no "Worth a look" / "Worth picking up" section in either cold-start or
   (hypothetical) personal mode — there is no code path left that can render it.
3. `MethodologyStrip` renders with no link to Hidden Suggestions; its 3-step content is unchanged.
4. No unused-import or unused-translation-key lint/type errors: `worth_picking_up` and
   `hidden_suggestions` namespaces removed from all 4 `messages/*.json`, and `web-next` `tsc --noEmit`
   clean (run via `web-next`'s own binary per CLAUDE.md — not `npx tsc` from repo root).
5. No remaining import of `@/server/data/worth-picking-up`, `@/components/landing/WorthPickingUp*`,
   or `HiddenSuggestionsClient` anywhere in `web-next/src` (`grep -rn` should return nothing outside
   this spec and, if kept, `docs/design-3-new-surfaces.md`).
6. `user_interest` table and `AvailabilityCellSheet`'s Notify-me flow are untouched and still pass
   their own tests.
7. Full `web-next` test suite green (`cd web-next && npm test`); no leftover WPU test doubles in
   `page.test.tsx`.

## 6. Tests to update/delete (TDD order)

Delete-first, since this is subtraction, not new behaviour — there is no new test to write before
the code; the test *is* the spec for what must no longer exist:

1. **First:** `web-next/src/app/[locale]/page.test.tsx` — remove the WPU-wiring `describe` block
   (lines 64–73) and its mock (39–43) *before* touching `page.tsx`, so the suite fails for the right
   reason (missing module) the moment the import is deleted, confirming nothing else in `page.tsx`
   secretly depended on `getWorthPickingUpCandidates`'s mock shape.
2. Delete `WorthPickingUp.test.tsx`, `WorthPickingUpCard.test.tsx`, `worth-picking-up.test.ts` — no
   replacement; the units they tested are gone.
3. Re-run `cd web-next && npm test` — confirm the count drops by exactly the deleted tests' count and
   nothing else goes red (a red elsewhere means a hidden dependency this spec missed).
4. Re-run `cd web-next && ./node_modules/.bin/tsc --noEmit -p tsconfig.json` — confirm zero errors
   (catches any remaining import of the deleted types, e.g. `WorthPickingUpCandidate`).
5. No new component tests are needed — nothing new was built.
