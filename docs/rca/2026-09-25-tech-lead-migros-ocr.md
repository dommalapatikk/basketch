# Tech Lead RCA + decision — Migros names run together (WP-10)

**Date:** 2026-09-25 · **Author:** Tech Lead · **Status:** Decision (investigation only: no commits to main, no DB writes, no workflow triggers)
**Scope:** `pipeline/collection/infrastructure/migros/` (the Migros OCR + adapter) and the one CI install step that feeds it. Nothing in storage or catalogue code (a parallel builder owns that).
**Evidence folder (scratch, gitignored):** `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/tl-ocr-bench/`. The fixtures ready to commit are in `fixtures-for-builder/`.

---

## 1. Verdict in one paragraph

The run-together names come from the OCR **model**, not from its settings and not from our code. Both packages we have ever run (`rapidocr-onnxruntime` 1.2.3 and 1.4.4) ship a **Chinese-trained** recogniser (`ch_PP-OCRv3_rec` and `ch_PP-OCRv4_rec`). On German text it drops inter-word spaces, strips every umlaut and accent, and emits full-width CJK punctuation (`，` `（`). Switching to `rapidocr==3.9.2` with its multilingual **PP-OCRv6** det/rec models removes the defect completely on the live KW39 flyer: **correct-product names that are run together go from 12 to 0**, **names with correct umlauts from 0 to 18**, and **correctly named offers from 43 to 62**. It costs +1.5 to 4s per run and +0.3 GB peak RAM.

The benchmark also exposed a second, older defect that is **live in production today**: **13 of the 56 Migros offers (23%) that production publishes carry another product's name** (for example "Lindt Mini Pralinés" on the Lindor price). That is an Art. 3(1)(e) UWG correctness problem, and it is worse than the spacing defect. Its cause is in our parser (price-to-name and price-to-badge association uses a half-page "tile" on 3-column pages). It gets fixed in the same work package, sequenced after the OCR swap and gated by a hand-verified ground-truth fixture.

## 2. What the builder got right, and what was wrong

| Builder claim (commit a5c4b57) | Verdict | Evidence |
|---|---|---|
| Run-together text comes straight out of rapidocr, not our code | **Correct** | The OCR items themselves are fused ("CoffeeBKaffeemaschineGlobe" is one item, box 1387-1879 x 1179-1212 on p22). `normalizeProductName` and `joinNameParts` are exonerated. |
| "Verified against the pinned `rapidocr-onnxruntime==1.2.3`" | **Wrong version.** Nothing is pinned. | `requirements.txt` says `>=1.2.3`. CI's Python 3.12 resolves **1.4.4**, while local Python 3.14 resolves 1.2.3 (the last release for 3.14). Proof: re-running 1.4.4 on the KW39 pages reproduces CI run 35983172760's funnel **exactly**: `137 anchors -> 56 accepted … 60 multi-buy unquantified … 11 no display price … 10 discount-inconsistent`. Production and dev have been running **different OCR engines**. |
| "The detector does not downscale native-resolution pages" | True for 1.2.3, **false for production** | 1.4.4 `config.yaml`: `max_side_len: 2000`, and `main.py preprocess()` → `reduce_max_side`. The 2199x2997 page is shrunk to 67% before detection *and* recognition. |
| "No config change is justified without a live benchmark… no real flyer images available" | **Wrong premise** | The live pages are public on `image.isu.pub` and the pipeline itself fetches them (`issuu-fetcher.ts`). I fetched them exactly as the pipeline does (1 document fetch + 1 fetch per page, 24 pages, honest UA). |
| "No dictionary splitter" | **Correct**, and upheld | A splitter cannot tell "CoffeeB" (brand) from lost boundaries. The model fix makes it unnecessary. |
| `possiblyFusedName` counter | **Keep** (see §7) | |
| `it.fails()` test on a synthetic tile | **Drop** | Replace it with captured-fixture tests (§6). The synthetic geometry (name box starting 38px *inside* the price box) does not occur on real pages. |

## 3. Method

1. **Input:** KW39 ZH flyer, revision `260922112022-d362688a5cba3f8e39844c665d791c52`, 24 pages at 2199x2997. Fetched once each (all HTTP 200).
2. **Engines:** three isolated venvs inside the scratch folder, with every cache and download kept inside `/Users/kiran/ClaudeCode`:
   - `venv` is Python 3.14 + `rapidocr-onnxruntime==1.2.3` (what local dev runs).
   - `venv312` is Python 3.12 + `rapidocr-onnxruntime==1.4.4` (what CI runs).
   - `venv3` is Python 3.12 + `rapidocr==3.9.2`.
