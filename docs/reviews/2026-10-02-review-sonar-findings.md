# Code Review: SonarQube bug/vulnerability fixes (PR #4, branch `fix/sonar-findings`)

**Reviewer:** code-reviewer agent | **Date:** 2026-10-02
**Commits:** `3919d42` (fix: resolve SonarQube bug/vulnerability findings), `85a5f24` (ci: run ocr.py pytest suite with coverage and feed it to SonarQube)
**Scope:** `git diff main...fix/sonar-findings`. 20 files, +387 / -33.

## Summary

| File / area | Verdict |
|---|---|
| `pipeline/storage/domain/stale-sweep.ts` (explicit ISO comparator) | Approved |
| `pipeline/collection/application/collect-offers.ts` (`randomUUID` run id) | Approved |
| `pipeline/collection/infrastructure/migros/ocr.py` (`--manifest` restricted to the temp dir) | Approved, with one SHOULD-FIX (the docstring claims more than the check does) |
| `pipeline/collection/infrastructure/migros/test_ocr.py` | Approved |
| `web-next/src/lib/unique-strings.ts` (+ test, `VariantPickerSheet` import) | Approved |
| `web-next/src/components/ui/sheet.tsx` (+ test) | Approved. This is a real a11y fix, not just a Sonar fix |
| `web-next/src/components/landing/ShareVerdictButton.tsx` (+ test, i18n) | **Needs Changes** (1 MUST-FIX, 1 SHOULD-FIX) |
| `web-next/src/components/list/AvailabilityCellSheet.tsx` / `AvailabilityHelpPopover.tsx` (+ test) | Needs Changes (SHOULD-FIX only) |
| `web-next/src/messages/{en,de}.json` | Approved. fr/it need nothing (see below) |
| `.github/workflows/ci.yml`, `sonar-project.properties`, `pipeline/.coveragerc`, `.gitignore` | Approved (nits only) |

**Overall: Needs work, but only a little.** There is one small MUST-FIX on the live home page. Nothing here puts the pipeline at risk. The `--manifest` temp-dir check matches what `live-sources.ts` writes on GitHub's ubuntu runners and on macOS (details below). No `NOSONAR` suppressions were added.

### What I ran (this worktree)

| Command | Result |
|---|---|
| `pipeline: npm test` | 74 files / 1524 tests pass |
| `pipeline: ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| `web-next: npm test` | 52 files / 508 tests pass |
| `web-next: ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| `web-next: biome check` on the 12 changed web files | 7 errors, 1 warning. **All are on lines this PR did not touch** (format/organizeImports, already present on `main`; `npm run lint` reports 46 errors repo-wide). The PR adds no new lint debt |
| `pytest test_ocr.py` locally | Not possible: there is no pytest in the local Python 3.14 and the sandbox does not allow arbitrary interpreters. I used the CI log instead: **19 passed**, ocr.py line coverage 65% |
| PR #4 checks (`gh pr checks 4`) | All green: Test (Python, ocr.py), SonarCloud, Playwright + axe, Vitest, Build |
| SonarQube job log | `Sensor Cobertura Sensor for Python coverage` → `Parsing report '.../.sonar-coverage/python.xml'` with no unresolved-file warning. The Python coverage wiring works end to end |

---

## Per-file review

### `pipeline/collection/infrastructure/migros/ocr.py`: `--manifest` path restriction
- **Verdict:** Approved (one SHOULD-FIX)

**The key check: does production write the manifest under Python's `tempfile.gettempdir()`?** Yes.

