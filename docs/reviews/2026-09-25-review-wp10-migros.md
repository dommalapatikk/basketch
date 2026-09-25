# Code Review: WP-10 Migros OCR (Fix A + Fix B)

**Date:** 2026-09-25 · **Reviewer:** Independent Code Reviewer · **Scope:** commits `dec9dbd`, `abceb00`, `d873fee` on `worktree-agent-a93682c65ace6ef3d`
**Spec:** `docs/rca/2026-09-25-tech-lead-migros-ocr.md` (tech-lead RCA, WP-10)
**Final verdict:** **Needs work.** 5 MUST-FIX, 9 SHOULD-FIX, 8 NIT. One of the MUST-FIXes is a production blast-radius problem in `pipeline.yml`, which is why the workflow is marked Blocked.

---

## Summary

| File | Verdict |
|---|---|
| `.github/workflows/pipeline.yml` | **Blocked** (MF-1) |
| `pipeline/collection/infrastructure/migros/ocr.py` | Needs Changes (MF-4, SF-5, NIT-4) |
| `pipeline/collection/infrastructure/migros/migros-flyer-source.ts` | Needs Changes (MF-5, SF-2, SF-3) |
| `pipeline/collection/infrastructure/migros/migros-kw39-ground-truth.test.ts` | Needs Changes (MF-2, MF-3, SF-1) |
| `pipeline/collection/infrastructure/migros/requirements.txt` | Needs Changes (SF-6) |
| `pipeline/collection/infrastructure/migros/test_ocr.py`, `test_ocr_recognition.py` | Approved, with NITs |
| `pipeline/collection/infrastructure/live-sources.ts` (+ test) | Approved, with a NIT |
| `__fixtures__/kw39/*`, `__fixtures__/kw39-crops/*` | Approved (checked byte for byte, see concern 3) |

### What I ran

- **Vitest, branch.** The migros and live-sources suites pass: 158 tests.
- **Vitest, merged tree.** I materialised `git merge-tree eeb2a0e d873fee` in scratch and ran the full pipeline suite: **76 files, 1565 tests pass.** `tsc` shows no errors in project files.
- **Pytest.** I used a fresh Python 3.12 venv in scratch with `requirements.txt` and pytest, plus an EMPTY model dir, so the models downloaded live from modelscope.cn. Result: **29 passed in 27.8 s**, download included.
- **Ground-truth score.** I scored every KW39 offer independently of the test file: **88 published / 85 correct / 2 wrong name / 1 wrong price.** The builder's claim reproduces exactly.
- **Fix B on the old OCR fixture.** I ran the new parser on the OLD-engine fixture (`ocr-kw39-zh-rapidocr144-production.jsonl`): 57 published / 54 correct / 3 wrong, against production's 56 / 43 / 13. Fix B generalises across OCR engines. That is a genuinely good result.
- **Mutations.** I ran 6 mutations plus 4 exploratory variants. Every mutation was applied in place and restored with `git checkout -- <file>`. `git status` is clean at the end, HEAD is `d873fee`.
- **Failure paths.** I ran `ocr.py` against (a) a corrupted cached model and (b) an empty model dir with the network blocked.

### What is well done

- **Fixtures are honest.** `kw39-zh-truth.json`, `ocr-kw39-zh-ppocrv6.jsonl` and `ocr-kw39-zh-rapidocr144-production.jsonl` are **byte-identical** (`cmp`) to the tech lead's originals in `.claude/worktrees/tl-ocr-bench/fixtures-for-builder/`. The truth table was not edited to fit the algorithm.
  - The only crop change is `p1-Don_Pollo_Poulet_N.png`, trimmed 8 px (y1 1976 → 1968). It is documented in the manifest and is the remedy the RCA itself named ("pad that crop or drop it").
- **Fix B is a real improvement.** On PP-OCRv6, wrong names drop 17 → 2. On the old engine they drop 13 → 3.
- **The runtime failure path is contained.** If `ocr.py` exits non-zero, `execFile` rejects. `fetchOffers` catches that and returns `collectionFailed('migros', 'source-unavailable', …)` (`migros-flyer-source.ts:1279-1283`), and the other six retailers carry on.
- **Exact pins resolve identically.** They do on Python 3.12 in my venv as well.

