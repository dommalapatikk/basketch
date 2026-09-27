# RCA — Migros WP-10: multi-line product names truncated at the line break

- Date: 2026-09-26
- Author: Tech Lead (RCA only — no production code changed)
- Code under review: worktree `agent-a93682c65ace6ef3d`, HEAD `62144d7`, `pipeline/collection/infrastructure/migros/migros-flyer-source.ts`
- Trigger: QA report `docs/qa/2026-09-26-qa-migros-wp10.md`, Check 3
- Evidence: committed OCR fixture `__fixtures__/kw39/ocr-kw39-zh-ppocrv6.jsonl`, the adapter's real output on it (91 offers, dumped with `parseFlyer` via tsx), and the KW39 page images (`.claude/worktrees/tl-ocr-bench/kw39/page_N.jpg`, 2199x2997 — the same pixel space as the OCR boxes). Every "printed" name below was read by eye from the page crop, not from algorithm output.

## 1. Summary

Pairing and prices are correct (91/91). Names are not: **31 of 91 published names differ from the printed bold title** (32 if Fairtrade is treated as a badge) (table in §6). Two code defects, one test defect:

| # | Defect | Where |
|---|---|---|
| D1 | A second name line is only looked for when line 1 ends in `-` or is exactly `Migros`. Any other wrapped title stops at line 1. | `looksIncomplete`, `migros-flyer-source.ts:726-730`; gate at `findOfferName` `:833` |
| D2 | At most ONE continuation line, and only its first comma segment, is ever joined. | `findOfferName` `:835-840` (`split(',')[0]`, no loop) |
| D3 | A line-end hyphen followed by a lowercase word is replaced with a SPACE ("Kalbs- / geschnetzeltes" -> "Kalbs geschnetzeltes"). German typesetting: that is a word-break hyphen and must vanish with no space. | `joinNameParts`, `:796-803` (the `continuationStartsUpper` false branch) |
| T1 | The KW39 gate judges names by one accent- AND SPACE-insensitive substring keyword, so a truncated name or a wrong space still scores "ok". | `migros-kw39-ground-truth.test.ts:37-67` (`normalize`, `judge`) + `kw39-zh-truth.json` (keywords only, no printed names) |

The name-must-start-right-of-price rule (`startsRightOfOwnPrice`, `:620`) and the y-band (`findPrimaryNameLine`, `:757-771`) are NOT involved: they select line 1 correctly in every case. Line 2 is never considered by them — it is only reachable through `findContinuationLine`, and D1 stops us from calling it.

## 2. Mechanism, case by case (OCR items from `ocr-kw39-zh-ppocrv6.jsonl`, box = [x0, y0, x1, y1] px)

The code path for an ordinary anchor is `resolveOfferDetails` (`:1070`) -> `findOfferName` (`:812`) -> `findPrimaryNameLine` (`:757`) picks line 1 -> `looksIncomplete(line1)` (`:728`) -> only if true, `findContinuationLine` (`:736`, x0 within 20px, gap -10..0.01*pageHeight) -> `continuation.text.split(',')[0]` (`:838`) -> `joinNameParts` (`:796`).

