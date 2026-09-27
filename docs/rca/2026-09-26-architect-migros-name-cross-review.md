# Architect cross-review — Migros WP-10 name truncation RCA

- Date: 2026-09-26
- Author: Solution Architect (cross-review only — no code changed, nothing pushed)
- Reviewed: `docs/rca/2026-09-26-tech-lead-migros-name-truncation.md` (Tech Lead)
- Code: worktree `agent-a93682c65ace6ef3d`, `pipeline/collection/infrastructure/migros/migros-flyer-source.ts`
- Verdict: **Agree with the diagnosis (D1-D3, T1) in full. Agree with the fix shape with four amendments** (A1 badges become labels, not deletions; A2 no standalone-BIO drop until organic reads labels; A3 a second geometric signal + fail-short fallback; A4 hyphen rule exceptions). Details per point below.

## 0. What I checked

- The RCA end to end; `migros-flyer-source.ts:280-300` (DESCRIPTOR, PROMO_BADGE), `:726-845` (looksIncomplete, findContinuationLine, findPrimaryNameLine, joinNameParts, findOfferName).
- `collection/domain/source-attributes.ts`, `offer.ts` (name trim + identity via `normalizeProductName`), `shared/types.ts:1058` (`normalizeProductName`), `product-metadata.ts` (`KNOWN_BRANDS`, `isOrganic`), `product-resolve.ts:57-130` (product identity).
- Denner, Volg, Coop adapters and fixtures for how badges appear in names.
- My own geometry measurement on `ocr-kw39-zh-ppocrv6.jsonl` (22 title stacks) and `ocr-kw36-zh-pages2-5.json` (6 stacks). Scratch script only, not committed.

## 1. Domain placement (DDD) — PARTLY AGREE

**Agree:** line assembly is a Migros anti-corruption-layer concern. Which OCR lines make up the title, how the pitch/width geometry works, and how a line-end hyphen joins: all of that is an artifact of *how Migros typesets a flyer and how our OCR reads it*. It belongs in `migros-flyer-source.ts`, as the RCA says (`collectTitleLines`, `joinTitleLines`). No other adapter has line-join logic today: grep for line-end-hyphen handling outside `migros/` finds nothing. So there is no second user, and extracting a shared "text join" utility now would be premature (rule of three).

**Disagree on two points:**

**A1 — Badges are domain data. Move them to `sourceAttributes.labels`; do not delete them.**
- The domain already has a place for them. `SourceAttributes.labels` is documented as "Certification and origin labels: 'Suisse Garantie', 'Bio', 'IP-SUISSE'" (`source-attributes.ts:48`). Denner already maps `eco_labels` there and keeps its name clean (`denner-api-source.ts:166-186`). The Migros adapter sets no `sourceAttributes` at all today (grep: zero hits).
- R3 as written *throws information away*. The shape that matches the existing domain: `cleanTitle` returns `{ name, labels }`. The adapter publishes `name` and passes `labels` into `createSourceAttributes({ labels })`. The name gets the same result R3 wants, the attribute survives, and Migros lines up with Denner.
- Vocabulary placement: the closed list of *which strings are certification labels* (`IP-SUISSE`, `AOP`, `IGP`, `MSC`, `ASC`, `Fairtrade`) is domain vocabulary. Put it in `collection/domain/` (next to `source-attributes.ts`, e.g. `CERTIFICATION_LABELS`). The rule *"a whole comma segment of a Migros bold title that equals a label is lifted out"* stays in the adapter. Service phrases (`an der Theke`, `in Selbstbedienung`) are not certifications. They are Migros layout noise, so they stay adapter-local (they are already in `DESCRIPTOR`) and do not go into `labels`.
- Matching must be tolerant of OCR case/space noise. Compare upper-cased with whitespace removed. KW36's older engine read `IP-SUiSSE` and `anderTheke` (measured), and a case-sensitive exact match would leak both into names. PP-OCRv6 is cleaner, but the list must not depend on it.

