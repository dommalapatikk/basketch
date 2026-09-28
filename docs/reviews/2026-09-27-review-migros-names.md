# Code Review — Migros full-title names (deeec21..4bade65)

- Reviewer: Independent Code Reviewer (role `.claude/agents/code-reviewer.md`)
- Worktree: `.claude/worktrees/agent-a93682c65ace6ef3d`, commits 503397f, 7f3d8df, de05820, a424866, ce98026, 481f678, 4bade65
- Plan: `docs/rca/2026-09-26-tech-lead-migros-name-truncation.md` (§ Cross-review resolution, § Build review), `docs/rca/2026-09-26-architect-migros-name-cross-review.md` (A1–A4, G1–G7), QA `docs/qa/2026-09-27-qa-migros-truth-spot-check.md`
- Re-run: migros + port-contract + certification-label suites: 7 files, 287 tests pass. The truth JSON is byte-identical to deeec21 (`git diff --quiet`). `git status` was clean after every mutation.

## Verdict: NEEDS CHANGES (1 MUST-FIX, small)

The core work is sound. `collectTitleLines`, `joinTitleLines`, label lifting, the exact-name gate, the KW38 holdout and the KW36 golden edits all do what the plan says, and the tests are strong (4 of 4 behaviour mutations were caught, see below). The one blocker is an unapproved widening of R5 that makes the G6 guard vacuous for Migros.

---

## MUST-FIX

### MF-1 — `DANGLING_TAIL` goes beyond R5 and hides truncation from G6
`migros-flyer-source.ts:913`: `DANGLING_TAIL = /(?:[\s,;&-]+|(?:^|\s)(?:und|oder))$/`. It is labelled "(R5)".

- R5 (RCA line 103) strips only **`,` `;` whitespace**. The architect (cross-review line 37) explicitly refused a silent tail fix "because that would hide adapter defects", and made G6 the detector instead. Stripping `-`, `&`, `und` and `oder` is exactly that silent fix, done inside the adapter. It is not among the build review's accepted deviations (3, 4, 5).
- **Proof by mutation.** Set `TITLE_MAX_LINES = 1`, which brings the original truncation defect back. The exact-name gate goes red, but `port-contract.test.ts` stays **41/41 green**, because `cleanTitle` turns `Gesamte Ponti- und` into `Gesamte Ponti` and `Migros Kalbs-` into `Migros Kalbs` before G6 sees the name. G6 therefore cannot fail for Migros. On a new edition with no truth table, a cut title ships as a plausible wrong name instead of one that is visibly cut.
- **Cost of the fix is nil.** Narrowing to `/[\s,;]+$/` (R5 as written) fails only the 5 `cleanTitle` unit rows that encode the wider strip (`Migros Kalbs-`, `Reibkäse Emmentaler &`, `Gesamte Ponti- und`, `Knusprig oder`, `Alle ganzen Migros Bio und ,`). All 565 other collection tests stay green, including the KW39 91/91 gate, KW36 and KW38. The wide strip does no work on real data.
- **Fix:** restrict `DANGLING_TAIL` to `,` `;` whitespace. Change those 5 rows to assert that the name is **kept as is**, for example `Migros Kalbs-` stays `Migros Kalbs-`, which G6 then flags. Keep the `Alle ganzen Migros Bio und ,` row only for the comma part. If the Builder wants the wider strip, it needs a Tech Lead / Architect ruling first. It must not be decided in code.

---

## SHOULD-FIX

### SF-1 — Labels never reach the database (trace result)
`Offer.sourceAttributes.labels` is populated correctly (Migros adapter → `createSourceAttributes` → `createOffer`). Downstream, its **only** consumer is `hasPublishedData` (`source-attributes.ts:206`) → `run-snapshot.ts:98` (telemetry). `UnifiedDeal` does not carry `sourceAttributes` (`run-pipeline.ts:214-219`, where the comment says so), and no storage code or migration mentions labels. The lifted IP-SUISSE/AOP/MSC/Fairtrade values are therefore **dropped before the DB**. Denner's `eco_labels` already had the same gap before this change.