---

## Rulings on the coordinator's 7 concerns

### 1. Blast radius. **Confirmed: a failure takes down all 7 retailers (MF-1).**

- **The CI step.** `pipeline.yml:94-99` ("Run Migros OCR pytest suite") has no `continue-on-error`, and it sits before "Categorize and store" (`:101`).
  - Any pytest failure stops the job and **nothing is published for any retailer.** Causes include a modelscope.cn outage on a cache miss, a flaky recogniser assertion, or a pip or PyPI blip on `pip install pytest`.
  - That violates the principle every other part of the pipeline follows: one source failing is a `CollectionResult`, not a dead run.
- **The runtime path is contained.** With modelscope.cn down, `ocr.py` exits 1 with a `DownloadFileException` traceback. I verified this with the network blocked and an empty model dir. The TS adapter turns that into a Migros-only `source-unavailable`. Only Migros fails.
- **Correct design:**
  1. **Move the pytest gate to `ci.yml`**, as a new `pipeline-python` job next to the existing vitest job. There it gates the merge, which is where a test belongs, not the Thursday publish.
  2. **In `pipeline.yml`, keep at most a best-effort model warm-up**, with `continue-on-error: true`. A miss then degrades to "Migros fails at runtime", which is already handled.
  3. This deviates from the literal wording of RCA §5 item 4 ("pipeline.yml … also add pytest"), so the Tech Lead should confirm it.
- **Pre-existing, not introduced here (SF-follow-up):** "Install Migros OCR dependencies" and "Verify the OCR runtime imports" (`:70-74`) already have the same all-retailer blast radius. Give them `continue-on-error: true` too, because a missing rapidocr is already a Migros-only runtime failure.

### 2. Is modelscope.cn OK, and is the cache right? **Allowed, but the cache design has two defects (SF-4).**

- **modelscope.cn is allowed.** It is free, needs no account or key, and serves Apache-2.0 PaddleOCR models, so it does not breach the free-tier rule. It is a model host, not a retailer, so AP-1 is not engaged. It was reachable from here, and a fresh 31.7 MB download fit in the 28 s pytest run.
- **Its risk is availability.** It is a single host, rapidocr's `DownloadFile` has a 60 s timeout, and there is no retry. Optionally, a free mirror (a GitHub Release asset in this repo, still SHA-verified) removes the single point.
- **Cache defect (a): it only saves on job success.** `actions/cache@v4` saves in its post-job step only if the job succeeds. A run that fails later (a critical alert, or exit 1) throws away the freshly downloaded models, and the next run downloads again.
  - Fix: use `actions/cache/restore` plus an explicit `actions/cache/save` right after the models are verified.
- **Cache defect (b): the key is a hand-typed literal.** `pipeline.yml:87` is `rapidocr-migros-models-090f04ab-6f327246-e47acedf`. It duplicates `PINNED_MODELS`; it is not derived from it. The comment at `:79-80` ("if the pin ever changes, the key changes too") is false.
  - A stale key cannot serve a wrong model: rapidocr re-downloads a mismatched file, and `verify_pinned_models` re-checks it. But because the key is an exact hit, the cache is never re-saved, so every run re-downloads silently.
  - Fix: `key: rapidocr-migros-models-${{ hashFiles('pipeline/collection/infrastructure/migros/ocr.py', 'pipeline/collection/infrastructure/migros/requirements.txt') }}`.
- **Path.** `${{ runner.temp }}` is valid in both `with:` and step `env:`. The weekly Mon/Tue/Thu cadence stays inside the 7-day eviction window.

### 3. Is the page-19 "wrong price" really a truth-table gap? **Yes, and it is bigger than stated (SF-1). The test itself has two honesty problems (MF-2, MF-3).**

- **The gap is a whole page.** Page 19's OCR has **6** statt anchors, while the truth table has **0** entries for page 19 (its `note` says "Page 19 carries no statt-priced offer"). Every other page's anchor count is roughly consistent with its truth count. The six:
  - 8.10 statt 11.60 (Nivea)
  - 9.70 statt 16.24 (Tempo)
  - 5.60 statt 7.– (pH Balance)
  - 4.– statt 5.40 (I am)
  - 4.05 statt 5.85 (Haarpflege/Styling)
  - 3.71 statt 4.95 (Ceylor/Cosano/Feelgood)
