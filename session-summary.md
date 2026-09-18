# basketch — session summary

**Dates:** 2026-09-15 → 2026-09-18
**State at close:** working tree clean, 0 unpushed commits, `main` = `056b0e0`.
**Site:** live and healthy — 1,997 active deals across all seven retailers, prices
rendering, valid through 2026-09-23.

---

## 1. What this session was

The PM's instruction on 2026-09-15 set the method for everything that followed:

> "fix all, 3 api key is valid move it in right place, 5 update it with limits and
> gardrails set. 6-9 fix it. before fixing do root cause anylsis and invluce
> arctect, tech lead and for fix engineer agents and always follow ddd and tdd"

So: RCA first (architect + tech lead, independently, then cross-reviewed), then
builders, then a code-review loop to zero open findings. Every gate re-measured by
the coordinator rather than taken from an agent's report.

Authoritative plan: `docs/rca/2026-09-15-final-plan.md` — decisions AP-1…AP-11,
TP-6…TP-10, Tech Lead rulings D1–D6, 20 work packages in three lanes.

---

## 2. Work packages — 19 of 20 merged and pushed

**Shipped earlier in the session:** #3 starter-pack removal, #4 key move, P1 stale
sweep, W2 validity + member prices, C1 Migros parser, P2 composition root, W3 views,
C2 rappen discounts, P3 deadline/exit codes, P4 retire legacy aktionis, P6 judge
concurrency, P6a cache uncertain, C3 Coop names, P5 ModelGate, C4
QuantityRequirement, W4 "from 2 items", P7 run journal, P8 spend guard, image fixes.

**Shipped 2026-09-17/18:**

| WP | What | Commit |
|---|---|---|
| **P9** | Enrichment completion — `attributes_version` | `c724a5a` |
| **J1** | Each retailer names its own publication (`editionFor`) | `2181731` |
| **W5** | The missing German sub-category labels | `056b0e0` |

**Not built:** J2 (fetch ledger), J3 (collect/transform split + daily cron),
T1 (taxonomy divergence — fully designed and cross-reviewed, ready to build).

---

## 3. Key decisions made by the PM

Recorded in full in `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`.

- **PM-1 — general merchandise is grouped, not promoted.** Fixing the taxonomy gives
  a browse chip to ~28% of the catalogue (227 toys, 91 clothing, appliances, books,
  stationery). These go under one `general-merchandise` group rather than becoming
  top-level chips beside Dairy and Bakery — basketch is a grocery comparison, and
  equal weighting would change what the product appears to be. **Constraint: the
  grouping must be expressed in `BROWSE_CATEGORIES` itself, not as a frontend
  translation layer** — that would be a sixth copy of the vocabulary, which is the
  bug being fixed.
- **PM-2 — the German labels ship now, on their own.** Done, `056b0e0`.
- **PM-3 — the 11,206 historical rows are deferred, not decided.** The Tech Lead's
  `NOT VALID` ruling removed the need for the decision entirely.
- **Push the held commits** (2026-09-17): the PM confirmed the OpenRouter USD 5
  monthly cap was set, and authorised pushing the 41 held commits (P6/P7/P8/P9).
- **Open, flagged, not decided:** `coffee-tea` ceasing to be a category; category
  chips being invisible at the default `?type=all`; `body-care`/`personal-care` both
  rendering "Körperpflege".

---

## 4. Verified data points (all measured against production, not inferred)

| Fact | Value | When |
|---|---|---|
| Active deals | 1,169 (1,997 incl. all windows) | 2026-09-17 |
| Deals with NO `category_slug` | **561 / 1,169 = 48.0%** | 2026-09-17 |
| `taxonomy_alias` rows vs taxonomy | 28 vs ~90 sub-categories | 2026-09-17 |
| `taxonomy_category` rows vs code | 17 vs 22, only **7 names in common** | 2026-09-17 |
| Total deals table | 26,371, of which **11,206 (42.5%)** have no category | 2026-09-17 |
| Deals under an English heading on `/de` | **585 / 1,169 = 50%** | 2026-09-17 |
| `attributes_version` backfill | 437 of 2,414 stamped (18.1%), 0 wrongly | 2026-09-17 |
| Null-category rate by store | coop 57.4%, aldi 48.8%, lidl 35.1%, denner 21.3%, volg 13.6%, spar 13.0%, migros 7.7% | 2026-09-17 |

---

## 5. The bug that defined 2026-09-17: taxonomy divergence