This is consistent with the plan: A1 says "kept as data" on the Offer, and "showing labels on the deal card" is listed as open/later. However, the RCA's phrase "With A1 nothing is lost either way" is only true in memory. In storage, Fairtrade and IP-SUISSE are now lost where they used to survive inside the name. **Action:** state this in the fix commit and open the follow-up ticket (persist `labels`, e.g. a `deals.labels text[]`), together with the existing "extractProductMetadata reads labels" follow-up. The PM should know that P-13 currently means "Fairtrade is not stored anywhere".

### SF-2 — The KW36 golden header does not record the QA sign-off
QA recommended recording the G2 PASS in the KW36 golden-master header (`migros-flyer-source.test.ts`). The header now says "checked BY EYE…" but gives no QA reference. Add one line citing `docs/qa/2026-09-27-qa-migros-truth-spot-check.md` § KW36.

---

## NIT

- **N-1** `SERVICE_PHRASES` entry `inSelbstbedienung` cannot be reached. `DESCRIPTOR` (unanchored `in\s+Selbstbedienung`) rejects any line containing it, both as the primary line (`:718`, `:833`) and as a continuation (`isNeverTitle`, `:781`), so the phrase never reaches `cleanTitle`. Only the no-space OCR form `inSelbstbedienung` could get through. Either keep it with a one-line note ("only the space-lost OCR form reaches here") or drop it.
- **N-2** The truth JSON's `verifiedBy` contains both "QA spot-check pending (G2)" and "independently spot-checked by QA (G2)". This is out of scope for the Builder, who must not edit the truth. Flag it to the Tech Lead to remove the stale "pending" in a truth-only commit.
- **N-3** `DANGLING_NAME_TAIL` in `port-contract.test.ts` duplicates the adapter regex. That is acceptable, since test independence is worth it, but after MF-1 the two will differ on purpose (the contract stays wide, the adapter narrow). A one-line comment saying so would prevent a future "sync" edit.
- **N-4** Width-per-char on very short line-1 texts (`Migros`, 6 characters) is the weakest signal, as the TL noted in deviation 3. No action now. If it misfires, add a minimum-length guard, as ruled.

---

## Checklist results

| Check | Result |
|---|---|
| DDD placement | ✅ `collection/domain/certification-label.ts` has **no imports** (pure). Service phrases, `SUSPENDED_HYPHEN_CONJUNCTIONS` and the closed list live in the adapter. Organic markers (Bio/Demeter/Knospe) are deliberately excluded (A2), with the reason in a comment. |
| `collectTitleLines` | ✅ width ≥ 0.84 **AND** (pitch ≤ 0.0125·H **OR** trigger). It stops at the first rejected line (`break`, never `continue`). The cap is 4. "Below" is decided by centres (≥ 0.5 × line-1 height), with a max-gap bound. The nearest line is taken by `y0` among x-aligned candidates only, so a mis-aligned line in between is correctly not the "next" line. |
| `joinTitleLines` order | ✅ normalise → conjunction → digit → closed list → lowercase-drop → uppercase-keep → space, matching A4 plus the build-review ruling. |
| Closed list `bleu/bleus`: right tool or smell? | **Right tool.** KW36 `Schweins-Nierstück-`/`steaks` and KW38 `Schweins-Cordons-`/`bleus` have the *identical* textual shape (a hyphenated compound, line-end hyphen, lowercase plural continuation) and need opposite outputs. No structural signal separates them. The distinction is lexical, so a lexicon is the correct data structure, not a special case. It is exact-word, punctuation-tolerant, and documented as "extend only on printed evidence". |
| `cleanTitle` idempotent / never empty | ✅ Checked by reasoning, including the all-label fallback: `IP-SUISSE` → `{IP-SUISSE,[IP-SUISSE]}` is stable on a second pass. A primary line cannot be a bare label (DESCRIPTOR/PROMO_BADGE filter it). Only empty input gives an empty result, and `createOffer` rejects that. |
| Labels → SourceAttributes → storage | ⚠️ They reach `Offer.sourceAttributes` through the domain factory. They are **not persisted** (SF-1). |
| `isOrganic` unaffected | ✅ `Bio` is never in `CERTIFICATION_LABELS`, and a test keeps organic markers in the name. |
| Exact-name gate honest | ✅ It compares against hand-read `expectedName` with no normaliser. Arrays are compared as sorted multisets. `ocrReads` replaces `expectedName` only on the 2 pinned keys (p1 13.97, p21 2.36), each with a reason. Rows without a truth row fail as `unmatched`. There are 89 named rows covering 91 names. |
| Port contract, all adapters | ✅ 7 adapters + KW39 Migros, pinned at 91 so the check cannot run silently empty. ⚠️ Vacuous for Migros until MF-1 is fixed. |
| KW38 fixture | ✅ OCR only (`pageNumber, engine, width, height, items{text,box}`), no images, no truth. It has 3 named regressions, a count pin of 76, and a validity pin. |
| KW36 golden edits vs QA | ✅ All 5 edits and both unchanged rows match the QA table exactly. The 6/11 label split matches. |
| Dead code | ✅ `joinNameParts`, `looksIncomplete` and `findContinuationLine` are gone, with no references left (grep). Comment density is in line with the rest of the file. |

