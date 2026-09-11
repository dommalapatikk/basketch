# Component 1 — what is actually missing before it can run

**Written:** 2026-09-10, after auditing why the collection module has never executed in production.

---

## The headline

Two existing documents tell different stories, and both are partly right.

**`docs/collection-module-design.md`** listed Spar, Aldi, Lidl and Migros under **"Not built"**, along
with `run.ts` wiring and `pipeline.yml`. Its next-steps ordering — PDF services first, then Lidl,
then Migros, then wiring — is exactly correct and still stands. What is stale is the "not built"
list itself: the four **parsers** were written after that section, with fixtures and tests.

**`docs/component-2-transformation-brief.md`** then recorded *"Component 1 is done: 7 of 7
retailers, 252 tests, tsc clean"* — and, to its credit, also warned in the same document that
*"run.ts does not import collection/"* and *"nothing runs on a schedule"*.

So the honest summary is: **the parsers are done, the fetchers are not, and the wiring is not.**
The "7 of 7" line counts adapter files and tests, which measures parsing. Nobody checked whether the
adapters could obtain a document to parse.

This is a hazard worth naming rather than a mistake worth blaming: **a test suite built entirely on
captured fixtures cannot tell you the fetch path is missing** — it is designed not to touch it. The
tests are correct and the coverage is real; the gap is simply outside what they measure.

```
collection/          7 adapters · 275 tests · all passing
invoked by           NOTHING
workflow runs        python3 main.py   ← the old aktionis scrapers
```

Every adapter takes its I/O as an injected dependency and is tested against captured fixtures.
That is good design and good TDD. It also means **the adapters were never asked to fetch anything**,
and four of them still cannot.

Consequence: the classifier built in component 2 is being fed by the old Python scraper, which sets
`sourceCategory = None` and supplies none of the published metadata. The Denner `content_size`,
`nameSubline`, `eco_labels` and wine work does not reach it.

---

## Gap 1 — four adapters have no way to fetch

| Retailer | Needs | Ships it? |
|---|---|---|
| Denner | `fetchPage` | ✅ `httpFetchPage` |
| Coop | `fetchPage` | ✅ `httpFetchPage` |
| Volg | `fetchPage` | ✅ `httpFetchPage` |
| **Lidl** | `fetchFlyer` + `fetchPdfText` | ❌ none |
| **Aldi** | `loadPages` | ❌ none |
| **Spar** | `loadPages` | ❌ none |
| **Migros** | `loadPages` (OCR) | ❌ none |

`infrastructure/pdf/pdf-words.ts` **does** implement real extraction — it shells out to poppler's
`pdftotext -bbox` and returns positioned words. What is missing is the step above it: download the
weekly flyer, hand the file to `extractWords`, return `PdfPage[]`.

That is a **flyer fetcher**, and it is the same shape for Aldi and Spar. Lidl needs a variant
(flyer JSON plus PDF text). Migros needs a different one entirely (Issuu JPEGs plus OCR).

---

## Gap 2 — poppler is not installed in CI

`pdf-words.ts` documents the requirement in a comment:

> *"REQUIRES the `poppler-utils` package (pdftotext, pdftoppm) on the runner.
> Add to the workflow: `sudo apt-get install -y poppler-utils`."*

It was never added. Present locally via Homebrew, absent on the GitHub runner — so the PDF adapters
would fail in CI in a way they never fail on a developer machine. Worst kind of gap.

---

## Gap 3 — no composition root

`collectOffers(sources, week)` exists and is tested. Nothing constructs the seven sources with real
dependencies. There is no file whose job is "here are the live sources".

---

## Gap 4 — the Offer/UnifiedDeal seam

`run.ts` reads `*-deals.json` written by Python and shaped as `UnifiedDeal`. `collectOffers` returns
`Offer`. Wiring collection in therefore forces the component 3 storage migration — they are one
piece of work, not two.

`Offer` carries three things `UnifiedDeal` and the `deals` table cannot hold:

- `priceBasis` — the Lidl Plus flag. Enforced as an invariant, then discarded on write.
- `image: CropRegion` — `{pageImageUrl, x, y, w, h}` for flyer crops. Lost entirely today.
- `salePrice: Money` — integer rappen; the table stores decimals.

---

## Known defects carried forward

From the original brief, unverified since:

- **Migros** — name extraction is noisy at native OCR resolution. A 2× upscale fixed it in testing
  but 1.5×+ segfaults the ONNX runtime locally despite ~10 GB free. **Must be re-tested on the CI
  runner**, which has different memory characteristics.
- **Lidl** — the page-level loyalty check discards roughly half its offers. Per-product detection
  needs `pdftotext -bbox`, which crashed on that particular PDF.

---

## Order of work

1. **Flyer fetcher** — download + `extractWords`, shared by Aldi and Spar
2. **Lidl fetcher** — flyer JSON + PDF text
3. **Migros fetcher** — Issuu JPEGs + OCR, with the upscale question re-tested on CI
4. **Composition root** — one file that builds all seven live sources
5. **poppler in the workflow**
6. **Component 3 storage** — `Offer` → DB, which items 1–4 force

Steps 1–3 are real work, not wiring. The estimate that component 1 was "done" was based on test
count, and test count measured the parsers.