- **The one published page-19 offer is correct.** It pairs "Gesamtes Ceylor-, Cosano- und Feelgood-Sortiment" with 3.71/4.95: text at x 926-1745, y 2631; statt at x 925-1298, y 2707; and a "25%" badge (4.95 × 0.75 = 3.71). So "wrong price" is a scoring artefact, not a defect.
- **Integrity: confirmed.** The truth json is byte-identical to the tech lead's file.
- **But the test is weaker than the RCA asked for.** See MF-2 (the ratchet is so loose that deleting `PROMO_BADGE` passes) and MF-3 (a test pins a known defect as "correct").
- **Two of the RCA's five named regressions are unmet, not one.** Schweinshalssteaks p4 is the one the builder reported. The second is 2.80 statt 3.50, which should be Rindssiedfleisch: it is **withheld**, and the test asserts that as correct behaviour.

### 4. Is Fix B (`detectColumnBoundaries`) correct and robust? **Better than before on the fixtures, but tuned to them, and not unit-tested (MF-5, SF-2, SF-3).**

**Edge cases (probed directly):**

| Input (x-centres, width 2199) | Bounds | Assessment |
|---|---|---|
| `[]` | `[0, 2199]` | OK (never reached in practice) |
| `[1587]` (single anchor) | `[0, 2199]` | **Whole page.** The old code gave the right half. A regression on sparse pages (SF-3). |
| `[216, 902, 1587]` (clean 3-col) | `[0, 559, 1245, 2199]` | OK |
| `[216, 902, 1244, 1587]` (KW39 real, mixed 2-up/3-up rows) | `[0, 730, 2199]` | **3 columns collapse to 2.** The right tile is 2/3 of the page, wider than the old half split. |
| `[300, 1400]` (2-col) | `[0, 850, 2199]` | OK |
| KW36 p2-p5 | `808`, `882`, `788`, `731` single split | OK (2-col) |

**Robustness:**

- **Columns change from row to row.** KW39 rows alternate between 2-up offers (price x ≈ 216 / 1245) and 3-up offers (x ≈ 216 / 902 / 1587). Page 4 shows it: row 1 has 5.95 at x 102 and 10.95 at x 1141, and row 2 has 7.95 / 2.80 / 1.65 at x 108 / 783 / 1518.
  - Page-level clustering therefore chains 902 → 1244 → 1587 into one group on **p4, p5, p6, p11, p22**.
  - On **p16 and p20** there are only two groups, and the right tile spans roughly two-thirds of the page.
  - The header's "KNOWN LIMIT … on some rows" (`migros-flyer-source.ts:578-592`) understates this: it is the common KW39 layout.
- **The threshold is fitted between the two fixtures:**

| `COLUMN_GAP_FRACTION` | KW39 result | KW36 golden master |
|---|---|---|
| 0.14 | 79 published / **0 wrong names** | **breaks (7 tests fail)** |
| 0.2 (shipped) | 88 / 2 | passes |
| 0.3 | 76 / **18 wrong** | passes |

  Nothing measures a third layout.
- **No simple alternative did better.** I also tried a naive per-row clustering prototype (row tolerance 2-4% of height), and it was **worse** (6-8 wrong names), because lone-anchor rows fall back to the whole page. So the shipped variant is the best simple one measured. It needs honest documentation and the RCA §8 `wrongPairingSuspected` tripwire (not implemented; grep finds nothing).

**Mutations (do the tests catch regressions?):**