## Mutations (each restored with `git checkout -- <file>`; `git status` clean afterwards)

| # | Mutation (`migros-flyer-source.ts`) | Caught by |
|---|---|---|
| M1 | `TITLE_MAX_LINES = 1` (reintroduces truncation) | 30+ tests: the exact-name gate, G5 labels, KW36 golden, KW38 holdout. **Not** by port-contract G6 (41/41 green). This is MF-1. |
| M2 | `KEEP_HYPHEN_LOWERCASE_CONTINUATIONS` emptied | unit (3b) + KW38 holdout p4 `Schweins-Cordons-bleus` |
| M3 | width alone (`if (!isBold) break`, dropping pitch/trigger) | the p14 `Milch,` near-miss unit, KW36 golden (17), the exact-name gate, Lindt Lindor, Optigal |
| M4 | removed the certification carve-out in `isNeverTitle` | the standalone-label unit, the KW36 label suite, the G5 label rows |
| M5 | `DANGLING_TAIL` narrowed to R5 | only the 5 wide-strip unit rows (evidence for MF-1) |

## Re-keying of about 31 products (downstream harm)

`product-resolve.ts` keys `products` on the exact `source_name` per store. On the first run, about 31 Migros names (plus KW36-shaped ones) create new `products` rows. The old rows stay, and their past `deals.product_id` links are untouched.

- **What references `product_id`:** only `deals` (baseline:119). `favorites`/`favorite_items` key on `keyword` + `product_group_id`, not `product_id`. `web/src` never reads `product_id`.
- **Harm:** (a) per-product deal history is split at the fix week for those products. Nothing user-facing reads it today. (b) The new rows need `product_group` assigned again. This is automatic via `product-group-assign`, but any **hand-curated** group on the old rows would not carry over. SRE/data should check the old rows for manual groups after the first run. (c) Orphaned old rows age out, and no migration is needed.
- The OPERATIONS NOTE for the SRE is present in commit de05820, as the plan required. ✅

**Net: no blocking downstream harm.** Fix MF-1 (about 10 lines, tests only get stricter), then this is approved.

---

## Re-review (2026-09-28): 2de4cbe (MF-1), bb0a6b1 (SF-2)

| Item | Status | Evidence |
|---|---|---|
| MF-1 | **CLOSED** | `DANGLING_TAIL = /[\s,;]+$/` (R5 as written), with a comment explaining why `- & und oder` stay visible. The 4 wide-strip rows now assert `cleanTitle(raw).name === raw`. The `Alle ganzen Migros Bio und ,` row now expects `…Bio und`. I re-ran M1 myself (`TITLE_MAX_LINES = 1`): port-contract now fails 2 tests (`migros`, `migros (KW39 PP-OCRv6)`), so G6 now catches it. Restored with `git checkout`, and status is clean. `collection` vitest: 767/767 pass. The truth JSON is still unchanged since deeec21. |
| SF-2 | **CLOSED** | The KW36 golden header cites `docs/qa/2026-09-27-qa-migros-truth-spot-check.md` (G2, 0 mismatches). |
| SF-1 | Moved out of this branch | Labels are not persisted. The coordinator is raising this with the PM as a product decision. It does not block this branch, but it must be tracked. |
| NITs N-1…N-4 | Open, non-blocking | Unchanged. |

**Verdict: APPROVED.**