**A2 — Do NOT strip organic markers (`BIO`, `Bio`, `Demeter`, `Knospe`) from the name for now.**
- `isOrganic` (`product-metadata.ts:52`) reads *only the name* (`/\b(bio|naturaplan|demeter|knospe|organic)\b/`), and `product-resolve.ts` feeds it `deal.productName` only. It never sees `labels`. Stripping `, BIO` would silently turn `is_organic` false for those products. That is a data regression the KW39 name gate cannot see.
- There is also a product argument. Organic is identity-bearing in the way R2's variant words are (Joghurt vs Bio-Joghurt is a different product to a shopper). IP-SUISSE/AOP are not.
- So: organic markers stay in the name. When `extractProductMetadata` learns to read `labels`, they can move (follow-up, not this fix). KW39 has no `, BIO` title segment (grep), so this changes no expected name in §6.

**Correction to RCA §4:** "the other retailers' names do not carry them" is not accurate. Volg publishes `Williams Birnen IP-Suisse` (fixture), and Denner's name carries `Laugenkranz mit IP-SUISSE Mehl`. This does not change the decision, because **product identity is per store**: `product-resolve.ts` keys on the exact `source_name` within one store, and cross-store comparison goes through `product_group`/classification, not name equality. A Migros-only rule therefore cannot break cross-store consistency. A cross-retailer "strip badges" normaliser in `normalizeProductName` (shared kernel) is **rejected**. It would re-key existing Volg/Denner products (identity churn) with no defect behind it, and that function is the storage identity definition, not a display cleaner.

**Identity across weeks (the ", IP-SUISSE" split):** agree that lifting badge segments out makes the Migros identity stable. `Bratspeck, IP-SUISSE` (KW39) and `Bratspeck` (a week that prints the badge on a sticker instead) become one product. One-time cost: the ~31 changed names re-key to new `products` rows on the first run after the fix, and the old rows age out. That is acceptable and needs no migration, but it should be stated in the fix commit so the SRE does not read the churn as a pipeline fault.

**Trailing punctuation (R5):** adapter-local strip, agreed. Do not add it to the `Offer` constructor as a silent fix, because that would hide adapter defects. Instead add a **port-contract assertion for all adapters**: no published `productName` ends in `,` `;` `-` `&` or a bare ` und`/` oder`. It is cheap, it catches this whole defect class in every adapter, and it is where a cross-retailer invariant belongs (`port-contract.test.ts`).

## 2. Pitch-based title-block detection — AGREE IT WORKS ON KW39; NOT ROBUST ENOUGH ALONE (A3)

**Failure modes of the pitch rule on its own:**
1. **The margin is thin.** 36 vs 40 px, about 10%. One point of leading change in a future edition flips it.
2. **It is absolute (fraction of page height), not relative to type size.** On p24 (larger type) bold→bold is 49 px, well past 37.5, so any non-hyphenated two-line title there truncates. The RCA accepts this.
3. **Cascade risk.** Regular→regular pitch is *also* 31–35 px (measured: `200 g, in Selbstbedienung` → `(100 g = 1.60)` 32.5; `Schweiz, 4 Stück,` → `200 g…` 33.2). Pitch only separates the one bold→regular *transition*. If that transition is missed once (a tight description line), the loop keeps accepting the following regular lines at title pitch, up to the 4-line cap. The failure is not "one extra line", it is "the whole description merged in". That is the worse failure.
4. It does not account for a page rendered at a different DPI or aspect ratio (it scales with height, which is fine). It also does not account for a regional edition with different type, which is not fine.

**A better signal exists in the OCR output: the width per character of the line box, relative to title line 1.** Bold type is wider per glyph. `cwRatio = ((x1-x0)/len(text)) / cw(line 1)`. It is scale-invariant (type size cancels) and it classifies each line on its own, so it cannot cascade. Measured:

