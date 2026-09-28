# QA Spot-Check — Migros KW39 `expectedName` truth table (G2 independent check)

- Date: 2026-09-27
- Author: QA Tester (independent check of Tech Lead's hand-read `expectedName` values)
- Scope: `pipeline/collection/infrastructure/migros/__fixtures__/kw39/kw39-zh-truth.json` (worktree `agent-a93682c65ace6ef3d`, commit d8a826a)
- Method: opened each page image (`.claude/worktrees/tl-ocr-bench/kw39/page_N.jpg`) with the Read tool, located the offer by its price pair, read the bold title block by eye, applied the naming rules from `docs/rca/2026-09-26-tech-lead-migros-name-truncation.md` §4 + § Cross-review resolution (name = whole bold title block; drop certification/service badges IP-SUISSE/AOP/IGP/MSC/ASC, Fairtrade per PM P-13; keep Bio/Demeter/Knospe and descriptive words; line-break hyphen + lowercase joins with no hyphen, + uppercase keeps hyphen; suspended hyphen before und/oder keeps "- "), and compared the result to `expectedName`.
- Reference: this RCA's `verifiedBy` line already credits QA for this pass (pending until this report).

## Coverage

| Set | Count | Result |
|---|---|---|
| Changed rows (RCA §6, all 32: 31 certain + Minirosen PM flag) | 32 | 32 MATCH |
| `ocrReads` entries (p1 Gesichts-/Haarpflege, p21 Nature Clean) | 2 | 2 MATCH |
| Array-valued entries (p2 Kaki mini + Sélection Trauben; p8 Le Gruyère + Emmi Luzerner) | 2 keys / 4 names | 4 MATCH |
| Random unchanged rows | 10 | 10 MATCH |
| **Total distinct offers checked** | **43** | **0 mismatches** |

Pages opened: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 18, 19, 21, 23, 24 (19 of 24 pages — every page holding a changed row, an `ocrReads` entry, an array-valued entry, or a sampled unchanged row).

## Changed rows (32/32 MATCH)

| Page | Price | Printed bold title block (by eye) | Rule applied | `expectedName` | Verdict |
|---|---|---|---|---|---|
| 1 | 1.50/2.75 | "Migros Schweinsnierstück" / "am Stück, IP-SUISSE" | drop IP-SUISSE | Migros Schweinsnierstück am Stück | MATCH |
| 2 | 3.95/4.95 | "Sélection Trauben" / "Uva Italia" (2nd product at same price pair) | join lines | Sélection Trauben Uva Italia | MATCH |
| 3 | 4.75/7.95 | "Anna's Best" / "Orangensaft gekühlt" | join lines | Anna's Best Orangensaft gekühlt | MATCH |
| 4 | 5.95/7.60 | "Rindshuftsteaks," / "IP-SUISSE" | drop badge, strip comma | Rindshuftsteaks | MATCH |
| 4 | 7.95/9.95 | "Rinds-Meatballs" / "Swiss Black Angus," / "IP-SUISSE" | drop badge, strip comma | Rinds-Meatballs Swiss Black Angus | MATCH |
| 4 | 2.80/3.50 | "Rindssiedfleisch mager," / "IP-SUISSE, an der Theke" | drop badge + service phrase, strip comma | Rindssiedfleisch mager | MATCH |
| 4 | 1.65/2.15 | "Schweinshalssteaks" / "mariniert, IP-SUISSE" | drop badge, strip comma | Schweinshalssteaks mariniert | MATCH |
| 5 | 3.50/3.95 | "Migros Kalbs-" / "geschnetzeltes," / "IP-SUISSE" | hyphen+lowercase join, drop badge | Migros Kalbsgeschnetzeltes | MATCH |
| 5 | 7.60/9.50 | "Migros Poulet" / "Mini Délice" | join lines | Migros Poulet Mini Délice | MATCH |
| 6 | 6.50/9.00 | "Prosciutto hauchdünn" / "geschnitten, IP-SUISSE" | drop badge, strip comma | Prosciutto hauchdünn geschnitten | MATCH |
| 6 | 6.95/8.80 | "Spécialité Suisse" / "Bündner Rohschinken," / "IP-SUISSE" | drop badge, strip comma | Spécialité Suisse Bündner Rohschinken | MATCH |
| 6 | 1.80/2.35 | "Bratspeck, IP-SUISSE" | drop badge, strip comma | Bratspeck | MATCH |
| 6 | 5.95/7.90 | "Weisswürste" / "mit Senf" | join lines | Weisswürste mit Senf | MATCH |
| 6 | 3.20/4.20 | "Migros Bio" / "Wienerli" | join lines | Migros Bio Wienerli | MATCH |
| 7 | 7.95/11.10 | "M-Classic Alaska" / "Seelachsloins" / "ohne Haut, MSC" | drop badge | M-Classic Alaska Seelachsloins ohne Haut | MATCH |
| 7 | 4.90/6.15 | "Migros Bio Lachsfilets" / "mit Haut, an der Theke" | drop service phrase, strip comma | Migros Bio Lachsfilets mit Haut | MATCH |
| 7 | 14.95/27.80 | "M-Classic Lachsrücken-" / "filet ohne Haut, ASC" | hyphen+lowercase join, drop badge | M-Classic Lachsrückenfilet ohne Haut | MATCH |
| 8 | 2.20/2.80 | "Le Gruyère" / "d'Alpage, AOP" (1st product) | drop badge, strip comma | Le Gruyère d'Alpage | MATCH |
| 8 | 15.25/19.10 | "Migros Fondue" / "Moitié-Moitié, AOP" | drop badge, strip comma | Migros Fondue Moitié-Moitié | MATCH |
| 8 | 2.20/2.80 | "Emmi Luzerner" / "Rahmkäse" (2nd product, same price pair) | join lines | Emmi Luzerner Rahmkäse | MATCH |
| 9 | 6.95/8.85 | "Reibkäse Emmentaler &" / "Le Gruyère, AOP" | drop badge, strip comma | Reibkäse Emmentaler & Le Gruyère | MATCH |
| 9 | 15.80/18.60 | "Valflora Vollmilch UHT," / "IP-SUISSE" | drop badge, strip comma | Valflora Vollmilch UHT | MATCH |
| 9 | 2.60/3.10 | "Züribieter Joghurt" / "Nature, IP-SUISSE" | keep Nature, drop badge | Züribieter Joghurt Nature | MATCH |
| 10 | 16.90/26.00 | "Garofalo Frische-Pasta" / "gekühlt" | join lines | Garofalo Frische-Pasta gekühlt | MATCH |
| 11 | 6.50/9.00 | "Prosciutto hauchdünn" / "geschnitten, IP-SUISSE" | drop badge, strip comma | Prosciutto hauchdünn geschnitten | MATCH |
| 11 | 3.36/4.80 | "Gesamte Ponti- und" / "Giacobazzi-Sortiment" | mid-line hyphen untouched, join with space | Gesamte Ponti- und Giacobazzi-Sortiment | MATCH |
| 12 | 3.15/3.95 | "Steinofen Bio" / "Urchiges Brot" | join lines | Steinofen Bio Urchiges Brot | MATCH |
| 12 | 3.60/4.50 | "Petit Bonheur" / "Russenzopf" | join lines | Petit Bonheur Russenzopf | MATCH |
| 15 | 4.70/5.90 | "Frey Coaties" / "Crispy Salzbrezel" | join lines | Frey Coaties Crispy Salzbrezel | MATCH |
| 18 | 10.95/14.70 | "Elmex Zahnpasta-" / "Kariesschutz" / "oder -Sensitive" | hyphen+uppercase keep, suspended hyphen space | Elmex Zahnpasta-Kariesschutz oder -Sensitive | MATCH |
| 21 | 2.36/2.95 | "Alle Nature Clean-Reinigungsmittel," / "-Automaten- und -Handgeschirrspülmittel" | comma join with space, verbatim suspended hyphens | Alle Nature Clean-Reinigungsmittel, -Automaten- und -Handgeschirrspülmittel | MATCH |
| 23 | 12.65/14.90 | "Minirosen, Fairtrade" | drop Fairtrade per PM P-13, strip comma | Minirosen | MATCH |

## `ocrReads` entries (2/2 MATCH)

| Page | Price | Printed | `expectedName` | `ocrReads` | Verdict |
|---|---|---|---|---|---|
| 1 | 13.97/19.95 | "Gesichts- und Haarpflege-Sortiment" (single bold line, space visible after "Gesichts-") | Gesichts- und Haarpflege-Sortiment | Gesichts-und Haarpflege-Sortiment | MATCH — printed space confirmed by eye; `ocrReads` correctly models the engine dropping it |
| 21 | 2.36/2.95 | see changed-rows table above — space visible before "und" in "-Automaten- und" | (as above) | Alle Nature Clean-Reinigungsmittel, -Automaten-und -Handgeschirrspülmittel | MATCH — printed space confirmed by eye |

Note: the printed space itself was verified visually (both are clearly separate words with a gap on the page image); the `ocrReads` string is the tech lead's account of what PP-OCRv6 outputs, not independently re-run against the OCR engine, but the `expectedName` side of both entries is confirmed correct against the page.

## Array-valued entries (2 keys / 4 names, all MATCH)

- Page 2, 3.95/4.95: **"Kaki mini"** (bold, single line, top-right) — MATCH. **"Sélection Trauben Uva Italia"** (bold "Sélection Trauben" / "Uva Italia", two lines, same price pair) — MATCH.
- Page 8, 2.20/2.80: **"Le Gruyère d'Alpage"** (drop AOP) — MATCH. **"Emmi Luzerner Rahmkäse"** (join two lines) — MATCH.

## Random unchanged rows sampled (10/10 MATCH)

| Page | Price | `expectedName` | Verdict |
|---|---|---|---|
| 1 | 0.77/1.10 | Extra Kiwi grün | MATCH |
| 2 | 2.30/2.80 | Äpfel Gala | MATCH (confirmed the italic "«Aus der Region.»" script tagline above the bold title is correctly excluded from the name — same treatment on p6 Wyländer Rauchmöckli and p8/p9 tagline offers, spot-checked incidentally, all consistent) |
| 4 | 10.95/13.85 | Migros Rindshackfleisch | MATCH |
| 5 | 2.25/2.85 | Migros Fleischkäse-Cordons-bleus | MATCH — confirms the hyphen-uppercase branch stays correct (RCA §6 footnote) |
| 7 | 2.95/4.95 | Migros Gelbflossen-Thunfischfilets | MATCH — confirms hyphen-uppercase branch stays correct |
| 9 | 13.20/15.20 | M-Classic Kochbutter | MATCH |
| 10 | 4.23/6.50 | Garofalo Frische-Pasta-Sortiment gekühlt | MATCH — confirms hyphen-uppercase branch stays correct |
| 13 | 16.55/24.75 | Birra Moretti Zero | MATCH |
| 19 | 3.71/4.95 | Gesamtes Ceylor-, Cosano- und Feelgood-Sortiment | MATCH — good stress test for multiple mid-line hyphens before "und", all carried verbatim as the rule requires |
| 24 | 4.95/7.20 | St. Galler Olma-Bratwürste | MATCH — confirms hyphen-uppercase branch stays correct (RCA §6 footnote, p24's larger type handled via hyphen trigger not pitch rule) |

## Findings

**No mismatches.** All 43 checked offers (32 changed + 2 `ocrReads` + the 4 names inside the 2 array-valued keys, with overlap, + 10 unchanged) have an `expectedName` that matches the printed bold title block under the RCA §4 / cross-review naming rules, read independently from the page images.

Additional observations, not defects:
- The "already correct, must stay so" offers named in RCA §6 (Migros Fleischkäse-Cordons-bleus, Migros Gelbflossen-Thunfischfilets, Garofalo Frische-Pasta-Sortiment gekühlt, St. Galler Olma-Bratwürste) were all independently re-verified against the page images as part of the random sample and are correct.
- Several offers carry an italic/script marketing tagline ("«Aus der Region.»") directly above the bold product title (pages 2, 6, 8, 9). In every case the tagline is a different type style from the bold title block and is correctly excluded from `expectedName` — worth noting explicitly since it is not called out as its own case in the RCA naming rules, but the fixture treats it consistently and correctly throughout.
- The Minirosen Fairtrade removal (PM P-13) and the two `ocrReads` printed-space readings were each visually confirmed on the page, not just taken on trust.

## Verdict (KW39)

**G2 independent truth check: PASS.** Recommend `verifiedBy` in `kw39-zh-truth.json` be updated to record QA's sign-off alongside the tech lead's, per the RCA's Final agreed plan step 1.

---

# QA Spot-Check — KW36 golden-master edits (second G2 independent check)

- Date: 2026-09-27
- Scope: `pipeline/collection/infrastructure/migros/migros-flyer-source.test.ts`, `GOLDEN_MASTER` array + the new `IP-SUISSE is lifted out … labels` describe block, worktree `agent-a93682c65ace6ef3d`, commit **de05820**.
- Method: same as the KW39 check — read the page image by eye, apply the RCA naming rules, compare to the edited/unchanged golden values. **Additional step this Builder's commit specifically asked for:** for the one offer where OCR loses characters (`Schweins-Nierstucksteaksmariniert`), I also read the raw OCR JSON fixture (`__fixtures__/ocr-kw36-zh-pages2-5.json`) directly, because the golden master must equal what the *OCR text* supports, not what the *print* says, and those two differ here (Fix A territory, RCA §4 R6).
- Page images: not present in the worktree or in the tracked scratchpad tree; found instead at `/private/tmp/claude-501/-Users-kiran/c740ed55-db56-4748-829d-c3fce4eb1d98/scratchpad/kw36/page_{2,3,4,5}.jpg` (2199×2997, same resolution as the KW39 fixtures, and the same files the Builder's own scratch script `kw36.mts` reads). Confirmed these are the KW36 ZH edition by the printed validity date "Angebote gelten vom 3.9. bis 9.9.2026" on pages 3 and 5. Did not need to re-fetch from issuu.

## Edited names (5/5 MATCH)

| Page | Price | Printed on page (by eye) | Raw OCR JSON text (2 lines, verbatim) | Faithful join under RCA rules | Golden master | Verdict |
|---|---|---|---|---|---|---|
| 3 | 1.20/1.85 | "Schweins-Geschnetzeltes," / "IP-SUISSE" | (single-line OCR item, matches print) | drop badge, strip comma → Schweins-Geschnetzeltes | Schweins-Geschnetzeltes | MATCH |
| 4 | 1.90/2.85 | "Schweins-Nierstück-" / "steaks mariniert," / "IP-SUISSE" | `Schweins-Nierstuck-` / `steaksmariniert,` / `IP-SUISSE` (own items) | line1 ends `-`, line2 starts lowercase → drop hyphen, no space, using the OCR's own (ü→u misread, and no space between "steaks" and "mariniert" — the OCR emits this as ONE token) → `Schweins-Nierstucksteaksmariniert,` → drop IP-SUISSE, strip comma | Schweins-Nierstucksteaksmariniert | **MATCH — see judgment below** |
| 4 | 5.25/7.90 | "Rinds-Entrecôtes" / "mariniert, IP-SUISSE" | `Rinds-Entrecotes` (ô→o misread) / `mariniert,IP-SUISSE` (one glued OCR token) | no trailing hyphen on line1 → join with space → `Rinds-Entrecotes mariniert,IP-SUISSE` → drop badge, strip comma | Rinds-Entrecotes mariniert | MATCH |
| 5 | 3.80/5.70 | "Schweinsfilet," / "IP-SUISSE," / "an der Theke" (all bold) | matches print | drop badge + service phrase "an der Theke", strip comma → Schweinsfilet | Schweinsfilet | MATCH |
| 5 | 1.50/2.25 | "Schweinsbraten vom Hals," / "IP-SUISSE" | matches print | drop badge, strip comma → Schweinsbraten vom Hals | Schweinsbraten vom Hals | MATCH |

**Judgment on `Schweins-Nierstucksteaksmariniert` (the case the coordinator flagged):** I pulled the raw items straight out of `ocr-kw36-zh-pages2-5.json` for this tile (page 4, y≈1369/1405/1436):
```
Schweins-Nierstuck-   (y0=1369)
steaksmariniert,      (y0=1405)   <- ONE OCR token, no internal space
IP-SUISSE             (y0=1436)
```
The printed page (by eye) says "Schweins-Nierstück-" / "steaks mariniert," — two words with a space, correct ü. The OLD OCR engine that produced this fixture (a) read ü as u, and (b) glued "steaks" and "mariniert," into a single token with no space — genuine engine defects, not something either the print or a correct OCR run would produce. Per RCA §4 R6 ("never invent" — the adapter publishes only OCR text, it does not restore characters or spaces the engine lost), the correct adapter output is the join of the OCR text exactly as received: drop the line-end hyphen (lowercase continuation), concatenate directly → `Schweins-Nierstucksteaksmariniert`. That is exactly the edited golden value. **Verdict: MATCH — this is a faithful join of the flawed OCR text, not an invented restoration, and not a defect.** The commit message's own account of this case is accurate.

I applied the same OCR-JSON cross-check to `Rinds-Entrecotes mariniert` (ô→o, glued `mariniert,IP-SUISSE` token) and got the same result: the golden value is the faithful join of the actual OCR text.

## Unchanged names (2/2 reconfirmed)

| Page | Price | Raw OCR JSON text | Golden master | Verdict |
|---|---|---|---|---|
| 4 | 1.15/1.75 | `Delikatess-` / `Fleischkase,IP-SUiSSE` (one glued token, ä→a misread, mixed-case badge) | Delikatess-Fleischkase | MATCH — hyphen+uppercase-F keeps the hyphen, no space; badge segment (matched case-insensitively per RCA A1) dropped |
| 4 | 3.75/5.60 | `Migros` / `Kalbsplatzli` (ä→a misread) | Migros Kalbsplatzli | MATCH — bare brand word, join with space; no badge line for this tile |

## IP-SUISSE labels (6 labelled / 11 unlabelled, confirmed)

Checked every offer on pages 2–5 against the printed IP-SUISSE badge icon (the round ladybug logo):

- **Labelled (6), badge icon confirmed present:** Schweins-Geschnetzeltes (p3), Schweins-Nierstucksteaksmariniert (p4), Delikatess-Fleischkase (p4), Rinds-Entrecotes mariniert (p4), Schweinsfilet (p5), Schweinsbraten vom Hals (p5) — matches the test's `it.each` list exactly.
- **Unlabelled (11), no badge icon on the page:** all 6 page-2 fruit/veg offers (Kartoffeln Patatli, Zwetschgen, Trauben weiss und gemischt kernlos, Extra Himbeeren, Migros Bio Bohnen, Extra Kiwi Gold — page 2 carries only Bio/BioSuisse/"Aus der Region" badges, never IP-SUISSE), plus Migros Spiesse (p4), Migros Kalbsplätzli (p4), Optigal Pouletgeschnetzeltes (p5), Migros Poulet Nuggets (p5), Optigal Poulet-Unterschenkel (p5) — none show an IP-SUISSE icon.
- Total offers: 6 (p2) + 1 (p3) + 5 (p4) + 5 (p5) = 17, matching `GOLDEN_MASTER.length` and the commit's "count stays 17" claim.

## Findings

**No mismatches.** All 5 edited names, both unchanged names, and the 6/11 label split are correct. The one case requiring judgment (the OCR-vs-print divergence on `Schweins-Nierstucksteaksmariniert`) was resolved by reading the actual OCR JSON fixture, not just the page image: the golden value is a faithful, non-inventive join of what the old OCR engine actually output, consistent with RCA §4 R6.

## Verdict (KW36)

**G2 independent truth check: PASS.** No corrections needed. Recommend the KW36 golden-master header's "QA spot-check of the KW36 edits (G2) is still to do" note be updated to record this sign-off.