3. **Harness:** `bench.py` calls the **real** `ocr.py` functions (`process_entries`, `ocr_native`, `ocr_tiled`). `eval.ts` runs the output through the **real** adapter (`parseFlyer` at a5c4b57).
4. **Ground truth:** I read all 24 pages by eye and recorded every statt-priced offer as (page, sale, original) → printed product. That gives **127 offers** in `fixtures-for-builder/kw39-zh-truth.json`. Every published offer is scored: correct product, wrong name, or wrong price.
5. **Recogniser-level test:** 9 **text-only** name-band crops, cut from the page at the OCR's own boxes. They contain no product photograph (see §6 for why that matters). They are run through each engine in isolation.

## 4. Results (KW39, all 24 pages, through the real parser)

| Variant | Time (24 pp) | Published | **Correct product** | Wrong name | Wrong price | Correct but **run-together** | Correct **with umlauts** |
|---|---|---|---|---|---|---|---|
| **1.4.4 native — production today** | 28–31 s | 56 | **43** | **13** | 0 | **12** | **0** |
| 1.2.3 native — local dev | 33 s | 78 | 58 | 20 | 0 | 26 | 0 |
| 1.4.4 tiled (`migrosTiledOcr`) | 46 s | 89 | 64 | 25 | 0 | 20 | 0 |
| 1.4.4 `max_side_len=4000` (no downscale) | **636 s** | 77 | 58 | 19 | 0 | 13 | 1 |
| 1.4.4 `det_unclip_ratio=1.8` | 28 s | 55 | 44 | 11 | 0 | 8 | 0 |
| 1.4.4 `det_unclip_ratio=2.0` | 27 s | 54 | 43 | 11 | 0 | 6 | 0 |
| 3.9.2 PP-OCRv5 **latin** rec | 29 s | 79 | 58 | 21 | 0 | 0 | 13 |
| 3.9.2 PP-OCRv5 **en** rec | 30 s | 76 | 55 | 21 | 0 | 0 | 12 |
| **3.9.2 PP-OCRv6 (default small det+rec)** | **32 s** | **79** | **62** | 17 | 0 | **0** | **18** |
| 3.9.2 PP-OCRv6 tiled | 55 s | 98 | 74 | 24 | 0 | 0 | 17 |
| *PP-OCRv6 + x-aware pairing prototype* | 32 s | 72 | **65** | **7** | 0 | 0 | 18 |
| *PP-OCRv6 tiled + x-aware pairing prototype* | 55 s | 91 | **77** | 14 | 0 | 0 | 17 |

(The `possiblyFusedName` counter reads 17 for production and 0 for every 3.9.2 variant.)

**Anchors.** Production vs PP-OCRv6 on the known-bad names: `CoffeeBKaffeemaschineGlobe` → `CoffeeB Kaffeemaschine Globe`; `BritaWasserfilterMaxtraPro` → `Brita Wasserfilter Maxtra Pro`; `MigrosBioLachsfilets` → `Migros Bio Lachsfilets`; `LindtMiniPralines` → `Lindt Lindor Kugeln` (production had the **wrong product**); `St.GallerOlma-Bratwurste` → `St. Galler Olma-Bratwürste`; `Wylander Rauchmockli` → `Wyländer Rauchmöckli`.

**Recogniser-level (isolated crops, `croptest.py`):** 1.4.4 passes **3/9**, 1.2.3 passes **3/9**, PP-OCRv6 passes **8/9**. The one v6 miss comes from a too-tight crop: "Don Pollo Poulet t Nuggets" picks up a sliver of the next line. Pad that crop or drop it.

**Parameters ruled out, with numbers:**

- **`unclip_ratio`:** wider boxes do recover some spaces (12 → 6), but they merge neighbouring lines and cause new errors: "Migros Salatbouquet" becomes "Migros", "Schweinshalssteaks" becomes "Rindssiedfleisch mager", and "Lindt Lindor" is still wrong. It treats the symptom in geometry.
- **No downscale:** 20x slower for 1 name.
- **Tiled on the old model:** +1.5x time, and the model still drops spaces (20 fused).
- **Other settings:** `use_space_char` does not exist in either package (the space is already in the dictionary), and `rec_img_shape` is only a batching hint.

