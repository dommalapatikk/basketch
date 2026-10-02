# Code Review: SonarQube Cloud CI (commit 688f458, branch `ci/sonarqube-cloud`)

**Reviewer:** code-reviewer agent | **Date:** 2026-10-02
**Scope:** `git diff main...ci/sonarqube-cloud`: `.github/workflows/ci.yml`, `sonar-project.properties`, `pipeline/package.json` + lock, `web-next/package.json` + lock, `.gitignore`, `docs/runbooks/sonarqube-cloud.md`
**Not reopened (PM decisions):** SonarQube Cloud as the tool; merges to `main` gated through PRs with required checks.

## Summary

| File | Verdict |
|---|---|
| `sonar-project.properties` | **Blocked**: the first scan will fail ("can't be indexed twice") |
| `.github/workflows/ci.yml` (test jobs, coverage) | Approved |
| `.github/workflows/ci.yml` (`sonarqube` job) | Needs Changes (permissions, SHA pin) |
| `pipeline/package.json` + lock | Approved (one nit) |
| `web-next/package.json` + lock | Approved |
| `.gitignore` | Approved |
| `docs/runbooks/sonarqube-cloud.md` | Needs Changes (small accuracy fixes) |

**Overall: Needs work.** There is one MUST-FIX. Everything else is small.

### What I ran (worktree, this branch)

| Command | Result |
|---|---|
| `pipeline: ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| `web-next: ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| `pipeline: npx vitest run` vs `npm run test:coverage` | 74 files / 1524 tests pass in both; exit 0 |
| `shared`: old command (`../pipeline/node_modules/.bin/vitest run --root .`) vs new symlink + coverage command | 6 files / 129 tests pass in both |
| `web-next: npx vitest run` vs `npm run test:coverage` | **2 failed / 492 passed in BOTH, exit 1 in both** (`DealsClient.test.tsx`, "from" label tests; this failure already exists and is not caused by this change) |
| Proof that a failure still goes red: copied `shared/` to the scratchpad, added `expect(1).toBe(2)`, ran the exact CI coverage command | **exit 1**, and `lcov.info` was still written |
| `git ls-remote` SonarSource/sonarqube-scan-action | tag `v8.3.0` exists (→ `d209202bc7d53ff1cc128f7f907dac145c9d6ae9`) |

## Per-File Review

### `sonar-project.properties`. **Blocked**

**MUST-FIX 1: Main and test file sets overlap, so the first analysis fails.**
Lines 18-23 set `sonar.sources=pipeline,shared,web-next/src` and `sonar.tests=pipeline,shared,web-next/src,web-next/e2e`, then set `sonar.test.inclusions=…`. Nothing removes those test files from the *main* set. `sonar.test.inclusions` only narrows the test set. It does not take files out of `sonar.sources`. So every `*.test.ts(x)`, `pipeline/test-support/**`, `web-next/src/test/setup.ts` and `pipeline/collection/infrastructure/migros/test_ocr.py` is indexed as main AND as test. The scanner stops with `File … can't be indexed twice. Please check that inclusion/exclusion patterns produce disjoint sets for main and test files.` The comment on lines 20-21 ("classifies a file as a TEST when it matches sonar.test.inclusions, and as main code otherwise") describes the opposite of what the scanner does.

Fix: add the same patterns to `sonar.exclusions`, which applies to main code only:
```
sonar.exclusions=\
  <existing entries>,\
  **/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/test_*.py,**/test-support/**,web-next/src/test/**
```
Also correct the comment. Keeping one list (for example, the comment "keep in sync with sonar.test.inclusions") makes drift visible.

**SHOULD-FIX 2: Test files from archived code would be scored.** `sonar.exclusions` does not apply to tests. Today no `pipeline/archive/**` test file exists, so nothing breaks. If one is added, it will count as a test. Add `sonar.test.exclusions=**/archive/**,**/node_modules/**,**/__fixtures__/**` so the test set has the same exclusions the comment on line 25 promises.

**NIT:** set `sonar.python.version=3.12` (or whatever `ocr.py` targets). Without it, Sonar warns on every run and assumes Python 2/3 compatibility.

Good: the lcov paths match what the job writes. Excluding `archive/**`, `docs/**` and fixtures is right. The org/project keys are clearly marked for PM confirmation, which is honest. The Python coverage TODO is accurate (`test_ocr.py` is not run in CI).

### `.github/workflows/ci.yml`: test jobs and coverage. **Approved**