| Page, price | OCR stack under the name (bold title lines in **bold**) | Why it stops | Published |
|---|---|---|---|
| p6 3.20/4.20 | **[1382,2573,1563,2616] 'Migros Bio'** / **[1385,2607,1527,2648] 'Wienerli'** / [1385,2653] 'Schweiz, 4 Stück,' | 'Migros Bio' is not in `INCOMPLETE_BRAND_WORDS` (only the exact string 'Migros') -> D1 | `Migros Bio` |
| p6 6.95/8.80 | **[1385,1024,1664,1063] 'Spécialité Suisse'** / **[1383,1056,1746,1100] 'Bündner Rohschinken,'** / **[1385,1094,1560,1130] 'IP-SUISSE'** / [1385,1137] 'hauchdünn geschnitten, 160 g,' | no trailing '-' -> D1 | `Spécialité Suisse` |
| p9 6.95/8.85 | **[357,577,739,612] 'Reibkäse Emmentaler &'** / **[356,609,624,650] 'Le Gruyère, AOP'** / [356,651] '3 x 130 g, …' | ends with '&', not '-' -> D1 | `Reibkäse Emmentaler &` |
| p11 3.36/4.80 | **[1457,2648,1773,2687] 'Gesamte Ponti- und'** / **[1458,2684,1806,2719] 'Giacobazzi-Sortiment'** / [1454,2725] 'z.B. Ponti Aceto …' | ends with 'und' (the '-' is a mid-line suspended hyphen) -> D1 | `Gesamte Ponti- und` |
| p4 5.95/7.60 | **[356,1148,633,1190] 'Rindshuftsteaks,'** / **[357,1186,532,1222] 'IP-SUISSE'** / [357,1230] '2 Stück, per 100 g,' | no '-' -> D1; and the trailing comma of line 1 is never stripped | `Rindshuftsteaks,` |
| p4 2.80/3.50 | **'Rindssiedfleisch mager,'** / **'IP-SUISSE, an der Theke'** | D1 + trailing comma | `Rindssiedfleisch mager,` |
| p9 15.80/18.60 | **'Valflora Vollmilch UHT,'** / **'IP-SUISSE'** | D1 + trailing comma | `Valflora Vollmilch UHT,` |
| p21 2.36/2.95 | **[1455,1000] 'Alle Nature Clean-Reinigungsmittel,'** / **[1455,1035] '-Automaten-und -Handgeschirrspülmittel'** | D1 + trailing comma | `Alle Nature Clean-Reinigungsmittel,` |
| p5 3.50/3.95 | **[1043,1926,1267,1962] 'Migros Kalbs-'** / **[1037,1955,1303,2003] 'geschnetzeltes,'** / **[1043,1994,1218,2030] 'IP-SUISSE'** | joined (ends '-'), but continuation starts lowercase -> `joinNameParts` false branch drops '-' and inserts ' ' -> D3 | `Migros Kalbs geschnetzeltes` |
| p7 14.95/27.80 | **[1041,1704] 'M-Classic Lachsrücken-'** / **[1041,1737] 'filet ohne Haut, ASC'** | same D3; plus D2 keeps only 'filet ohne Haut' (correct here by luck) | `M-Classic Lachsrücken filet ohne Haut` |
| p10 16.90/26.00 | **[1044,2689] 'Garofalo Frische-Pasta'** / **[1040,2721] 'gekühlt'** | D1 | `Garofalo Frische-Pasta` |
| p18 10.95/14.70 | **'Elmex Zahnpasta-'** / **'Kariesschutz'** / **'oder -Sensitive'** | joined once, D2 (single continuation) drops line 3 | `Elmex Zahnpasta-Kariesschutz` |