| # | Mutation | KW39 score | Tests |
|---|---|---|---|
| M1 | `tileFor` reverted to the half-page split | 79 / 64 / 15 wrong | **7 fail** (caught) |
| M2 | `PROMO_BADGE` disabled | 88 / 83 / **4 wrong** ("BIOSUISSE" becomes the name for Patatli p2 and Tofu p3) | **all 119 pass (NOT caught)** |
| M3a | gap 0.2 → 0.14 | 79 / 78 / 0 | 9 fail (caught, by KW36) |
| M3b | gap 0.2 → 0.3 | 76 / 57 / 18 | 4 fail (caught) |
| M5 | a single group falls back to the half split | 88 / 85 / 2 (neutral) | all pass (single-group behaviour untested) |
| M6 | en dash removed from `PRICE_TOKEN_SRC` | 88 / 85 / 2 | **all pass (NOT caught)** |

M1 and M3 show the ground-truth gate catches gross regressions. M2 and M6 show that the `PROMO_BADGE` half of Fix B and the regex half of the en-dash change are unguarded.

### 5. Python: SHA256 checks, missing or corrupt files, pytest. **Mostly sound; two gaps (MF-4, SF-5).**

- **Corrupt cached file.** I corrupted `PP-OCRv6_det_small.onnx` in place. rapidocr logged "File exists but is invalid, redownloading", fetched a good copy, `verify_pinned_models` passed, and OCR returned "Brita Wasserfilter Maxtra Pro". Exit 0. Self-healing, correct.
- **Missing file with no network.** `RapidOCR(params)` raises `rapidocr.utils.download_file.DownloadFileException` **inside `build_engine` before `verify_pinned_models` runs**. `main()` catches only `ImportError` and `ModelChecksumError` (`ocr.py:346-359`), so the result is an unstructured traceback on stderr and exit 1. That contradicts the module header's "structured `{"error": ...}` record" claim (SF-5). It is still contained by TS (concern 1).
- **Ordering.** The verification runs **after** `RapidOCR()` has already loaded the ONNX files into onnxruntime (`ocr.py:223-227`). It is "before inference", not "before first use" (NIT-4).
- **The comparison logic is correct.** It streams the SHA256 in 1 MiB chunks, checks per file, and reports missing and mismatched files separately. The unit tests cover missing, match and single-file corruption.
- **Provenance is hard-coded (MF-4).** `engine_provenance()` returns constants: `RAPIDOCR_VERSION = "3.9.2"` and the pinned SHAs (`ocr.py:107-108, 162-173`). It never reads what actually ran, so the TS `engineProvenanceWarning` **cannot fire for a package-version drift**, which is the exact 1.2.3/1.4.4 class of drift it exists for.
- **pytest: 29/29 pass.** The recogniser tests were run for real against live-downloaded models.

### 6. Pipeline timing. **Negligible (no finding).**

- **The OCR run itself.** Per the RCA, a 24-page Migros OCR run goes from 28-31 s to about 32 s (+1.5-4.3 s), against `RUN_DEADLINE_MS = 28 min` (`resilience.ts:395`), which is under 0.3%. Collection is not part of `MAX_CHUNK_MS` (19.5 min, `:308`, a classification-chunk budget). Peak RSS 1.71 GB is well within a 16 GB `ubuntu-latest` runner.
- **The two new workflow steps** (cache and pytest, about 28 s locally with a fresh download, probably 30-60 s on a runner) sit **outside** the retry step's `timeout_minutes: 60`. They add job wall time only, and do not touch the `RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS + SAFETY_MARGIN_MS ≤ 60` inequality.
- **Not measured by me:** a full 24-page run, because no page images are committed (correctly, per the URG rule). I rely on the RCA's numbers for the per-run delta.

### 7. The 2.3k-line diff. **Nothing unrelated in the three commits, but see the base-branch warning (SF-8). Comments are excessive (SF-9).**

- **The commits are clean.** They touch only WP-10 files plus the RCA copy. The `possiblyFusedName` counter comes from another worktree (`a5c4b57`), but the RCA §7 ruled "keep", so including it is in scope.
- **Base-branch warning.** The branch is based on **`8cc8beb`, not `eeb2a0e`** (`git merge-base eeb2a0e d873fee` = `8cc8beb`).
  - `git diff eeb2a0e..d873fee` therefore shows about 60 unrelated files, including web-next, docs and migrations, as reverts.
  - The textual merge is clean, and the merged tree passes 1565/1565 vitest. **Merge, do not diff-apply or squash from `eeb2a0e`.** Better still, rebase onto main before merging so the review range is honest.