The defect is the recogniser's **training language**, which no parameter changes.

**Other text sources (task item 2):**

- **Issuu document HTML:** `seoText.sanitizedHtml` is empty, and there is no text layer or download flag.
- **Issuu reader JSON** (`reader3.isu.pub/.../reader3_4.json`): **HTTP 403 AccessDenied**. That is a refusal; we do not try to get past it (CLAUDE.md legal rule).
- **Migros product pages:** already excluded (robots.txt and terms name crawlers; staff declined an API).

**No lawful, openly served text source exists, so OCR stays.** No extra fetch is proposed. The model files (below) come from the model host, not the retailer, so AP-1 is not engaged.

## 5. Decision (Tech Lead: technical, two-way door)

### Fix A — replace the OCR model (the WP-10 root cause)

1. `requirements.txt`: **exact pins**, `rapidocr==3.9.2`, `onnxruntime==1.30.0`, `pillow`, `numpy` pinned to what we test. Remove `rapidocr-onnxruntime`. `>=` is how dev and production drifted onto different engines without anyone noticing. `rapidocr==3.9.2` resolves on both Python 3.12 (CI) and 3.14 (local).
2. `ocr.py`: construct the engine with **explicit** model choices. Do not inherit package defaults, so a future rapidocr default change cannot silently swap models:
   - det `PP-OCRv6_det_small`, SHA256 `090f04ab…f94f`
   - rec `PP-OCRv6_rec_small`, SHA256 `6f327246…4884`
   - cls `ch_ppocr_mobile_v2.0_cls`, SHA256 `e47acedf…215c`
   - Set `Global.model_root_dir` to a cache dir.
   - **Verify all three SHA256s in `ocr.py` before first use.** rapidocr 3.9.2 checks the hash only for a file that *already exists*; a fresh download is used unverified (`utils/download_file.py` `run()`). On a mismatch, emit a structured error record: sources never throw, and "OCR unavailable" is a failure, not an empty week.
3. `ocr.py`: add `rapidocr` + `ocr.PPOCRV6` provenance to the output (`"engine": {"package": "rapidocr", "version": …, "det": sha, "rec": sha}`). The TS adapter records it on the run and **warns if it differs from the pinned expectation**. This is the check that would have caught the 1.2.3/1.4.4 drift (Larson: fix the system).
4. `pipeline.yml` (the one line outside the adapter, forced by the evidence): add an `actions/cache` step for the model dir, keyed on the three SHA256s. That is ~31.7 MB (det 9.9 + rec 21.2 + cls 0.6) downloaded from `modelscope.cn` only on a cache miss. Also **add `python3 -m pytest pipeline/collection/infrastructure/migros`**: today **no Python test runs in CI at all**.
5. `toFrancs`: accept the en-dash `–` in the sub-franc form (`–.90`). PP-OCRv6 prints Swiss dashes faithfully, and one KW39 price ("-.72 statt –.90") is otherwise unreadable. (The whole-franc form `9.–` is already handled.)
6. Default stays **native** (`migrosTiledOcr` false). Tiled v6 adds +12 correct offers for +23 s, but also +7 wrong names under today's pairing. Revisit it once Fix B lands, using the same ground-truth harness. It is a measured decision, not a guess.

**Runtime cost:** +1.5 s to +4.3 s per 24-page run (28–31 s → 32 s locally; CI Migros step today `durationMs 29317`). Peak RSS 1.39 → 1.71 GB. There is a one-off 31.7 MB model download per cache miss. Free tier is unaffected.

### Fix B — price↔name/badge association (the older, bigger correctness defect)

- **Mechanism.** `tileFor()` splits the page into **halves**, and `findPrimaryNameLine()` picks the line whose **top edge is vertically nearest** to the price, **ignoring x**. KW39 pages use a **3-column** grid, so the middle column's name and badge compete with the right-hand column's.
  - Page 4: 1.65 statt 2.15 is "Schweinshalssteaks". Candidates sit 8px vs 9px away, and production only gets it right by 1px of luck; v6's taller price box flips it.
  - The same mechanism puts the "23%" Bratspeck badge on the Rapelli offer. The `Offer` invariant then **correctly** rejects it as discount-inconsistent, which is why v6 "loses" Rapelli 6.30, Gelbflossen 2.95 and Schinkengipfeli 8.80. Those were not OCR losses.