- **Writer** (`live-sources.ts:226-232`): `mkdtemp(join(tmpdir(), 'migros-ocr-'))`, then `manifest.json` goes inside that directory. `execFile` passes no `env`, so the Python child inherits the parent's environment exactly.
- **Node `os.tmpdir()`** on POSIX is `TMPDIR || TMP || TEMP || '/tmp'`, with any trailing slash removed.
- **Python `tempfile.gettempdir()`** checks `TMPDIR`, then `TEMP`, then `TMP`, then `/tmp`, `/var/tmp`, `/usr/tmp`, cwd. It takes the first one it can write to and returns its `abspath`.
- **GitHub ubuntu runners** (`pipeline.yml`, `runs-on: ubuntu-latest`) leave `TMPDIR`, `TMP` and `TEMP` unset. `RUNNER_TEMP` is a separate variable that neither runtime reads, so both sides use `/tmp`. `pipeline.yml` sets no temp variables either. **They match.**
- **macOS** (`TMPDIR=/var/folders/.../T/`): both runtimes read `TMPDIR`. The `/var` → `/private/var` symlink is safe because the Python side calls `.resolve()` on **both** the argv path and the allowed root. A trailing slash on `TMPDIR` is also fine, because `Path.resolve()` normalises it. **They match.**
- **Implicit regression guard:** the existing happy-path tests (`test_manifest_page_numbers_survive_a_skipped_page`, `..._out_of_order`) write their manifest under pytest's `tmp_path`. That directory sits under the real `tempfile.gettempdir()`, and these tests run without the monkeypatch. So they now also prove that a real temp-dir manifest is accepted. They pass on the CI ubuntu runner.
- **The only way the two sides can disagree:** `TMPDIR` is unset **and** `TMP` and `TEMP` are both set to *different* directories. Node prefers `TMP` and Python prefers `TEMP`. This does not happen on our runners or on macOS. If it did, the failure would be loud: exit 4 → `execFile` rejects → `collect-offers.ts` catches it → Migros is reported as a failed source. The rest of the run is unaffected, so nothing breaks silently.
- Exit code 4 plus a JSON `{"error": ...}` on stderr is consistent with the existing exit codes 2 and 3. Good.

**SHOULD-FIX S1, `ocr.py:129-143` (docstring of `resolve_manifest_path`).** The docstring says the check "keeps a stray or hostile argv from making the script open an arbitrary file". It does not:
- the positional form (`ocr.py /any/path.jpg`) still opens any path or URL;
- the manifest's own `source` entries are not checked, so a valid temp-dir manifest can still point at any file.

The real threat model is "argv comes only from our own `live-sources.ts`", so this is defence in depth, not a security boundary. Pick one:
- (a) reword the docstring to say exactly that, or
- (b) cheap and consistent with how `live-sources.ts` lays out files: also require each manifest `source` to resolve inside the manifest's own parent directory. `live-sources.ts` already writes the page images there.

**Optional hardening, `live-sources.ts:235`.** You can remove the `TMP`/`TEMP` divergence class entirely by pinning the child's temp dir to the one Node used: `exec(python, args, { maxBuffer, env: { ...process.env, TMPDIR: tmpdir() } })`. That needs a matching `env` field on the `ExecPython` type. Not required, because the divergence cannot happen on our runners.

### `pipeline/collection/infrastructure/migros/test_ocr.py`
- **Verdict:** Approved.

There are six new tests: outside the temp dir, non-`.json`, directory or missing file, flag without a path, a symlink escaping the temp dir, and `main()` returning 4 with a JSON error. The symlink case is the one that matters most, and it is covered. Monkeypatching `tempfile.gettempdir` works because `ocr.py` looks it up at call time (`tempfile.gettempdir()`, not `from tempfile import gettempdir`).

### `pipeline/storage/domain/stale-sweep.ts:184-198`
- **Verdict:** Approved.

`compareIsoDates` behaves exactly like the default sort for `YYYY-MM-DD` keys, and the intent is now visible. It correctly avoids `localeCompare`, which depends on the locale. The existing stale-sweep tests cover it, and behaviour is unchanged.

### `pipeline/collection/application/collect-offers.ts:48`
- **Verdict:** Approved.

`randomUUID().replaceAll('-', '').slice(0, 6)` keeps the old `run_<base36>_<6 chars>` shape. I found nothing that parses run ids by pattern (searched pipeline, shared, web-next and supabase). `replaceAll` is fine on the Node 20 pipeline runtime. The application layer imports only `node:crypto`, which is a standard library, not infrastructure, so the DDD layering still holds.

