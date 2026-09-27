# Can basketch get Coop's promotions direct from Coop? — Architect assessment

**Date checked:** 2026-09-26 (Sat), publication week 2026-W39 · **Author:** Architect agent · **Type:** research only (no code, no DB, no push)
**Question (PM):** replace aktionis.ch for Coop with a Coop-owned / Coop-authorised public channel?
**Answer:** **Stay on aktionis for Coop.** No Coop-owned channel reachable by an honest client carries more than ~25% of Coop's weekly promotions. Keep the Coop flyer as the documented fallback if aktionis goes away (see §4).

Method: plain `curl --max-time 20`, honest UA `basketch-research/0.1 (non-commercial price comparison research)`, no cookies, no login, no proxy, no retries against 403s. Baseline: aktionis delivered **1,018 Coop offers** in run 35983172760 (W39, `docs/design/2026-09-25-data-source-facts.md` §1); prior measurement 1,006 unique (research Part 4c).

---

## 1. Every candidate channel checked

| # | Channel | What we saw (2026-09-26) | Usable? |
|---|---|---|---|
| 1 | **coop.ch** (`/`, `/robots.txt`, `/sitemap.xml`, `/de/aktionen/aktuelle-aktionen/c/m_1011`, `/de/aktionen.rss`) | All **403**, `Server: DataDome`, 767-byte CAPTCHA body — even robots.txt | **No** — technical protection measure; getting past it is the line the 2023 rulings draw |
| 2 | **Coop app / mobile hosts** — `mobile.coop.ch`, `m.coop.ch`, `shop.coop.ch` | **403 DataDome** (same IP 185.170.88.26 as coop.ch) | **No** |
| 3 | **`api.coop.ch`** | **401**, `WWW-Authenticate: Bearer realm="API"` | **No** — needs a token (credential) |
| 4 | `app.`, `developer(s).`, `services.`, `feeds.`, `aktionen.coop.ch` | No DNS record | Do not exist — no public developer portal or feed |
| 5 | **Supercard** (`supercard.ch`, incl. robots.txt) | **403 DataDome**. Digital Bons / Sammelpässe need a logged-in Supercard account | **No** |
| 6 | **Coop City** (`coop-city.ch`) | **403 DataDome** (`X-DataDome: protected`) | **No** |
| 7 | **Coop weekly flyer** `epaper.coop.ch/catalogs/AM_AKMA_W39_2026_DE_ZZ--SHORTTERM/` | `xml/catalog.xml` **200** (24 pages); `pdf/complete.pdf` **200**, 32.9 MB, created 2026-09-23, text layer; **206 `statt`** occurrences / 173 unique price pairs. W40 → 404 (not yet out). Regional `DE_NW` 200 (same prices, per Part 3). `epaper.coop.ch/robots.txt` 404 (no restrictions) | **Yes**, but ~**20%** coverage (206 vs 1,018) |
| 8 | Other epaper catalogues (`AM_AKMB`, `AM_NONFOOD`, `AM_BAHO`, `AM_CITY`, `--LONGTERM`, `DE_CH`) | All **404** for W39 (confirms Part 4c's 2026-09-09 finding) | Not findable |
| 9 | **Coopzeitung ePaper** `epaper.coopzeitung.ch` (Coop's weekly magazine) | Open JSON API used by its own viewer: `GET /epaper/1.0/getEditionDefs` **200** (13 regional DE editions + FR/IT); `POST /epaper/1.0/findEditionsFromDate` → W39 edition 405165, published 2026-09-24, **128 pages**, `isAllowed: true`, no login; `POST /epaper/1.0/getPages` → per-page PDFs on S3 (pre-signed URLs), text layer. **47 pages tagged `Anzeigen`** → **71 `statt`**, 45 unique price pairs, **13 overlap the flyer, ~32 new**. robots.txt `Allow: /` | **Technically and legally usable**, but adds only ~30–40 offers; many ads are brand/partner ads and multi-week (`Gültigkeit: 24.9 – 7.10.2026`) |
| 10 | Coopzeitung web `coopzeitung.ch/de/angebote.html` | 200, ~1 KB of text — a teaser pointing to the ePaper; no offer data, no JSON | No data |
| 11 | **Coop Pronto** `coop-pronto.ch/de/profitieren/aktionen-superpunkte` | 200, robots.txt allows (only blocks GPTBot/SemrushBot etc.). ~20 items (sweets, fuel rebates), **no statt price** | **Not Coop's supermarket** — separate convenience format with its own prices; wrong data for basketch |
| 12 | Coop Megastore | No own domain (`coop-megastore.ch` no DNS; `megastore.ch` unrelated redirect); lives under coop.ch → DataDome | **No** |
| 13 | Coop newsletter (Aktionen e-mail) | Sign-up is on coop.ch (DataDome). Would need a mailbox, e-mail parsing, and a curated subset | **Not measured; not recommended** — fragile, consent/terms unclear |
| 14 | Official partner / licensed feed | None found. Research Part 4d: Coop is absent from Profital/Bring!, nothing on opendata.swiss, "Coop licenses nothing" | **None exists** |

## 2. Coverage vs aktionis (W39)

| Source | Coop offers | Share of aktionis (1,018) |
|---|---|---|
| aktionis.ch (production) | 1,018 | 100% |
| Coop flyer (AKMA) | ~173–206 | ~17–20% |
| Coopzeitung ads, not in flyer | ~32 | ~3% |
| **Best Coop-owned total (flyer + Coopzeitung)** | **~205–240** | **~20–24%** |

The ~780 offers only on aktionis are the household / drugstore / confectionery promotions (Lenor, Ariel, Lindt …, Part 4c) that Coop publishes only on coop.ch and in its app — both behind DataDome or login.

## 3. Data quality, stability, legal, effort

| | aktionis (today) | Coop flyer | Coopzeitung ePaper |
|---|---|---|---|
| Price / statt-price | Both on card | Both, richest of any flyer | Both where printed |
| % off | On card | Derivable | Derivable |
| Validity | Per deal | Flyer week (Tue–Mon) | Mixed, often 2 weeks; per-ad text |
| Image | aktionis CDN photo | Page crop (ALDI/Migros pattern) | Page crop from pre-signed S3 URL (expires — must be re-resolved) |
| Structure | HTML cards, ~20 requests | PDF text + bbox tile clustering (no hotspots/JSON) | Per-page PDFs; ads mixed with editorial and third-party brand ads |
| Stability | Stable 20 yrs; one layout change breaks it | Deterministic URL since ≥W33; 32.9 MB/week | Undocumented viewer API (v2.35.0 bundle); could change without notice |
| Legal | No robots/TPM issue, but research Part 4d: scraping a compiled dataset carries Art. 5 lit. c UWG exposure and adds a second party | **Cleanest** — Coop's own open publication | Clean — Coop's publication, `Allow: /`, no login |
| Effort | 0 (done) | M — new PDF-tile adapter + tests (~2–3 days) | M–L — edition lookup, ad-vs-editorial filter, brand-ad filter |

## 4. Recommendation — **Stay** (aktionis remains the Coop source)

1. **Switch is rejected:** it would cut Coop from ~1,018 to ~200–240 offers (−76 to −80%), and Coop is ~62% of all stored rows. The category verdict and per-item routing would get much worse for Coop.
2. **Hybrid is rejected for now.** aktionis carries ~5× the flyer's count and its name-matched sample overlapped the flyer (Part 4c), so the flyer's ~200 offers are very likely already in aktionis (flyer ⊂ aktionis is inferred, not measured item-by-item). A hybrid adds a second adapter, cross-source de-duplication by fuzzy name matching (a new failure mode), and changes nothing the user sees except a different image/link on ~20% of Coop cards. Cost exceeds benefit.
3. **Keep the Coop flyer as the named fallback (no build now).** If aktionis blocks us, changes terms, or asks us to stop, switch Coop to `epaper.coop.ch` AKMA (optionally plus Coopzeitung ads) and state the reduced coverage in the UI. The URL pattern and text layer are re-verified here for W39. Worth one ADR line so nobody has to research this again.
4. **Re-check triggers:** Coop publishes a licensed/partner feed, joins Profital/Bring!, drops DataDome on a public offers page, or `epaper.coop.ch` grows a non-food catalogue. Otherwise do not re-open.

**Legal line, restated:** every "No" above is a refusal by Coop (DataDome, 401 Bearer, login). None were probed past the first response; none may be worked around (CLAUDE.md "Legal Constraints").

## 5. Limits of this check

- Flyer counts are `statt` occurrences, not parsed offers; offers without a crossed-out price (e.g. "2 für 1", `%` only) are not counted, so flyer coverage may be a few points higher. It cannot close a ~780-offer gap.
- Coopzeitung counted for the Zürich-area edition (defId 1101) only; the other 12 DE editions differ in regional pages.
- The Coop app's traffic was not inspected (would mean intercepting an app — out of bounds). Its hosts sit behind DataDome (mobile.coop.ch) or Bearer auth (api.coop.ch) anyway.
- `coop.ch/de/termsAndConditions` still unread (DataDome) — the open gap from research Part 4d remains.