- **Evidence the direction is right.** A 5-line prototype (the name must start 0–6% of page width to the **right** of the price box) takes wrong names from **17 → 7** on v6 and **13 → 4** on production OCR.
- **What remains.** The prototype is **not** the fix: multi-buy names still pick badges ("VEGAN", "BIOSUISSE", "kisss"), and it drops a few offers. The builder designs the proper rule test-first: the name is the first non-badge line right of the price's divider, top-aligned; multi-buy names are the bold line above the `z.B.` line; badges are x-aligned above their own price. The ground-truth fixture is the judge.
- **Sequencing.** Fix A and Fix B ship in **one release**. A alone publishes 79 offers with 17 wrong names. That is the same wrong *rate* as today (21.5% vs 23%) but more wrong offers in absolute terms, so A must not ship alone.

## 6. TDD plan — failing tests from CAPTURED real pages

All fixtures are in `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/tl-ocr-bench/fixtures-for-builder/`. Commit them under `pipeline/collection/infrastructure/migros/__fixtures__/`.

- **Image rule.** Do **not** commit full page images: they contain product photographs, which Art. 2 Abs. 3bis URG protects. The committed crops are **text-only name bands** (~30 KB each, 276 KB total, each checked visually). OCR JSON and the truth table are text.

The failing tests, in this order:

1. **Red, recogniser level (Python, `test_ocr_recognition.py`, runs in CI after step 4 above).** Parametrised over `crops/manifest.json`, asserting `expected in ocr(crop)`. The anchors are "CoffeeB Kaffeemaschine Globe", "Brita Wasserfilter Maxtra Pro", "Migros Bio Lachsfilets", "M-Classic Hamburger", "Alle Salsa all' Italiana Saucen" and "Weisswürste". **Red today: 3/9 on the current engine.** Green on PP-OCRv6. Named after the defect: `test_migros_kw39_names_keep_word_boundaries_and_umlauts`.
2. **Red, provenance (Python + TS).** The OCR output declares engine and model SHA256s, and the adapter warns on mismatch. This is the regression test for the version drift itself.
3. **Red, unit (TS).** `toFrancs('–.90') === 0.9`.
4. **Red, adapter level (TS, `migros-flyer-source.test.ts`).** Load `ocr-kw39-zh-ppocrv6.jsonl` plus `kw39-zh-truth.json` and assert **every published offer names its printed product**. Also add named regressions:
   - `Migros KW39: 25.95 statt 42.56 is Lindt Lindor Kugeln`
   - `…1.65 statt 2.15 is Schweinshalssteaks`
   - `…2.80 statt 3.50 is Rindssiedfleisch`
   - `…9.60 statt 12.80 is Elmex Mundspülung`
   - `…12.65 statt 14.90 is Minirosen`

   **Red today: 17 wrong of 79.** It stays red until Fix B, and there is no `it.fails`. If the builder needs intermediate commits, use an explicit ratchet constant (`MAX_WRONG_NAMES = 17 → … → 0`) that only ever goes down.
5. Keep `ocr-kw39-zh-rapidocr144-production.jsonl` as the documented "before" state, to use in the RCA test comments (optional to commit).

Harness scripts (`bench.py`, `eval.ts`, `truth.py`, `croptest.py`) are included so the next flyer change can be re-benchmarked in minutes.

## 7. Ruling on the builder's `possiblyFusedName` counter

- **Keep it as permanent observability. Drop the `it.fails()` and the synthetic KW39 tile.**
- **Why keep it.** It is cheap. It reads 17 on production and 0 on the fix, so it discriminates. It is exactly the run-level signal that would have flagged this weeks ago (Majors: can we debug this without SSH?).
- **Its limit.** It cannot see run-together words that are all lowercase ("Schweinsnierstuck"), so it is a tripwire, not a gate. It must never drop or rewrite an offer.
- **The real gate** is the ground-truth test plus the provenance check.

## 8. Open items

- **For the PM (product, not technical):** none are blocking. For information, production has been showing wrong product names on about 1 in 4 Migros deals. Fix B addresses it, and nothing needs deciding.
- **Flag (not blocking):** a new flyer layout can break Fix B's rule. Refresh the ground-truth fixture when a layout change shows up. The `possiblyFusedName` counter and a new `wrongPairingSuspected` counter (price and name in different grid columns) are the tripwires.
- **Scratch hygiene:** `.claude/worktrees/tl-ocr-exp` is a detached scratch worktree holding the pairing prototype, uncommitted. Remove it with `git worktree remove` once the builder has read the diff.