### `web-next/src/lib/unique-strings.ts` (+ test)
- **Verdict:** Approved.

`de-CH` collation is the right choice: the origin labels are German data on both the `de` and `en` routes. The regression test names the real defect (Ä/Ö/Ü sorted after Z). Extracting the helper for a single caller is justified because it makes the helper unit-testable.

Nit: `Intl.Collator('de-CH').compare` would build the collator once rather than once per comparison. That makes no measurable difference for an origin list, so ignore it unless it is touched again.

### `web-next/src/components/ui/sheet.tsx:37-40` (+ test)
- **Verdict:** Approved, and worth calling out.

The old `description ? undefined : undefined` did more than look odd. It **always** overrode Radix's own `aria-describedby`, so the sr-only description was never linked to the dialog. Spreading `{}` when there is a description and `{ 'aria-describedby': undefined }` when there is not restores Radix's linking and still silences its missing-description warning. Both tests check the actual DOM (the `getElementById` round-trip), not implementation details. Good.

### `web-next/src/components/landing/ShareVerdictButton.tsx` (+ test, i18n)
- **Verdict:** Needs Changes.

This component is **live**: `app/[locale]/page.tsx:79` mounts it on the home page.

The direction is right. `copy()` is now awaited, a three-value union replaces the old boolean, and a refused clipboard is shown to the user instead of being swallowed.

**MUST-FIX M1, `ShareVerdictButton.tsx:67-78` (`nativeShare`). A cancelled share sheet now shows a false "could not copy" error.**
- Where `navigator.share` exists (iOS Safari, Android Chrome; the button is labelled "Copy"), any rejection from `share()`, *including the user deliberately cancelling* (`AbortError`), falls through to `copy()`.
- Per the Web Share spec, `share()` consumes the user's transient activation. Safari only allows `clipboard.writeText` while that activation is live.
- So on iOS, the main mobile browser for Swiss users, I expect: tap Copy → share sheet → Cancel → `writeText` rejects → **"Link konnte nicht kopiert werden…" appears** after a deliberate cancel. On Chrome the copy succeeds instead, and the user's clipboard is overwritten after they said no.
- Before this PR the Safari case was silent. This PR is what makes it visible.
- I derived this from the spec and did not reproduce it on a device. The two-line fix is right either way:
  ```ts
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return // user cancelled: respect it
  }
  ```
  Then fall through to `copy()` only when the share genuinely failed or is unsupported. Add a test: `share` rejects with `AbortError` → `writeText` is not called and no `status` is shown.

**SHOULD-FIX S2, `ShareVerdictButton.tsx:116-120`. The live region is mounted together with its text.**
- `<p role="status">` is inserted only when the status is `failed`, already containing the message. Screen readers announce *changes* inside a live region that already exists far more reliably than a region inserted together with its content. NVDA in particular often stays silent in that case.
- Fix: render the `<p role="status">` always, empty while `idle`, and set its text on failure. The same region could also announce "Copied", which today is only a change to the button's label and is not reliably announced either.
- `StaleBanner.tsx` and `MidnightGuard.tsx` use `role="status"` too. Check them against the same pattern when you are next in there.

**Test nits, `ShareVerdictButton.test.tsx`:**
- `process.off('unhandledRejection', unhandled)` runs after the assertions, so a failing assertion leaks the listener. Move it to `afterEach` or a `try/finally`.
- The "no unhandled rejection" assertion would also have passed before the fix, because `copy()` already caught internally. The status assertion is the part that actually guards against the regression. Fine to keep, but say so in the comment.

**i18n:** `copy_failed` was added to `en` and `de` only, and that is correct.
- `routing.ts` declares `locales: ['de', 'en']`, so `fr` and `it` are never routed or loaded (`request.ts` falls back to `de`).
- `fr.json` and `it.json` (91 lines) have no `share_verdict` namespace at all, so this PR adds no gap that was not already there.
- `messages.test.ts` enforces de↔en parity and passes.
- There is no runtime missing-key risk.