- **Comment volume.** In `migros-flyer-source.ts`, about 165 of the 265 added lines are comments (about 62%). The WP-10 RCA story is retold in six places: the `ocr.py` header, `requirements.txt` (40 comment lines for 4 pins), `EXPECTED_MIGROS_OCR_ENGINE`, `possiblyFusedName`, `pipeline.yml`, and both test headers. The surrounding code is comment-heavy too, but this is duplication, not "why".

---

## MUST-FIX

**MF-1. The pytest step can take down all 7 retailers.** `.github/workflows/pipeline.yml:89-99`
- **Evidence:** concern 1. No `continue-on-error`, and the step runs before `Categorize and store` (`:101`). A modelscope outage on a cache miss, a flaky recogniser crop, or a PyPI blip on `pip install pytest` means zero offers published for every retailer.
- **Fix:**
  1. Move `python3 -m pytest pipeline/collection/infrastructure/migros` into `ci.yml` as a `pipeline-python` job, with setup-python 3.12, pinned requirements, pinned pytest and the same model cache.
  2. In `pipeline.yml`, keep only a model warm-up step with `continue-on-error: true`.
  3. Tech Lead to confirm the deviation from RCA §5.4's wording.

**MF-2. The ground-truth gate is too loose to be a ratchet.** `migros-kw39-ground-truth.test.ts:114-122, 130-137`
- **Evidence:** it asserts `correct ≥ 80` and `wrongNames ≤ 5` when the measured values are 85 and 2. Mutation M2 (`PROMO_BADGE` disabled) doubles wrong names to 4, drops correct to 83, and **all 119 tests pass**.
- **What the RCA asked for:** RCA §6 item 4 asks for a ratchet that "only ever goes down" (`MAX_WRONG_NAMES`).
- **Fix:**
  1. Assert the exact residual set by key: `[(4, 1.65, 2.15), (6, 1.80, 2.35)]`.
  2. Assert `correct ≥ 85`.
  3. Any change then has to be deliberate. (The test title "≥ 62" at `:114` is also wrong; see NIT-2.)

**MF-3. The "2.80 statt 3.50" test pins a known defect as correct behaviour.** `migros-kw39-ground-truth.test.ts:166-176`
- **Evidence from the page-4 OCR:**
  - 2.80 sits at x 783-1019, and its own badge "20%" at x 795-1005. 3.50 × 0.80 = 2.80 exactly.
  - The name "Rindssiedfleisch mager," is at x 1040-1427.
  - Because 902, 1245 and 1623 chain into one tile (x 737-2199), `findPrintedDiscount` (`migros-flyer-source.ts:898-908`, nearest by y only) picks the **Schweinshalssteaks column's "23%"** (y1 1784 vs 1782).
  - The `Offer` invariant then rejects a correct offer.
- **Why this is a MUST-FIX:** the test is titled "is not a false positive — the invariant correctly withholds it", but it is a false negative caused by the same chaining defect. The RCA-named regression is "2.80 statt 3.50 is Rindssiedfleisch".
  - The per-row prototype, which splits this row correctly, **fails this test**. So the test would punish the fix. That is exactly the trap the file header says it avoids (`:153-157`).
- **Fix:** delete the positive assertion. Record 2.80/3.50 as a third documented residual in the MF-2 ratchet ("withheld: cross-column badge"), and correct the header ("one RCA regression still fails" should read two).

**MF-4. Engine provenance reports constants, not what ran.** `ocr.py:107-108, 162-173`
- **Evidence:** `engine_provenance()` returns the hard-coded `"3.9.2"` and the pinned SHAs. If rapidocr 3.10 is installed (for example `pip install rapidocr` without `-r`, on a dev machine), every page still claims 3.9.2. The TS test "warns when a page declares a different package version" (`migros-flyer-source.test.ts`) exercises a state that `ocr.py` can never emit.
- **What the RCA asked for:** RCA §6 item 2 calls this "the regression test for the version drift itself".
- **Fix:**
  1. Use `importlib.metadata.version("rapidocr")` and `onnxruntime.__version__` (add `onnxruntime` to the record and to `MigrosOcrEngineProvenance`).
  2. Take the SHAs from the files actually verified: have `verify_pinned_models` return the computed digests.
  3. Add a pytest that monkeypatches `importlib.metadata.version` and asserts the record changes.

