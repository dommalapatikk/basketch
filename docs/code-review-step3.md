# Code Review: Step 3 -- Coop Source Module (Python)

**Reviewer:** Independent Code Reviewer
**Date:** 2026-04-12
**Files reviewed:** `pipeline/coop/fetch.py`, `pipeline/coop/normalize.py`, `pipeline/coop/main.py`, `pipeline/coop/test_fetch.py`, `pipeline/coop/requirements.txt`
**Standards:** `CLAUDE.md`, `docs/coding-standards.md`, `shared/types.ts` (UnifiedDeal interface)

---

## Verdict: Approved with Minor Changes

The module is well-structured, follows the architecture spec, and has strong test coverage. Three findings need attention before proceeding.

---

## Findings

### Finding 1: `pytest` missing from `requirements.txt` (Minor)

**File:** `pipeline/coop/requirements.txt`

The test file imports `pytest` and uses `pytest.fixture()`, but `requirements.txt` only lists `requests`, `beautifulsoup4`, and `lxml`. Anyone running `pip install -r requirements.txt && python -m pytest` will get an import error.

**Fix:** Add `pytest>=7.0.0` to `requirements.txt` (or create a separate `requirements-dev.txt` -- either is fine, just be explicit).

---

### Finding 2: `main.py` uses `sys.argv` directly -- path traversal risk (Minor)

**File:** `pipeline/coop/main.py`, line 23

```python
output_path = sys.argv[1]
with open(output_path, "w", encoding="utf-8") as f:
```

The output path is taken from `sys.argv` without any sanitization. In the current usage (called by the pipeline orchestrator `run.ts`), this is controlled input. However, the coding standards say "safe HTML parsing" and the architecture expects the pipeline to be robust. A minimal guard (e.g., rejecting paths containing `..` or absolute paths outside the project) would be prudent, though this is low-risk given the module is only invoked by the pipeline.

**Recommendation:** Accept as-is for now since the caller is trusted (`run.ts`), but add a brief comment noting the assumption. Flag for hardening if the module is ever exposed to user input.

---

### Finding 3: Duplicate `BASE_URL` constant in two files (Minor)

**Files:** `pipeline/coop/fetch.py` line 17, `pipeline/coop/normalize.py` line 11

- `fetch.py`: `BASE_URL = "https://aktionis.ch/vendors/coop"`
- `normalize.py`: `BASE_URL = "https://aktionis.ch"`

These are related but different values. The naming collision is confusing -- both are called `BASE_URL` but represent different things (the paginated vendor page vs. the site root for constructing deal links). If someone updates one thinking it controls both, deals will have broken URLs.

**Fix:** Rename `normalize.py`'s constant to `SITE_ROOT` or `AKTIONIS_BASE` to distinguish it from the fetch URL.

---

## Checks Passed

### 1. PEP 8 / Coding Standards Compliance

- 4-space indentation throughout -- correct.
- Double quotes for all strings -- correct.
- Type hints on all function signatures -- correct (`-> list[dict]`, `-> float | None`, `-> dict | None`, etc.).
- snake_case for functions and variables -- correct.
- UPPER_SNAKE_CASE for constants (`BASE_URL`, `MAX_PAGES`, `REQUEST_TIMEOUT`, `USER_AGENT`) -- correct.
- Import ordering follows the standard (stdlib, third-party, local) with blank lines between groups -- correct.
- File names are snake_case (`fetch.py`, `normalize.py`, `main.py`, `test_fetch.py`) -- correct.
- No commented-out code, no magic numbers -- correct.
- All files under 200 lines -- correct (`normalize.py` is 187 lines, the longest).

### 2. Architecture Alignment

- `fetch_coop_deals()` returns `list[dict]` matching `UnifiedDeal` shape -- verified.
- Never raises exceptions: every public function wraps in try/except and returns `[]` or `None` -- correct.
- JSON output uses camelCase keys matching the TypeScript `UnifiedDeal` interface exactly:
  - `store`, `productName`, `originalPrice`, `salePrice`, `discountPercent`, `validFrom`, `validTo`, `imageUrl`, `sourceCategory`, `sourceUrl` -- all 10 fields present and correctly named.
- `store` field hardcoded to `"coop"` -- correct.
- `main.py` returns exit code 0 on success (even 0 deals), non-zero only on catastrophic failure -- correct.
- Pipeline flow (fetch HTML, parse cards, normalize to UnifiedDeal) matches the architecture spec.
- `discount_percent` is calculated from prices when the source omits it (`calculate_discount_percent`) -- correct per CLAUDE.md requirement.
- Product names are normalized before output (lowercase, collapse whitespace, standardize units) -- correct.

### 3. Test Quality

- **Unit tests for every pure function:** `normalize_product_name` (8 cases), `parse_price` (6 cases), `parse_discount_text` (4 cases), `parse_date_range` (3 cases), `calculate_discount_percent` (7 cases) -- good coverage.
- **HTML parsing tests:** Fixture-based (`coop-page-1.html`), tests first card values, tests 80%+ parse rate, tests missing elements return `None` -- good.
- **HTTP mocking:** Uses `unittest.mock.patch` on `fetch.requests.get` -- correct mock target. Tests: happy path, network error, timeout, non-200, empty HTML -- all five HTTP edge cases covered.
- **Pagination test:** Verifies `fetch_coop_deals` stops when it hits an empty page (page 2) -- correct.
- **Integration test:** End-to-end fixture test parses all cards and validates required fields on every deal -- good.
- **Main entry point tests:** Tests both stdout and file output modes -- good.
- **camelCase key assertion:** Explicit test (`test_camel_case_keys`) verifies output key set matches `UnifiedDeal` -- excellent.

### 4. Security

- No user-supplied input reaches URLs (pagination is integer-controlled via `range()`).
- HTML parsed with `lxml` parser via BeautifulSoup -- safe against common XML bombs.
- HTTP requests use a timeout (`REQUEST_TIMEOUT = 15`) -- no hanging connections.
- User-Agent header is a standard browser string -- reasonable for scraping.
- No credentials or secrets in code.
- `href` values from HTML are prefixed with a hardcoded base URL, not used as raw URLs -- safe.

### 5. Error Handling

- `fetch_page()`: catches `requests.RequestException` and generic `Exception` separately, logs context, returns `[]`.
- `fetch_coop_deals()`: outer try/except catches anything that escapes the per-page handling, returns `[]`.
- `parse_deal_card()`: wraps entire card parsing in try/except, returns `None` on failure.
- `normalize_coop_deal()`: wraps normalization in try/except, returns `None` on failure.
- `main()`: catches catastrophic failures, prints to stderr, returns exit code 1.
- Pagination stops on first empty page (no infinite loop risk, bounded by `MAX_PAGES = 20`).

---

## Summary

| Criteria | Status |
|----------|--------|
| PEP 8 / coding standards | Pass |
| Architecture alignment | Pass |
| UnifiedDeal JSON shape | Pass (all 10 fields, camelCase) |
| Never-raise contract | Pass |
| Test coverage | Pass (unit, integration, HTTP mock, edge cases) |
| Security | Pass |
| Error handling | Pass |

Three minor findings, none blocking. Fix Finding 1 (pytest in requirements) and Finding 3 (rename duplicate constant) before moving to Step 4. Finding 2 is informational.