### `AvailabilityCellSheet.tsx` / `AvailabilityHelpPopover.tsx` (+ `AvailabilityDismiss.test.tsx`)
- **Verdict:** Needs Changes (SHOULD-FIX only, no blockers).

**Context: neither component is mounted in the app today.** Both are rendered only by `AvailabilityStrip`, which is used only by `V3PreviewSection`, and `V3PreviewSection` is imported nowhere (searched `src` and `.ladle`). The visible change has zero production impact right now. It matters when the v3 strip ships.

The new structure is sound:
- A sibling scrim `<button>` followed by a `relative` panel removes the old `stopPropagation` hack.
- Clicks on the panel no longer reach any handler, so the panel needs no click handler of its own.
- The tests pin dismissal by scrim click, by Escape, and *not* by a click on the panel, plus the tab order.

My checks against your list:
- **Focus order / trap:** `tabIndex={-1}` correctly keeps the scrim out of the Tab sequence. The panel's Close button is the only Tab stop the PR adds, and the tests assert this. Neither dialog moves focus on open, traps focus, or returns focus on close. That was **already true and is not made worse here**, but `aria-modal="true"` promises a modality these dialogs do not deliver. Carried forward as a FLAG (F1) to fix before `V3PreviewSection` is mounted.
- **Screen-reader exposure:** a `tabIndex={-1}` button is still in the accessibility tree. Screen-reader virtual cursors and VoiceOver swipes will reach it, and because it comes **first** in DOM order the dialog reads "Close, button" before its heading. That is harmless (it really does close the dialog) but noisy.
  - Option: move the scrim after the panel in the DOM, swapping the stacking with `z-0` on the scrim and `z-10` on the panel. The Close button inside the panel then stays first.
  - Do **not** add `aria-hidden` to a button: axe's `aria-hidden-focus` and Sonar would both object.
- **44 px rule:** the scrim covers the whole viewport, so it passes trivially. The panel's own Close button (`p-1` around a 16 px icon, about 24 px) fails 44 px, but it is unchanged by this PR. Add it to F1.
- **Visible change on the cell sheet:** confirmed.
  - Before: the dialog was `fixed inset-x-0 bottom-0`, only as tall as the sheet. The dim covered just that bottom band, the page above stayed interactive, and tapping above the sheet did *not* dismiss it.
  - Now: the whole viewport is dimmed and blocked, and tapping anywhere outside dismisses.
  - This is the behaviour `aria-modal="true"` implies and it matches `AvailabilityHelpPopover`, so it is a correction. It still needs a designer to acknowledge it before the strip ships. Recorded as FLAG F2, not a finding.
  - `cursor-default` is right. The iOS tap flash is suppressed by Tailwind v4 preflight (`-webkit-tap-highlight-color: transparent`), so there is no full-screen grey flash.
- **WCAG 2.1 AA:** nothing in this diff regresses AA. The open AA gaps (focus management, the 24 px target) existed before it and are captured in F1.

**SHOULD-FIX S3, `AvailabilityCellSheet.tsx:41`. A new hardcoded English string.**
- The scrim's `aria-label="Close"` is English on the German-default site.
- The sibling `AvailabilityHelpPopover` in the same PR correctly uses `t('help_close')` ("Schliessen").
- The panel Close button on line 54 already had the same hardcoded `"Close"`.
- Use `useTranslations('availability')` and `t('help_close')` for both. The test's `{ name: 'Close' }` still works under the `en` provider.

### CI / Sonar config (`ci.yml`, `sonar-project.properties`, `.coveragerc`, `.gitignore`)
- **Verdict:** Approved.

`test-python` is a proper gate: it is in the `sonarqube` job's `needs`, its artifact is uploaded with `if: !cancelled()`, a missing file degrades to a `::warning`, and `relative_files = True` makes the paths resolve. I confirmed this in the scan log. The workflow-level `permissions: contents: read` covers the new job. Excluding `**/*.sql` with a reason is sensible.