**MF-5. No unit tests for the core of Fix B.** `migros-flyer-source.ts:315, 593-630`, and `PRICE_TOKEN_SRC` at `:229`
- **Evidence:** `grep detectColumnBoundaries|PROMO_BADGE *.test.ts` finds only comments. Mutations M2, M5 and M6 survive.
- **Fix:** add table-driven unit tests for `detectColumnBoundaries`:
  - empty
  - a single anchor
  - clean 2-col
  - clean 3-col
  - the mixed 2-up/3-up KW39 shape `[216, 902, 1244, 1587]`, documenting today's collapse
  - duplicate x values

  Also add:
  - `PROMO_BADGE`: "BIOSUISSE", "VEGAN" and "IP-SUISSE" are badges; "Migros Bio", "M-Classic Hamburger" and "Tofu" are not.
  - An adapter-level case for an inline `–.90` statt token.

## SHOULD-FIX

**SF-1. Page 19 is a truth-table gap of 6 offers, not 1.** `__fixtures__/kw39/kw39-zh-truth.json:5` ("Page 19 carries no statt-priced offer")
- **Evidence:** concern 3.
- **Fix:** the **tech lead (the truth owner), not the builder**, re-reads page 19 by eye and adds its entries. The count goes from 127 to about 133, and the wrong-price assertion (`ground-truth.test.ts:139-145`) becomes `[]`. Until then, the current explicit by-name exception is acceptable.

**SF-2. The `detectColumnBoundaries` header understates its limit.** `migros-flyer-source.ts:560-593`
- **Evidence:** concern 4. The 3→2 collapse happens on 7 of 24 KW39 pages, and the threshold is fitted between KW36 and KW39 (0.14 breaks KW36; 0.3 gives 18 wrong).
- **Fix:**
  1. Rewrite the limit accurately: row-varying grids, and page-level clustering on price anchors.
  2. Implement the RCA §8 `wrongPairingSuspected` funnel counter (a chosen name or badge whose x-centre sits in a different anchor-group than its price) so a new layout shows up in the run log.

**SF-3. A single anchor group degrades to a whole-page tile.** `migros-flyer-source.ts:605-607, 624-630`
- **Evidence:** `[1587]` gives `[0, 2199]`. The old code bounded it to the right half. With the half-split fallback (M5) KW39 still scores 88/85/2/1, so the fallback costs nothing on the fixtures and is safer on sparse pages.
- **Fix:** when `columnBounds.length === 2`, fall back to the half split (or cap the tile at 50% of the page width around the anchor), and unit-test it.

**SF-4. Cache save and key.** `pipeline.yml:83-87`
- **Evidence:** concern 2.
- **Fix:**
  1. Split into `actions/cache/restore@v4` and `actions/cache/save@v4`, saving right after the models are verified.
  2. Derive the key with `hashFiles(ocr.py, requirements.txt)`.
  3. Correct the false comment at `:79-80`.

**SF-5. `build_engine` failures other than checksum and import are unstructured.** `ocr.py:346-359`
- **Evidence:** with the network blocked, `DownloadFileException` escapes as a traceback, exit 1. A truncated download that onnxruntime cannot parse fails the same way.
- **Fix:** catch `Exception` around `build_engine()` and print `{"error": "OCR engine unavailable: <type>: <msg>"}` with a distinct exit code (5), matching the module docstring.

**SF-6. Transitive OCR dependencies are unpinned.** `requirements.txt:40-43`
- **Evidence:** a fresh install resolved `opencv-python==5.0.0.93`, `shapely==2.1.2`, `pyclipper==1.4.0` and `omegaconf==2.3.1`, all unpinned. rapidocr's pre- and post-processing runs through cv2, pyclipper and shapely, so OCR output can drift. That is the same defect class the RCA exists to close.
- **Fix:** commit a constraints file (`pip freeze` from the benchmark venv) and install with `-c`. Pin `pytest` too (`pipeline.yml:98`).