**Two taxonomies exist and have diverged.** `BROWSE_CATEGORIES` in `shared/types.ts`
(22 categories, ~90 sub-categories) is what the classifier is told to use.
`taxonomy_category` + `taxonomy_alias` in the database (17 + 28 rows, seeded
2026-04-25, never touched since) is what actually gets written to `deals.category_slug`.
Only 7 names appear in both. `coffee-tea` is a *category* in the DB and a
*sub-category* in code — they disagree about hierarchy, not just names.

**The real root cause is older than it looked.** `classify-deals.ts:372` does
`category: topCategoryFor(fields.category)` — the classifier's browse category,
already validated, is collapsed to `fresh`/`long-life`/`non-food` and the browse id
is **discarded**. `run-pipeline.ts:839` then reconstructs it from the *child*
(`sub_category`) through the stale alias table. `dealToRow` (`shared/types.ts:961`)
**already writes `category_slug`** and needs no change. So the fix is to stop
discarding the answer, not to seed missing rows.

**Two blockers the cross-review caught, both verified against production:**
1. The planned `DELETE FROM taxonomy_category` would have hard-failed on an FK
   violation every time — 20 `taxonomy_subcategory` rows still point at the 7 doomed
   parents, and the same plan elsewhere decided to keep exactly those rows.
2. A cleanup estimated at "under 50 rows" is **11,206 of 26,371** (224× off). The
   migration would have halted at its own escalation gate, on migration night.

**A schema drift neither started with:** `deals_category_slug_fkey` is **live in
production but absent from a database rebuilt from this repo**. `baseline.sql:87`
declares the column with no FK and sorts first, so `20260425`'s
`ADD COLUMN IF NOT EXISTS … REFERENCES` is a total no-op — REFERENCES clause
included. Any design validated against the repo schema was validated against a
schema production does not have.

**Both sides conceded in writing.** The Tech Lead withdrew the NOT NULL objection and
the "no cheaper fix" argument; the Architect conceded the FK it had missed and
redesigned around it. `CHECK (…) NOT VALID` replaces `SET NOT NULL` — it enforces on
every INSERT/UPDATE without scanning or deleting a historical row, which **removed a
product decision instead of escalating one**.

Docs: `docs/rca/2026-09-17-architect-taxonomy-divergence.md` (1,138 lines),
`docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md` (1,119 lines, CR-0…CR-12).

---

## 6. Pipeline run 35207519113 (2026-09-17) — failed, and why

Failed at the 60-minute wall, but **published 1,148 deals first**, so the site was
never affected.

| Phase | Duration |
|---|---|
| Collection, all 7 retailers | **49 seconds**, 2,060 offers — healthy |
| Classify chunk 1 | 1,295.8s (classify+judge 1,172.5s) |
| Classify chunk 2 | 1,142.0s |
| **Deadline fires before chunk 3/11** | P3 worked exactly as designed — 837 of 1,037 deferred |
| **Backfill — 17 minutes, unbounded** | ← the killer, in nobody's arithmetic |
| Deal upsert | 1,148 of 1,189 written |
| Killed at the wall | tail never finished |

The deadline fired correctly and then handed control to a phase that ignored it —
the same defect class as P3's write tail, one layer along. **Closed by WP-P9's
MUST-FIX 3**, now merged: the backfill breaks on the deadline and sets `deadlineHit`,
so `finishRun` returns exit 75 instead of exit 0.

**Still open:** `MAX_CHUNK_MS` is stale — chunk 1 took 21.6 min against a 19.5 min
constant, and the code warned about itself in the log. Cannot be honestly re-measured
until P6's judge concurrency has actually run. **Re-measure after the 2026-09-21 run.**

---

## 7. Three tests that could not fail

Found and killed during WP-W5, **each by mutation rather than by reading**, and every
one written while fixing the previous finding:

1. The unknown-locale test used `'toys'`, whose English label is byte-identical to
   `titleCase('toys')` — it passed whether the map lookup or the fallback ran. A
   mutant returning `{}` for unknown locales survived it.
2. Rewriting test 5 behaviourally gained an arbitrary-fallthrough case and **silently
   lost the whitespace case**: `'  '` is truthy, so output equals data. A
   whitespace-only label renders an *invisible chip*.
3. A dead first assertion in the `/en` test, same tautology as the first.

Also found in WP-J1: `iso-week.test.ts:119` is a control, not a discriminator — it
cannot fail against the UTC mutation it sits beside. Now labelled.

**The systems lesson, recorded:** a green suite is evidence that nothing is broken,
not that anything is guarded. Only breaking the code on purpose distinguishes them.
`shared/types.test.ts:36`'s count tripwire *fired* at `dc9a0a4` and was updated in
the same commit — which is why set assertions replaced count assertions.