Same D1 shape, all p1-p15 (full list in §6): 'Migros Schweinsnierstück' (+'am Stück'), "Anna's Best" (+'Orangensaft gekühlt'), 'Schweinshalssteaks' (+'mariniert'), 'Migros Poulet' (+'Mini Délice'), 'Prosciutto hauchdünn' (+'geschnitten', p6 and p11), 'Weisswürste' (+'mit Senf'), 'M-Classic Alaska' (+'Seelachsloins ohne Haut'), 'Migros Bio Lachsfilets' (+'mit Haut'), 'Le Gruyère' (+"d'Alpage"), 'Migros Fondue' (+'Moitié-Moitié'), 'Emmi Luzerner' (+'Rahmkäse'), 'Züribieter Joghurt' (+'Nature'), 'Steinofen Bio' (+'Urchiges Brot'), 'Petit Bonheur' (+'Russenzopf'), 'Frey Coaties' (+'Crispy Salzbrezel'), 'Sélection Trauben' (+'Uva Italia'), 'Rinds-Meatballs' (+'Swiss Black Angus'), 'St. Galler Olma-Bratwürste' (joined correctly, badge ', IGP' already cut by D2's comma split).

### Why D3 exists (history)

`joinNameParts`'s lowercase branch was written on KW36 for 'Schweins-Nierstuck-' + 'steaksmariniert,' (see the golden-master header, `migros-flyer-source.test.ts:384-397`). The comment reads it as "Nierstück steaks, mariniert". That is very likely a mis-reading: under German typesetting a line-end hyphen followed by a lowercase word is a word break, so the printed word is almost certainly the compound "Nierstücksteaks", and "steaksmariniert" is the OLD engine's lost space ("steaks mariniert" — a Fix A defect, not a join defect). **Not verified by eye**: the KW36 page image is not in the repo (only the OCR JSON). The Builder must fetch KW36 p4 and confirm before the golden master is edited (§5, T6). The KW39 fixture shows the rule is wrong on clean OCR: 'Kalbs-'/'geschnetzeltes' and 'Lachsrücken-'/'filet' are unambiguous word breaks. The rule generalised from one noisy sample.

### Why a simple "always take the next line" fix is not enough

The bold title block and the regular-weight description below it share x0 (both left-aligned at the same column edge, within 3px). Geometry measured on 37 KW39 tiles (my scratch measurement, bold vs regular read from the page images):

| metric | bold->bold (title continues) | bold->regular (description starts) |
|---|---|---|
| line pitch, px (centre to centre) | 32-36 (p24's larger type: 49) | 40-45 (p24: 56) |
| pitch / line-1 box height | 0.74-1.08 | 0.88-1.26 (overlap) |
| whitespace gap y0(next) - y1(prev) | -9..+2 px | 0..+9 px (overlap) |

Only raw pitch separates the two, with a thin margin (36 vs 40 px). So the join rule must combine pitch with content guards (descriptor / price / "z.B." / "(" lines are never title), and keep the existing hyphen/brand triggers as a second path — see §5.

## 3. Why the tests missed it

1. **The truth table stores no names.** `kw39-zh-truth.json` holds, per (page, sale, statt), only `acceptedKeywords` — one short stem each: `migrosbio`/`wienerli`, `specialite`/`bundner`, `reibk`, `ponti`, `rindshuft`, `kalbsgeschn`. It is a *pairing* truth table (is this the right product?), not a *naming* truth table. It was designed that way for the mis-pair defect (RCA 2026-09-25) and does that job well.
2. **The judge is substring-after-normalisation.** `normalize` (`migros-kw39-ground-truth.test.ts:37-45`) strips accents, lowercases and **deletes every space**; `judge` (`:53-67`) passes if ANY keyword is a substring. So:
   - `Migros Bio` -> `migrosbio` contains `migrosbio` -> ok (the keyword list even accepts the truncated brand as sufficient).
   - `Spécialité Suisse` -> contains `specialite` -> ok.
   - `Reibkäse Emmentaler &` -> contains `reibk`; `Gesamte Ponti- und` -> contains `ponti`; `Rindshuftsteaks,` -> contains `rindshuft`.
   - `Migros Kalbs geschnetzeltes` -> space deleted -> `migroskalbsgeschnetzeltes` contains `kalbsgeschn` -> ok. **The space-insensitive normaliser makes the D3 defect literally invisible.**
3. **The named regressions are `toContain`.** The p5 test (`:173-177`) asserts `toContain('geschnetzeltes')` — it was written to prove the continuation was joined at all, and passes with the wrong separator.
4. **The KW36 golden master encodes D3.** `'Schweins-Nierstuck steaksmariniert'` (`migros-flyer-source.test.ts:420`) pins the space-join as expected output — the "test encodes the defect" trap the golden-master header itself warns about.
5. **`looksLikeFusedName` cannot see truncation.** It detects lost spaces, not lost lines.

**Decision:** yes, the truth table needs the full printed name, hand-verified from the page image, and the gate needs an exact name assertion. Keywords stay (they are the pairing judge and keep the 91/91 history meaningful); a new field is added beside them:

```json
{ "page": 6, "salePrice": 3.2, "originalPrice": 4.2, "acceptedKeywords": ["wienerli", "migrosbio"],
  "expectedName": "Migros Bio Wienerli" }
```

- `expectedName` = the printed bold title after the naming rules in §4 (so it is exactly what we intend to publish), read by eye — never pasted from adapter output.
- Where the OCR engine itself loses a character or space that no parser can restore (e.g. PP-OCRv6 reads `Gesichts-und` for printed `Gesichts- und`, `-Automaten-und` for `-Automaten- und`), the entry carries `"ocrReads": "<exact string>"` with a one-line reason, and the test compares against that instead. This keeps the gate exact while keeping the engine's own defects visible as data rather than hiding them in a normaliser.
- The comparison is **exact string equality**, no normalisation. Keyword `judge` remains a separate test (pairing).
- Minimum scope: the 91 published offers (table §6, all read from the page crops for this RCA). Recommended: all 133, so an offer that becomes published later is checked on day one; the 42 unpublished ones need the same by-eye pass.

## 4. Naming rules — what the published name contains

Consistency check against the other adapters: Coop (aktionis card titles, e.g. `Betty Bossi Naturafarm Schweinshals Cordonbleu ca. 680g`) and Denner (`_tracking_item_name`) publish the retailer's own product title including brand and product line, with no certification-badge suffix. Downstream, `product-metadata.ts:13` treats `migros bio`, `m-classic`, `anna's best` as BRANDS and `isOrganic` (`:52-54`) reads `bio` from the name; nothing reads IP-SUISSE/AOP/MSC. `CLAUDE.md` says names are normalised (lowercased, whitespace collapsed) before upsert, so separators and hyphens survive into identity — they must be right here.

**R1 — The name is the whole bold title block.** Line 1 plus every following line of the same bold block, in order. It ends at the first regular-weight line (origin, pack size, "per 100 g", "z.B. …", "(ohne …)", price line). The product noun is therefore always included (`Migros Bio Wienerli`, `Spécialité Suisse Bündner Rohschinken`, `Petit Bonheur Russenzopf`).

**R2 — Keep variant/cut/flavour words that are part of the title.** `mariniert`, `am Stück`, `geschnitten`, `Nature`, `mit Senf`, `mit Haut`, `ohne Haut`, `gekühlt`, `Mini Délice`, `Uva Italia`, `Moitié-Moitié`, `d'Alpage`, `mager`. They distinguish products (Joghurt vs Joghurt Nature; Lachsfilets mit Haut vs ohne) and are exactly what a shopper matches on. "Nature" is kept: it is a flavour, not a badge.

**R3 — Drop certification / quality-programme / service badges** when they form a whole comma-separated segment of the title: `IP-SUISSE`, `IP-SUISSE+`, `AOP`, `IGP`, `MSC`, `ASC`, `Fairtrade`, `BIO` (standalone all-caps), `Demeter` (standalone), `an der Theke`, `in Selbstbedienung`. They are attributes, not identity; the other retailers' names do not carry them. Implemented as a closed list (`NAME_BADGE_SEGMENTS`), not a heuristic. `Bio` inside a brand (`Migros Bio`, `Steinofen Bio`) is NOT a standalone segment and is kept.
   - Product-owner flag: `Minirosen, Fairtrade` -> `Minirosen` changes an already-correct-looking name. Fairtrade is a certification like MSC, so it follows R3. If the PM wants ethical labels kept, it is a one-line removal from the list — ask, do not decide.

**R4 — Separators when joining line N to line N+1:**
   | Line N ends with | Line N+1 starts with | Join | Example |
   |---|---|---|---|
   | `-` | lowercase letter | drop the hyphen, **no space** (word-break hyphen) | `Kalbs-`+`geschnetzeltes` -> `Kalbsgeschnetzeltes`; `Lachsrücken-`+`filet` -> `Lachsrückenfilet` |
   | `-` | uppercase letter | keep the hyphen, no space (compound hyphen) | `Fleischkäse-`+`Cordons-bleus`; `Zahnpasta-`+`Kariesschutz`; `Olma-`+`Bratwürste` |
   | anything else | `-` (suspended-hyphen list item) | single space | `Kariesschutz`+`oder -Sensitive`; `Reinigungsmittel,`+`-Automaten…` |
   | anything else (incl. a mid-line `Ponti- und`, `&`) | anything | single space | `Ponti- und`+`Giacobazzi-Sortiment`; `Emmentaler &`+`Le Gruyère` |
   The `Ponti- und` suspended hyphen is never at the line end, so it is never touched — it is carried verbatim.

**R5 — Strip trailing punctuation** (`,` `;` whitespace) from the final name, and from any segment left dangling after badge removal. Internal commas that separate real title parts stay (`Alle Nature Clean-Reinigungsmittel, -Automaten- und -Handgeschirrspülmittel`).

**R6 — Never invent.** The adapter publishes only OCR text; it does not restore characters the engine lost (that is `ocrReads` in the truth table, and Fix A territory).

## 5. Fix design (Builder) — tests first

### 5.1 Code shape (all inside `migros-flyer-source.ts`, adapter-local; no domain change)

1. **`collectTitleLines(page, tile, primary, pageHeight): OcrItem[]`** replaces the single `findContinuationLine` call. Starting from line 1, repeatedly take the next line that is x0-aligned (|dx| <= 20px, as today) and directly below, and **accept it as title** when ALL of:
   - not `PRICE` / `PERCENT` / `STATT_WORD` / `AB_STUECK`, not `DESCRIPTOR`, not starting `z.B.` or `(`;
   - **either** the existing trigger holds (previous line ends `-`, or is a bare brand word — widen `INCOMPLETE_BRAND_WORDS` to `Migros`, `Migros Bio`, `M-Classic`, `Anna's Best` only if a fixture needs it), **or** the line pitch (centre to centre) is `<= TITLE_LINE_PITCH_MAX_FRACTION * pageHeight`, starting value **0.0125** (37.5px on 2997px: bold 32-36px, regular 40-45px on KW39; KW36 bold 32-36, regular 40-44).
   - Hard cap 4 lines (KW39 max is 3).
   The thin margin is the known risk: document the measured table from §2 in the constant's header, and pin it with the tests below. p24's larger type (bold pitch 49px) is covered by the hyphen trigger ('St. Galler Olma-'), not by the pitch rule.
2. **`joinTitleLines(lines: string[]): string`** — pure, R4 separators, replaces `joinNameParts` (fix the lowercase branch: no space). Keep `joinNameParts` exported only if other callers need it; otherwise delete it with its tests rewritten.
3. **`cleanTitle(name: string): string`** — pure: split on `,`, drop segments that are exactly a `NAME_BADGE_SEGMENTS` entry (R3, case-sensitive for the all-caps ones), rejoin with `, `, strip trailing punctuation (R5). Replaces the implicit `split(',')[0]` (D2), which currently also cuts real title text.
4. The crop box (`joinedBox`) spans all accepted lines.
5. `findMultiBuyNameLine` path gets the same `collectTitleLines` + clean treatment (the Gran Pavesi name is single-line on KW39, so this is a no-op there; verify).

### 5.2 TDD order — each test written and seen RED before code

Pure units (`migros-flyer-source.test.ts`):

- T1 `joinTitleLines`: `['Migros Kalbs-','geschnetzeltes']` -> `Migros Kalbsgeschnetzeltes`; `['M-Classic Lachsrücken-','filet ohne Haut']` -> `M-Classic Lachsrückenfilet ohne Haut`; `['Migros Fleischkäse-','Cordons-bleus']` -> `Migros Fleischkäse-Cordons-bleus`; `['Elmex Zahnpasta-','Kariesschutz','oder -Sensitive']` -> `Elmex Zahnpasta-Kariesschutz oder -Sensitive`; `['Gesamte Ponti- und','Giacobazzi-Sortiment']` -> `Gesamte Ponti- und Giacobazzi-Sortiment`; `['Reibkäse Emmentaler &','Le Gruyère']` -> `Reibkäse Emmentaler & Le Gruyère`.
- T2 `cleanTitle`: `Rindshuftsteaks, IP-SUISSE` -> `Rindshuftsteaks`; `Rindssiedfleisch mager, IP-SUISSE, an der Theke` -> `Rindssiedfleisch mager`; `Spécialité Suisse Bündner Rohschinken, IP-SUISSE` -> `Spécialité Suisse Bündner Rohschinken`; `Züribieter Joghurt Nature, IP-SUISSE` -> `Züribieter Joghurt Nature` (Nature kept); `Steinofen Bio Urchiges Brot` unchanged (Bio kept); `Alle Nature Clean-Reinigungsmittel, -Automaten-und -Handgeschirrspülmittel` unchanged except nothing trailing.
- T3 pitch discriminator on synthetic items: bold pair at 34px pitch joins; regular line at 42px does not; a DESCRIPTOR line at 34px does not; 5 stacked bold lines stop at the cap.

Fixture-level (`migros-kw39-ground-truth.test.ts`):

- T4 Add `expectedName` (+ `ocrReads` where needed) to `kw39-zh-truth.json` for the 91 published offers from the §6 table (hand-verified; the tech lead signs the `verifiedBy` line). New test **"every published offer's name equals its printed title exactly"** — no normaliser. RED today with 31 failures (§6), GREEN after the fix.
- T5 Keep, unchanged: published === 91, zero wrong names (keyword judge), zero wrong prices, correct === published, chained-tile tripwire === 8, zero fused. **Any change to these numbers fails the build** — the fix touches only name text, never pairing, so they must hold exactly. Tighten the p5 regression from `toContain('geschnetzeltes')` to `toBe('Migros Kalbsgeschnetzeltes')` and the p11 Ponti case to `toBe('Gesamte Ponti- und Giacobazzi-Sortiment')`.
- T6 KW36 golden master (`migros-flyer-source.test.ts:405-431`): expected changes are deliberate edits with a reason in the same commit. Predicted from the KW36 OCR stacks (line pitch in px): `Schweins-Nierstuck steaksmariniert` -> `Schweins-Nierstucksteaksmariniert` (R4; the lost space is the old engine's, flag as Fix A), `Rinds-Entrecotes` -> `Rinds-Entrecotes mariniert` ('mariniert,IP-SUISSE' at 35px), `Schweins-Geschnetzeltes,` -> `Schweins-Geschnetzeltes`, `Schweinsfilet,` -> `Schweinsfilet` (+ possibly `an der Theke`, dropped by R3), `Schweinsbraten vom Hals,` -> `Schweinsbraten vom Hals`, `Delikatess-Fleischkase` unchanged. **The Builder must get the KW36 p3-p5 page images and confirm each by eye before editing** — do not accept adapter output as the new golden values (HANDOVER "test encodes the defect" trap). Count stays 17.
- T7 Crop region: for the p6 Wienerli offer, the crop box includes the 'Wienerli' line (y1 >= 2648).

Gates the fix must not regress: 91/91 pairing, 0 wrong names, 0 wrong prices, 8 chained, 0 fused, KW36 count 17, and `tsc --noEmit` from `pipeline/` with its own binary.

## 6. Hand-verified printed titles (after §4 rules) for the 31 KW39 offers whose published name changes

Read by eye from `tl-ocr-bench/kw39/page_N.jpg` crops on 2026-09-26. The other 60 published names already equal the printed title.

| Page | Sale / statt | Published today | Expected name |
|---|---|---|---|
| 1 | 1.50 / 2.75 | Migros Schweinsnierstück | Migros Schweinsnierstück am Stück |
| 2 | 3.95 / 4.95 | Sélection Trauben | Sélection Trauben Uva Italia |
| 3 | 4.75 / 7.95 | Anna's Best | Anna's Best Orangensaft gekühlt |
| 4 | 5.95 / 7.60 | Rindshuftsteaks, | Rindshuftsteaks |
| 4 | 7.95 / 9.95 | Rinds-Meatballs | Rinds-Meatballs Swiss Black Angus |
| 4 | 2.80 / 3.50 | Rindssiedfleisch mager, | Rindssiedfleisch mager |
| 4 | 1.65 / 2.15 | Schweinshalssteaks | Schweinshalssteaks mariniert |
| 5 | 3.50 / 3.95 | Migros Kalbs geschnetzeltes | Migros Kalbsgeschnetzeltes |
| 5 | 7.60 / 9.50 | Migros Poulet | Migros Poulet Mini Délice |
| 6 | 6.50 / 9.00 | Prosciutto hauchdünn | Prosciutto hauchdünn geschnitten |
| 6 | 6.95 / 8.80 | Spécialité Suisse | Spécialité Suisse Bündner Rohschinken |
| 6 | 1.80 / 2.35 | Bratspeck, IP-SUISSE | Bratspeck |
| 6 | 5.95 / 7.90 | Weisswürste | Weisswürste mit Senf |
| 6 | 3.20 / 4.20 | Migros Bio | Migros Bio Wienerli |
| 7 | 7.95 / 11.10 | M-Classic Alaska | M-Classic Alaska Seelachsloins ohne Haut |
| 7 | 4.90 / 6.15 | Migros Bio Lachsfilets | Migros Bio Lachsfilets mit Haut |
| 7 | 14.95 / 27.80 | M-Classic Lachsrücken filet ohne Haut | M-Classic Lachsrückenfilet ohne Haut |
| 8 | 2.20 / 2.80 | Le Gruyère | Le Gruyère d'Alpage |
| 8 | 15.25 / 19.10 | Migros Fondue | Migros Fondue Moitié-Moitié |
| 8 | 2.20 / 2.80 | Emmi Luzerner | Emmi Luzerner Rahmkäse |
| 9 | 6.95 / 8.85 | Reibkäse Emmentaler & | Reibkäse Emmentaler & Le Gruyère |
| 9 | 15.80 / 18.60 | Valflora Vollmilch UHT, | Valflora Vollmilch UHT |
| 9 | 2.60 / 3.10 | Züribieter Joghurt | Züribieter Joghurt Nature |
| 10 | 16.90 / 26.00 | Garofalo Frische-Pasta | Garofalo Frische-Pasta gekühlt |
| 11 | 6.50 / 9.00 | Prosciutto hauchdünn | Prosciutto hauchdünn geschnitten |
| 11 | 3.36 / 4.80 | Gesamte Ponti- und | Gesamte Ponti- und Giacobazzi-Sortiment |
| 12 | 3.15 / 3.95 | Steinofen Bio | Steinofen Bio Urchiges Brot |
| 12 | 3.60 / 4.50 | Petit Bonheur | Petit Bonheur Russenzopf |
| 15 | 4.70 / 5.90 | Frey Coaties | Frey Coaties Crispy Salzbrezel |
| 18 | 10.95 / 14.70 | Elmex Zahnpasta-Kariesschutz | Elmex Zahnpasta-Kariesschutz oder -Sensitive |
| 21 | 2.36 / 2.95 | Alle Nature Clean-Reinigungsmittel, | Alle Nature Clean-Reinigungsmittel, -Automaten- und -Handgeschirrspülmittel (`ocrReads`: `…-Automaten-und -Handgeschirrspülmittel`) |
| 23 | 12.65 / 14.90 | Minirosen, Fairtrade | Minirosen (PM flag, §4 R3) |

(32 rows: 31 certain changes plus the PM-flagged Minirosen.) Also `Gesichts-und Haarpflege-Sortiment` (p1) needs `ocrReads` — printed `Gesichts- und`, unchanged by the fix.

`St. Galler Olma-Bratwürste` (p24), `Migros Fleischkäse-Cordons-bleus`, `Migros Gelbflossen-Thunfischfilets`, `Garofalo Frische-Pasta-Sortiment gekühlt` are already correct and must stay so (they exercise the uppercase-compound branch).

## 7. Open items

- PM: keep or drop `Fairtrade` (R3).
- Builder: fetch KW36 page images for T6; do not derive golden values from output.
- Known risk: pitch threshold margin is ~4px at 2997px page height. If a future flyer changes type size, T3/T4 turn red rather than silently truncating — that is the intended failure mode.

## § Cross-review resolution (2026-09-26)

Reviewed: `docs/rca/2026-09-26-architect-migros-name-cross-review.md`. I re-measured three of the Architect's claims on the KW39 fixture before ruling (scratch script, not committed). This section **supersedes §4 R3/R4 and §5** wherever they differ. §6 expected names are unchanged: no ruling below changes a KW39 expected name.

### Rulings

| Item | Ruling | Reason / evidence |
|---|---|---|
| **A1** badges -> `sourceAttributes.labels` | **ACCEPT.** `cleanTitle` returns `{ name, labels }`. The adapter publishes `name` and passes `labels` to `createSourceAttributes({ labels })`. `CERTIFICATION_LABELS` (IP-SUISSE, IP-SUISSE+, AOP, IGP, MSC, ASC, Fairtrade) lives in `collection/domain/`, with a matcher that compares upper-cased, whitespace-free text (KW36 `IP-SUiSSE`). Service phrases (`an der Theke`, `in Selbstbedienung`) stay adapter-local and are dropped, not labelled. | Verified: `source-attributes.ts:48` already documents `labels` as "Certification and origin labels … 'IP-SUISSE'". Deleting the badge was throwing domain data away. Denner already follows this shape. |
| **A2** keep organic markers in the name | **ACCEPT.** BIO/Bio/Demeter/Knospe are never lifted out of the name until `extractProductMetadata` reads `labels` (follow-up, not this fix). | Verified: `isOrganic` (`product-metadata.ts:52-54`) reads only the name. Stripping would silently flip `is_organic`. |
| **A3** width-per-char AND (pitch OR text trigger), fail short | **ACCEPT, with the AND made mandatory.** Accept a continuation line only when: content guards pass; x0 is within 20px; `cwRatio >= 0.85`; **and** (pitch `<= 0.0125 × H`, or the previous accepted line ends in `-`, `&`, ` und`, ` oder`, or is a bare brand word); cap 4. If the signals disagree, stop. The scan stops at the first rejected line and never skips over it. | My re-measure confirms that width alone is also thin: p14 `Lindt Lindor Kugeln` -> regular `Milch,` has cwRatio **0.87**, which is above 0.85. It is rejected only because its pitch (41px) fails and no trigger fires. So neither signal may ever be used alone. The KW39 lines that end in a conjunction and are NOT titles (`Greif zu und` p3, `inkl. Aluschale und` p4) are description/promo lines. They are never reached, because the scan stops at the first rejected line, so the trigger cannot pull them in. Standalone `IP-SUISSE` title lines measure cwRatio 1.10–1.25 (p4 ×2, p5, p9), so they are collected and then lifted into labels. Fail-short direction agreed: a true prefix is visible in T4, while a merged description silently re-keys products every week. |
| **A4** hyphen exceptions | **ACCEPT all three.** In `joinTitleLines`, evaluated in this order: (1) normalise U+2010, U+2011 and a line-end en dash to `-`; (2) the continuation's first word is a conjunction (`und oder bzw. sowie u. & et ou e o`) -> keep `-` and add a space; (3) a digit on either side of the line-end `-` -> keep `-`, no space; (4) a letter before `-` and a lowercase letter after it -> drop `-`, no space; (5) an uppercase letter after it -> keep `-`, no space; (6) otherwise -> a single space. | Rule (2) must come before (4). Without it, `Gesichts-`/`und …` would become `Gesichtsund …`. KW39 has the mid-line form twice, so the line-end form will appear. Accepted residual risk: `Anti-`/`aging`-style loanwords. |
| **G1** holdout edition | **ACCEPT as a merge condition.** Before merge, run the fixed adapter on one more PP-OCRv6 edition (KW40 ZH, or another KW39 regional edition). Hand-check every multi-line title against the page image and record the result in the fix doc. Commit the fixture if its size allows. | Thresholds 0.0125 and 0.85 are both tuned on KW39. |
| **G2** independent truth check | **ACCEPT.** QA spot-checks the 32 changed §6 rows and the KW36 golden edits against the page crops. `verifiedBy` names both the tech lead and QA. The Builder never edits `kw39-zh-truth.json` (or the KW36 golden values) in the same commit as adapter code. The truth commit lands first and on its own. | The same person (TL) wrote the RCA and the expected names. |
| **G3** pin `ocrReads` | **ACCEPT.** A test pins the count at exactly 2 (p1 `Gesichts-und`, p21 `-Automaten-und`), and each entry needs a non-empty `ocrReadsReason`. | Stops `ocrReads` from becoming an escape hatch. |
| **G4** extra unit cases | **ACCEPT all.** Also add the `Milch,` case: cwRatio 0.87 at 41px pitch must NOT join (width passes, pitch fails, no trigger). | This is the re-measured near-miss above. |
| **G5** assert labels | **ACCEPT.** Assert `sourceAttributes.labels` on every §6 offer that loses a badge: p4 Rindshuftsteaks, Rinds-Meatballs and Rindssiedfleisch `['IP-SUISSE']`; p4 Schweinshalssteaks `['IP-SUISSE']`; p5 Kalbsgeschnetzeltes `['IP-SUISSE']`; p6 Prosciutto, Spécialité and Bratspeck `['IP-SUISSE']`; p7 Alaska `['MSC']` and Lachsrückenfilet `['ASC']`; p8 Le Gruyère and Fondue `['AOP']`; p9 Reibkäse `['AOP']`, Valflora and Züribieter `['IP-SUISSE']`; p11 Prosciutto `['IP-SUISSE']`; p24 Olma-Bratwürste `['IGP']`. The Builder confirms each label against the page crop (§2 stacks). | Tests A1, so it is not just implemented. |
| **G6** port-contract name tail | **ACCEPT.** For all adapters: no `productName` ends in `,` `;` `-` `&` or a bare ` und`/` oder`. If an existing adapter fails, file that as a separate defect; do not relax the rule. | A cheap cross-retailer invariant. It alone would have caught 6 of the 31. |
| **G7** crop box both directions | **ACCEPT.** T7 also asserts crop `y1 <` the first description line's `y0`. | A merged description would otherwise pass T7. |
| **§4 correction** | **ACCEPT.** My sentence "the other retailers' names do not carry them" was wrong: Volg (`Williams Birnen IP-Suisse`) and Denner (`Laugenkranz mit IP-SUISSE Mehl`) carry IP-SUISSE in names. The decision stands because product identity is per store (`product-resolve.ts` keys on `source_name` within one store). **Rejected:** any cross-retailer badge stripping in `normalizeProductName`, because it would re-key Volg/Denner products with no defect behind it. | Architect's evidence accepted as stated. |

### Final agreed plan (supersedes §5.2 ordering)

1. **Truth commit (alone):** `expectedName`/`ocrReads` for the 91 published offers from §6, plus the `ocrReads` count pin (G3). QA spot-check (G2) happens before this commit. The exact-name test is added RED. **Status: waiting on user/PM permission to edit the truth JSON. Fairtrade stays `Minirosen, Fairtrade` with `PENDING-PM` until the PM decides. With A1 nothing is lost either way, because the label is kept as data.**
2. **Domain:** `CERTIFICATION_LABELS` plus a tolerant matcher in `collection/domain/`, with unit tests.
3. **Adapter pure units, RED then GREEN:** `joinTitleLines` (A4 order), `cleanTitle -> { name, labels }` (lifts labels, drops service phrases, strips the tail per R5, idempotent, never returns an empty name, keeps organic markers). Includes all G4 cases.
4. **`collectTitleLines`** (A3), used by both `findPrimaryNameLine` and `findMultiBuyNameLine`. T3 synthetic cases include the cascade case and the `Milch,` near-miss.
5. **Wire labels** into `createSourceAttributes` (G5 assertions).
6. **Port contract** name-tail invariant (G6); T7 crop bounds in both directions (G7).
7. **KW36 golden edits** only after the KW36 page images are checked by eye (T6), with QA spot-check (G2).
8. **Holdout edition** hand-check (G1). This is a merge condition.
9. **Unchanged gates:** 91 published / 0 wrong names (keyword) / 0 wrong prices / 8 chained / 0 fused, KW36 count 17, and `tsc --noEmit` from `pipeline/` with its own binary. The fix commit states the one-time re-keying of the ~31 changed Migros names, so the SRE does not read the `products` churn as a fault.
10. **Follow-up (separate ticket):** `extractProductMetadata` reads `labels` (organic first). After that, organic markers may leave the name.

Open for the PM: Fairtrade in the name or only in labels. Open for later: showing certification labels on the deal card.