| Stack (KW39, PP-OCRv6) | title continuation cwRatio | first description line cwRatio | pitch cont. / desc. (px) |
|---|---|---|---|
| p6 Migros Bio / Wienerli | 0.98 | 0.74 | 33 / 42 |
| p2 Sélection Trauben / Uva Italia | 0.89 | 0.69 | 34 / 45 |
| p6 Weisswürste / mit Senf | 0.93 | 0.69 | 35 / 40 |
| p4 Schweinshalssteaks / mariniert, IP-SUISSE | 0.92 | 0.70 | 33 / 44 |
| p7 M-Classic Alaska / Seelachsloins / ohne Haut, MSC | 1.01, 1.06 | 0.77 | 35 / 41 |
| p18 Elmex Zahnpasta- / Kariesschutz / oder -Sensitive | 0.99, 0.89 | 0.68 | 33-35 / 42 |
| p24 St. Galler Olma- / Bratwürste, IGP (large type) | 1.08 | 0.81 | 49 / 56 |
| 13 more KW39 stacks | 0.92–1.13 | 0.62–0.79 | 33–36 / 40–45 |
| KW36 (old rapidocr 1.4.4, lost spaces) | 0.97–1.29 | 0.80–0.87 | 32–36 / 42–44 |

On PP-OCRv6 the two populations are separated by 0.79 → 0.89, and that includes p24, where pitch fails. The page-wide histogram of absolute width per char is clearly bimodal: 12–14 px for regular text (≈370 lines) and 16–19 px for bold (≈340 lines). On the retired engine the gap narrows (description up to 0.87), because lost spaces inflate width per char. That is one more reason the fixed engine pin matters.

Box *height* is **not** usable. Titles measure 34.7–48.3 px and descriptions 30.2–39.3 px, with heavy overlap, and descenders (`geschnetzeltes` 48.3) dominate it. This confirms the RCA's pitch/height finding.

**Ruling — accept a continuation line only when ALL hold:**
1. Content guards (RCA list: not PRICE/PERCENT/STATT/AB_STUECK/DESCRIPTOR, not `z.B.`/`(`). Keep them.
2. x0-aligned within 20 px, directly below. Keep.
3. `cwRatio >= TITLE_WIDTH_RATIO_MIN`, start value **0.85**. This is the primary, scale-invariant bold test.
4. **and** either the pitch rule (`<= 0.0125 × pageHeight`) **or** a hard textual trigger: the previous line ends in `-`, in `&`, or in a bare conjunction `und`/`oder`, or it is a bare brand word. KW39 has `Alle ganzen Migros Bio und`, `Pelican-Lachsfilets, ASC oder`, `Knusprig oder`, `Framboise Intense Noir oder`, all of them unambiguous continuations. The trigger replaces pitch only; it never replaces the width test.
5. Cap 4 lines. Keep.

**Fallback when uncertain: stop (fail short).** When the signals disagree, the line is not joined. A shorter name that is a true prefix of the printed title is *less harmful* than a merged description, for three reasons. (a) It is still the right product, because pairing is unaffected. (b) The exact-name gate (T4) turns it red, so it is visible. (c) A merged description changes identity every week (pack size, origin) and poisons the classifier. The AND rule makes a false join need two independent signals to be wrong at once.

Document both measured tables in the constants' header, as the RCA already plans for pitch.

Residual known gap: a p24-size title that wraps *without* a hyphen or conjunction still stops at line 1, because pitch fails there and no trigger fires. That is the fail-short direction, and it is visible in T4. If it matters later, make pitch relative to line-1 char width (KW39: bold ≤ 2.21 × cw0, regular ≥ 2.28 × cw0). That margin is too thin to adopt now.

## 3. Test design — AGREE, with gaps to close

Agree with: exact `expectedName` read by eye; exact string equality with no normaliser; the keyword judge kept separately for pairing; `ocrReads` for engine-lost characters; KW36 golden edits verified against page images, not taken from output; the T5 invariants pinned.