---

## 8. Other findings worth keeping

- **The documented type-check command never worked.** `npx tsc --noEmit -p
  pipeline/tsconfig.json` from the repo root fetches an unrelated package that prints
  a joke and exits 0 — no root `node_modules`. Every "tsc clean" report using it
  verified nothing. Fixed in `CLAUDE.md` (`68393f9`); use the folder-local binary,
  and never pipe in a way that swallows the exit code.
- **Credential audit (2026-09-18).** `.env` was never committed; the Sept-10 backup
  files are gone; `.claude/worktrees` and `web-next/.env.local` are gitignored. The
  only key-shaped string in git history is a Google Maps key inside a captured Coop
  page fixture — not the PM's.
- **`GOOGLE_AI_API_KEY` in GitHub was dead.** The PM had rotated it at Google after
  it was pasted into a CLI session, but GitHub still held the Sept-10 value. Updated
  2026-09-18 09:03 from `.env`; local key verified HTTP 200. **Without this, Monday's
  run would have degraded silently, not crashed.**
- **`OPENAI_API_KEY` sits in `.env` and nothing reads it** — not the pipeline, not
  the frontend, not the workflows. A second paid-service credential outside the
  one-paid-service rule. The two `VITE_*` vars are dead (archived frontend).
- **`OPENROUTER_API_KEY` in GitHub is still dated 2026-09-10.** If it was ever
  rotated, it has the same silent-failure problem the Google key had. Unverified.

---

## 9. PM actions completed this session

- ✅ OpenRouter USD 5 **monthly** cap set (auto top-up off)
- ✅ `HEALTHCHECK_PING_URL` added to GitHub secrets (2026-09-18 08:40)
- ✅ Google AI key rotated at Google; GitHub secret updated 2026-09-18 09:03

## 10. Still pending

**For the PM:**
1. **Verify `OPENROUTER_API_KEY` matches** what's at openrouter.ai — GitHub's copy is
   from 2026-09-10 and unverified. Same one-command fix as the Google key.
2. **AP-6 decision — recommendation given, awaiting go-ahead:** score
   `benchmarkMacroF1` against **Denner's live data** (free, every run, self-updating)
   rather than the 291-row benchmark. Until then two alerts stay wired-but-silent and
   `instrument-missing` fires every run.
3. Consider dropping `delete_repo` from the GitHub token scopes — nothing here needs it.
4. `COLLECTION_MODE` repo variable is inert — delete whenever, or never.
5. Optional: remove the unused `OPENAI_API_KEY` and the two `VITE_*` lines from `.env`.

**Work packages:**
- **T1 — taxonomy divergence.** Designed, cross-reviewed, blockers resolved, PM
  decisions taken. Biggest remaining change: touches a live DB with a migration.
  Build order is in the two RCA docs; steps 0–2 fix the site before any pipeline code
  ships. **Recommended to start with fresh context, not at the tail of a session.**
- **J2** fetch ledger → **J3** collect/transform split + daily cron. Tech Lead's
  ruling: order is `J1 → T1 → J2 → T2 → J3`; J3 does not lose its slot to T1, because
  availability outranks browsability.

**Carry-forwards:** AP-11 judge re-benchmark; the nine self-skipping e2e assertions;
~11 built-but-never-wired units from the audit; README staleness; `collectOffers`
rejects rather than contains on an Invalid Date (guard before J3 adds a caller that
can supply one); ALDI's dual-cycle bundling is not fixture-backed; `shared/` has no
type-check or lint gate; retarget the W5 guard at T1's generated `.sql`.

---

## 11. The next thing that matters

**Monday 2026-09-21, 07:00 UTC** — first run carrying everything: the funded judge,
the spend guard, bounded backfill, per-retailer publication weeks, and a valid Google
key. If it publishes cleanly the five-run outage is closed. The healthcheck will
email if it never runs at all.

After it: **re-measure `MAX_CHUNK_MS`** against the real judge-concurrency numbers.

---

## 12. File paths

- Plan: `docs/rca/2026-09-15-final-plan.md`
- Taxonomy RCA: `docs/rca/2026-09-17-architect-taxonomy-divergence.md`,
  `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md`
- PM decisions: `docs/decisions/2026-09-17-pm-taxonomy-decisions.md`
- ADRs: `docs/decisions/2026-09-17-attributes-version.md`,
  `docs/decisions/2026-09-17-publication-editions.md`
- Audit/QA: `docs/rca/2026-09-16-ddd-tdd-audit.md`, `docs/qa/2026-09-16-live-data-qa.md`
- Longer-term context: `HANDOVER.md`