Nits:
- `pip install pytest pytest-cov pillow numpy` is unpinned. A `pipeline/collection/infrastructure/migros/requirements-test.txt` with versions would make the job reproducible.
- `--cov=.../migros` also measures `test_ocr.py` itself (99% in the term report). Sonar ignores it because tests are excluded, but `omit = */test_*.py` in `.coveragerc` would keep the terminal number honest. The real figure for `ocr.py` alone is 65%.

---

## Cross-cutting

- **Good discipline:** every Sonar fix comes with a regression test that names the rule and the real defect. No suppressions were added, and the fixes change the code rather than silencing the analyser. The `sheet.tsx` fix found a real a11y bug hidden behind a "code smell" finding.
- **Two Hats:** `3919d42` combines a small refactor (extracting `uniqueStrings`) with behaviour fixes. That is acceptable at this size.
- **Pattern to watch:** two of the three web findings are i18n or announcement slips: the hardcoded "Close" and a live region inserted with its content. A tiny test helper, "every `aria-label` in `components/` comes from `t()`", would catch the first class mechanically (Larson: fix the system).

## Test coverage assessment

- Pyramid shape is right: pure unit tests for comparator, collation and manifest validation; jsdom component tests for the dismissal, describedby and clipboard behaviour; Playwright + axe stay green in CI.
- **Gap:** no test for the share-cancel path (M1).
- **Gap:** no cross-language contract test that a path written by `live-sources.ts` passes `resolve_manifest_path`. The TS test injects `exec`, so the Node↔Python temp-dir agreement is guaranteed only by the analysis above and by the implicit `tmp_path` tests. That is acceptable for now; the optional `TMPDIR` pin in S1 would make it guaranteed by construction.

## Findings register

| ID | Severity | File:line | Finding | Status |
|---|---|---|---|---|
| M1 | **MUST-FIX** | `ShareVerdictButton.tsx:67-78` | A cancelled native share (`AbortError`) falls through to copy. On iOS Safari this now shows a false "could not copy" error; on Chrome it overwrites the clipboard after the user cancelled. Return on `AbortError`, and add a test | Open |
| S1 | SHOULD-FIX | `ocr.py:129-143` | The docstring overclaims ("arbitrary file"): positional args and manifest `source` entries are unchecked. Reword, or confine entry sources to the manifest's own directory. Optional: pin `TMPDIR` for the child in `live-sources.ts:235` | Open |
| S2 | SHOULD-FIX | `ShareVerdictButton.tsx:116-120` | `role="status"` is mounted together with its text. Keep the live region always mounted and change its contents | Open |
| S3 | SHOULD-FIX | `AvailabilityCellSheet.tsx:41,53` | Hardcoded English `aria-label="Close"` (new scrim + existing button). Use `t('help_close')` | Open |
| N1 | Nit | `ShareVerdictButton.test.tsx` | `process.off` after the assertions leaks the listener on failure | Open |
| N2 | Nit | `ci.yml` `test-python` | Unpinned pip test dependencies; `.coveragerc` should `omit` test files | Open |
| N3 | Nit | `AvailabilityCellSheet.tsx`, `AvailabilityHelpPopover.tsx` | The scrim button is read first by screen readers. Consider placing it after the panel in the DOM | Open |
| F1 | FLAG (carry forward) | both availability overlays | No initial focus, focus trap or focus return despite `aria-modal`. The panel Close button is about 24 px (< 44 px). This was already the case before this PR. Fix before `V3PreviewSection` is mounted | Tracked |
| F2 | FLAG (carry forward) | `AvailabilityCellSheet.tsx` | The scrim now covers the full viewport (was the bottom band only). Correct for `aria-modal`; get design sign-off when the strip ships | Tracked |

## Final verdict

**Needs work (small).** Fix M1. S1–S3 are recommended in the same pass because each is a few lines. On re-review I will check only M1 and whichever SHOULD-FIX items are taken. The pipeline changes (`stale-sweep`, run id, `ocr.py` hardening, CI coverage) are approved as they stand, and they do not put the live Migros collector at risk.