**SF-7. The default model dir is not gitignored.** `ocr.py:125`
- **Evidence:** `git check-ignore pipeline/collection/infrastructure/migros/.rapidocr-models/x.onnx` gives "NOT IGNORED". Running `pytest` locally without `MIGROS_OCR_MODEL_DIR` downloads 31.7 MB into the repo tree as untracked files, a one-`git add -A` accidental commit.
- **Fix:** add `.rapidocr-models/` to `.gitignore`.

**SF-8. The branch is based on `8cc8beb`, not `eeb2a0e` (process).**
- **Evidence:** `git merge-base eeb2a0e d873fee` = `8cc8beb`. The merge is clean and the merged tree passes 1565 tests, but `eeb2a0e..d873fee` diffs look like reverts of about 60 files.
- **Fix:** rebase onto main before merge.

**SF-9. The RCA narrative is duplicated in six places.**
- **Evidence:** concern 7. For example, `requirements.txt:13-35` and the `ocr.py:14-42` header tell the same story as `EXPECTED_MIGROS_OCR_ENGINE` (`migros-flyer-source.ts:162-176`) and `possiblyFusedName` (`:441-457`).
- **Fix:** tell it once (the `ocr.py` header), and elsewhere keep a one-line "why" plus a pointer to `docs/rca/2026-09-25-tech-lead-migros-ocr.md`.

## NIT

- **NIT-1.** `live-sources.ts:97, 104`: "is rapidocr-onnxruntime installed?" is now stale and misleading. The package is `rapidocr`, and the likelier cause is now a model download failure.
- **NIT-2.** `migros-kw39-ground-truth.test.ts:114`: the title says "≥ 62" but the test asserts `≥ 80` (and should be ≥ 85; see MF-2).
- **NIT-3.** `test_ocr.py`: `test_model_checksum_error_is_a_real_exception_type` (`issubclass(…, Exception)`) and `test_engine_provenance_matches_the_pinned_models_exactly` are tautological as written. The second becomes meaningful after MF-4.
- **NIT-4.** `ocr.py:30-35, 195-200`: "verified before first use" should read "verified before inference". The ONNX files are already loaded by `RapidOCR()` at `:223`. Optionally, verify any existing files before construction as well.
- **NIT-5.** `migros-flyer-source.ts:303-315`: `PROMO_BADGE` is also (usefully) filtering packshot text, for example IP-SUISSE ×22, CUMULUS ×15, MIGROS ×6 and BRITA ×3 in the KW39 OCR. Say so in the comment. No real product name in the truth set is all caps, so the rule is sound on the evidence.
- **NIT-6.** The en-dash fix is justified by "-.72 statt –.90" (p17, Reiswaffeln), yet that offer is **still not published** (it is absent from the scored output). Say so, or cover it (MF-5).
- **NIT-7.** Fix A and Fix B are in one commit. The RCA requires one *release*, not one *commit*. This is a Two Hats smell only, so no action is needed now.
- **NIT-8.** `ocr.py` inherits `max_side_len: 2000` and `use_cls: true` from rapidocr's `config.yaml`, the same downscale the RCA flagged in 1.4.4. That is fine because the benchmark measured it, but it contradicts "never package defaults". Either pass them explicitly or reword the claim.

---

## Test coverage assessment

- **The pyramid shape is right.** There are unit tests (toFrancs, provenance, fused-name), a captured-fixture adapter test (KW36 golden master plus the KW39 ground truth), and recogniser-level pytest against real crops. Fakes are used over mocks.
- **The gaps are the ones above.**
  - The Fix B primitives have no unit tests (MF-5).
  - The ground-truth ceiling does not ratchet (MF-2).
  - One test pins a defect (MF-3).
  - The provenance chain is tautological end to end (MF-4).

## Final verdict

**Needs work.** The correctness gain is real and reproducible: wrong names go from 13/56 in production to 2/88. The truth fixtures are untampered. However:

- MF-1 must be fixed before this touches the scheduled workflow, because it trades a Migros-only risk for an all-retailer outage.
- MF-2 through MF-5 are small and test-side, about an hour of work, and they make the gate actually hold.