Gaps:
- **G1 — Overfitting / no holdout.** Every threshold (pitch 0.0125, and my 0.85 width ratio) is tuned on KW39 and then judged on KW39. Before merge, run the fixed adapter on **one more PP-OCRv6 edition** (KW40, or another regional KW39 edition) and hand-check its multi-line titles. If that edition cannot be committed, record the check in the fix doc. Without it, "91/91 names" measures fit, not generalisation.
- **G2 — Independence of the truth file.** The Tech Lead wrote the RCA *and* the expected names, and the Builder will write the code. The `expectedName` / `ocrReads` rows (and the KW36 golden edits) should be spot-checked against the page crops by someone else (QA), for at least the 32 changed rows. `verifiedBy` should name both people. The Builder must not edit `kw39-zh-truth.json` in the same commit as the code.
- **G3 — `ocrReads` must not become an escape hatch.** Pin the number of `ocrReads` entries (currently 2: p1 `Gesichts-und`, p21 `-Automaten-und`) in a test. Each entry needs its one-line reason. A new entry is then a deliberate, reviewed change.
- **G4 — Unit cases to add to T1/T2/T3:**
  - suspended hyphen at a *line end*: `['Gesamte Ponti-','und Giacobazzi-Sortiment']` → `Gesamte Ponti- und Giacobazzi-Sortiment` (see A4);
  - conjunction-ended line triggers a join: `['Alle ganzen Migros Bio und', …]`;
  - a badge that is not a whole segment is kept: `Pelican-Lachsfilets, ASC oder …` (ASC stays, because the segment is `ASC oder …`);
  - OCR-noisy badges are lifted: `Fleischkase,IP-SUiSSE` → name `Fleischkase`, labels `['IP-SUISSE']`;
  - organic marker kept in the name (A2);
  - `cleanTitle` is idempotent, and never returns an empty name (if every segment is a label, keep the first segment);
  - T3: width-ratio rejection at title pitch (a regular line at 34 px with ratio 0.72 is not joined); a disagreement between signals stops; the cascade case (a regular line at 42 px, then regular lines at 33 px, joins none of them).
- **G5 — Labels are asserted.** For the offers in §6 that lose a badge, assert `sourceAttributes.labels` (e.g. p4 Rindshuftsteaks → `['IP-SUISSE']`), so A1 is tested and not just implemented.
- **G6 — Port contract (all adapters).** Add the "no name ends in `, ; - &` / bare `und`/`oder`" assertion from §1. It is the cross-retailer version of T4 and would have caught 6 of the 31 KW39 defects (4 trailing commas, `&`, `Ponti- und`) with no truth table at all.
- **G7 — Crop box (T7).** Also assert the reverse: the crop box does **not** extend to the first description line (y1 < description y0). A merged description would otherwise pass T7.

## 4. Hyphen rules — AGREE with the default; two exceptions needed (A4)

The default rules are correct German typesetting:
- Line-end `-` + lowercase → soft word break, join with no hyphen: `Kalbs-`/`geschnetzeltes` → `Kalbsgeschnetzeltes`, `Lachsrücken-`/`filet` → `Lachsrückenfilet`. German closed compounds keep the lowercase second part, so a lowercase continuation means the printed word is closed. Correct.
- Line-end `-` + uppercase → keep the hyphen (a hyphenated compound broken at its own hyphen, the continuation keeps its capital): `Bio-`/`Joghurt` → `Bio-Joghurt` ✔, `Coca-`/`Cola` → `Coca-Cola` ✔, `Olma-`/`Bratwürste` ✔, `IP-`/`SUISSE` → `IP-SUISSE` ✔. Correct.
- Mid-line `Ponti- und` carried verbatim. Correct.