Your check (1), whether coverage can change pass/fail or hide a failure. I found no way it can:
- No `coverage.thresholds` are set, so coverage cannot turn a green job red. `reportOnFailure=true` only changes whether a report is *written*. It does not change the exit code (proven above: exit 1 with the report present).
- `npm run test:coverage` passes vitest's exit code through. The `shared` step is a multi-line `run:` under the default `bash -e`, and vitest is the last command, so its exit code is the step's exit code. If `ln` fails, the step also fails.
- `if: ${{ !cancelled() }}` is only on the *upload* steps. A job whose test step failed stays failed. The upload just also runs.
- The `shared/node_modules -> ../pipeline/node_modules` symlink: `shared` imports only `vitest` (checked with grep), so module resolution for shared code does not change. Test counts match the old command exactly. Locally, `pipeline` tsc (which includes `../shared/**/*.ts`) still exits 0 with the symlink present, because TypeScript wildcards skip `node_modules`.
- Instrumentation does not change results: the pass/fail counts are identical with and without `--coverage` in all three packages.

Nice touch: the `.gitignore` comment explains why `/shared/node_modules` needs its own line ("node_modules/" with a trailing slash does not match a symlink). That is correct and not obvious.

### `.github/workflows/ci.yml`: `sonarqube` job. **Needs Changes**

What is correct (your check (2)):
- `needs: [test-typescript, test-shared, test-web-next]` with `if: !cancelled() && (pull_request || main)`: it runs after failures, skips when the run is cancelled, and skips `feat/**` pushes. Intended and documented.
- Fork handling: on `pull_request` (not `pull_request_target`), forks get an empty secret, the job skips with a `::notice`, and a missing token anywhere else fails loudly. This is a good design. Note that because it skips, the check shows **success** on a fork PR. That is acceptable for a one-developer repo. The runbook covers it.
- **Artifact layout is correct.** `download-artifact@v4` with `pattern:` and without `merge-multiple: true` puts each artifact in its own sub-folder, `coverage-in/<artifact-name>/`. `upload-artifact` with a single-file path stores `lcov.info` at the artifact root. So `coverage-in/coverage-<pkg>/lcov.info` is exactly the right path.
- The `SF:` rewrite is correct for what vitest actually writes. I checked the real output: vitest 3 writes `SF:attribute-schemas.ts` and `SF:test-support/clock.ts`, vitest 4 writes `SF:src/...`, and all of them are relative to the package. SonarJS resolves relative lcov paths from the project base dir, so `pipeline/…`, `shared/…`, `web-next/src/…` will match.
- `fetch-depth: 0`, `sonar.qualitygate.wait=true` with a 300 s timeout, and the token passed only to the two steps that need it via `env:` are all correct. No secret is echoed.

**SHOULD-FIX 3: Least privilege.** `ci.yml` has no `permissions:` block, so every job, including the one that receives `SONAR_TOKEN` and runs a third-party action, gets the repo's default `GITHUB_TOKEN` scope (read/write on older repos). Add `permissions: { contents: read }` at workflow level, or at least on `sonarqube`. Nothing in the job needs more. Downloading artifacts from the same run does not need `actions: read`, and PR decoration comes from the SonarCloud GitHub App, not `GITHUB_TOKEN`.

**SHOULD-FIX 4: Pin the third-party action to a SHA.** `SonarSource/sonarqube-scan-action@v8.3.0` receives a secret. Tags can be moved (the tj-actions incident, 2025). Use `@d209202bc7d53ff1cc128f7f907dac145c9d6ae9 # v8.3.0`. The `actions/*` actions are first-party, so a tag is acceptable for them.

**NIT 5: Guard the rewrite against an absolute `SF:`.** If a future vitest config sets an absolute `projectRoot`, `sed` would produce `pipeline//home/runner/...` and coverage would quietly read 0. A cheap guard: only rewrite lines that do not already start with `/` (`sed "/^SF:\//!s|^SF:|SF:$pkg/|"`).

### `pipeline/package.json` + lock. **Approved**

Your check (4): `@vitest/coverage-v8` `3.2.4` exactly matches the locked `vitest` `3.2.4`, and its peer dependency is `vitest: 3.2.4`. The lockfile additions are only coverage-v8's transitive tree (istanbul-*, `@bcoe/v8-coverage`, `test-exclude`/`glob` and their cliui deps). No existing version changed.

**NIT 6:** `vitest` is `^3.1.0` but the coverage plugin is pinned to exactly `3.2.4`. If someone later runs `npm update vitest` and gets 3.2.5, vitest prints a mixed-versions warning. Pin `vitest` to `3.2.4` too, or give both the same caret.

### `web-next/package.json` + lock. **Approved**

`@vitest/coverage-v8` `4.1.5` exactly matches the locked `vitest` `4.1.5` and its `peerDependencies`. The lock diff also bumps `@babel/parser`/`types`/`helper-*` from 7.27-7.29.0 to 7.29.7-7.29.9. That comes from `magicast@0.5` (coverage-v8's dependency) needing a newer `@babel/parser`, so it is legitimate, not unrelated churn. These packages are build-time only.

**NIT 7 (consistency, not correctness):** vitest 4 dropped `coverage.all`, so web-next's lcov lists only the 68 files a test loads (there are 98 non-test files under `src/`). pipeline and shared (vitest 3) list every file. SonarJS counts files missing from lcov as uncovered, so the gate result is the same either way. Setting `test.coverage.include: ['src/**/*.{ts,tsx}']` in `vitest.config.ts` would make the local `text-summary` honest, though.

### `.gitignore`. **Approved**

### `docs/runbooks/sonarqube-cloud.md`. **Needs Changes**

Your check (6). It is clear and well-ordered for a non-developer, and the troubleshooting table is useful. Fixes:

- **SHOULD-FIX 8: Step 3, "new code".** Offering "Previous version **or** 30 days" leaves the PM a choice with no basis for it. "Previous version" is also a poor fit: the project never sets `sonar.projectVersion`, so on `main` "new code" becomes "everything since the first analysis" and keeps growing. Recommend **one** option: "Number of days: 30" (or "Reference branch: main"). Add one line explaining that PR gates always use the PR's own diff, so this setting only affects the `main` branch view.
- **SHOULD-FIX 9: The gate threshold explanation is incomplete.** Add: "If a PR changes fewer than 20 lines, the coverage and duplication conditions are skipped." Otherwise the PM will wonder why a one-line PR with no tests passed.
- **SHOULD-FIX 10: Step 9 / table.** Before branch protection makes `web-next · Vitest` required, someone must fix the existing red `DealsClient.test.tsx` ("from" label, 2 tests, failing locally with and without coverage). If it stays red, every PR is blocked on day one. The runbook's "(see hand-off)" points to a document the PM does not have. Name the test here, or link the issue.
- **NIT:** the check posted by the GitHub App may now be labelled "SonarQube Cloud Code Analysis" (after the rebrand) rather than "SonarCloud Code Analysis". Write "SonarCloud / SonarQube Cloud Code Analysis" so the PM can find it either way.
- **NIT:** "free for public repos": add "(the repo must stay public; private repos need a paid plan)", since CLAUDE.md's budget rule allows only one paid service.

## Cross-Cutting Issues

- The repo-wide `permissions:` gap (SHOULD-FIX 3) predates this commit. This commit is the first job to hold a third-party token, though, so now is the time to fix it.
- CLAUDE.md "Testing Commands" does not mention `npm run test:coverage`. This is optional, but a single line would help the next reviewer.

## Test Coverage Assessment

This change does not need tests of its own. I checked behaviour by running it. With coverage on, pass/fail counts and exit codes are identical in all three packages, and a deliberately failing test still exits 1. Local coverage: pipeline 89.6% lines, shared 83.3%, web-next 79.1% (on loaded files only, see NIT 7).

## Final Verdict: **Needs work**

**MUST-FIX**
1. `sonar-project.properties`: add the test patterns to `sonar.exclusions` so main and test sets are disjoint, and correct the misleading comment. As written, the first scan fails with "can't be indexed twice".

**SHOULD-FIX**
2. Add `sonar.test.exclusions` (archive, node_modules, fixtures).
3. `permissions: contents: read` (workflow or `sonarqube` job).
4. Pin `sonarqube-scan-action` to SHA `d209202bc7d53ff1cc128f7f907dac145c9d6ae9`.
8. Runbook: recommend a single "new code" setting (not "Previous version").
9. Runbook: mention that the coverage/duplication conditions are skipped for PRs with fewer than 20 changed lines.
10. Runbook: name the red `DealsClient.test.tsx` that must be fixed before branch protection.

**NITs:** 5 (absolute-SF guard), 6 (pin vitest), 7 (web-next `coverage.include`), `sonar.python.version`, check name, public-repo note.

Re-review scope after fixes: only items 1-4 and 8-10.