Exceptions the RCA misses:
1. **Suspended hyphen that lands at the line end** (Ergänzungsstrich): `Gesichts-` / `und Haarpflege-Sortiment`, `Ponti-` / `und Giacobazzi…`, `Zucker-` / `oder fettreduziert`. The rule as written gives `Gesichtsund Haarpflege…`, which is wrong. Rule: if the continuation's first word is a conjunction (`und`, `oder`, `bzw.`, `sowie`, `u.`, `&`, and for Romandie/Ticino copy `et`, `ou`, `e`, `o`), **keep the hyphen and add a space**. This must be checked *before* the lowercase rule. KW39 has the mid-line form twice (`Ponti- und`, `Gesichts- und`), so the line-end form is a matter of when, not if.
2. **Digits on either side of the line-end hyphen** (`3-`/`Korn…`, `Vollkorn-`/`3er-Pack`, `2-`/`in-1`): keep the hyphen with no space. A word-break hyphen only ever sits between two letters, so drop it only when the character before it is a letter AND the continuation starts with a lowercase letter.
- Also normalise hyphen look-alikes before testing (`‐` U+2010, `‑` U+2011, `–` en dash at a line end). The Coop adapter already documents editor-typed en dashes (`coop-aktionis-source.ts:134`).
- Accepted residual risk: a genuine hyphenated compound whose second part is lowercase *and* falls exactly at a line end (`Anti-`/`aging`, `E-`/`bike` style loanwords). It is rare in Migros titles, the result is still readable (`Antiaging`), and it shows up in T4 if it ever occurs. No rule for it.

## 5. Agreed plan (for the Builder, tests first, after TL sign-off on A1-A4)

1. **Truth first.** Add `expectedName` (+ `ocrReads`) for the 91 published offers. QA spot-checks the 32 changed rows against the crops (G2). Add the `ocrReads` count pin (G3). The exact-name test is RED with 31 failures.
2. **Domain vocabulary.** Add `CERTIFICATION_LABELS` in `collection/domain/` (IP-SUISSE, IP-SUISSE+, AOP, IGP, MSC, ASC, Fairtrade pending PM), with a matcher tolerant of case and spaces. Organic markers are not in it (A2).
3. **Pure units in the adapter**, RED then GREEN: `joinTitleLines` (R4 + A4 conjunction and digit exceptions + hyphen look-alikes), and `cleanTitle → { name, labels }` (R3 as a lift into labels, R5, service phrases dropped, idempotent, never empty).
4. **`collectTitleLines`**: content guards + x-align + `cwRatio ≥ 0.85` AND (pitch ≤ 0.0125 × H OR a textual trigger `-`/`&`/`und`/`oder`/bare brand), cap 4, stop on disagreement. Include the T3 synthetic cases, cascade included (G4). The same path is used for `findMultiBuyNameLine`.
5. **Wire labels** into `createSourceAttributes({ labels })` on the Migros offer (G5).
6. **Port contract:** no name ends in `, ; - &` or a bare conjunction, for all adapters (G6). T7 gets both-direction crop bounds (G7).
7. **KW36 golden** edits only after the page images are checked by eye (RCA T6, unchanged).
8. **Holdout:** run on one more PP-OCRv6 edition and hand-check its multi-line titles before merge (G1).
9. **Gates unchanged:** 91/91 pairing, 0 wrong prices, 8 chained, 0 fused, KW36 count 17, `tsc --noEmit` from `pipeline/` with its own binary. The fix commit notes the one-time product re-keying of the ~31 changed Migros names (§1).
10. **Follow-up (not this fix):** let `extractProductMetadata` read `labels` (organic, later IP-SUISSE for display). Only then can organic markers leave the name.

## 6. Open decisions

**Tech Lead (technical, TL decides):**
- A1: lift badges into `sourceAttributes.labels` instead of deleting them; the label vocabulary goes in the domain.
- A2: keep organic markers (`BIO`/`Bio`/`Demeter`/`Knospe`) in the name until `isOrganic` reads labels.
- A3: char-width ratio as the primary bold test, ANDed with pitch-or-trigger, fail short on disagreement; conjunction-ended lines as a trigger.
- A4: suspended hyphen at a line end (conjunction continuation keeps `- `), digit continuation keeps `-`, hyphen look-alike normalisation.
- G1 holdout edition and G2 independent truth check as merge conditions.
- Correct the RCA §4 sentence about other retailers (Volg/Denner do carry IP-SUISSE in names; this does not change the decision, because identity is per store).

**PM (product):**
- Fairtrade kept or lifted into labels (RCA's open item; unchanged). With A1 nothing is lost either way, because the label is kept as data.
- Optional, later: show certification labels (IP-SUISSE, AOP, MSC) on the deal card once they are captured as data. Not needed for this fix.
