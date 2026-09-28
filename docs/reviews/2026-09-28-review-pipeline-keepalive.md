# Code review: pipeline workflow keepalive (`ops/keepalive`)

**Date:** 2026-09-28 · **Reviewer:** Independent Code Reviewer · **Commit:** `1e593a9` vs `origin/main`
**Scope:** `.github/workflows/pipeline.yml`, `pipeline/observability/workflow-keepalive.test.ts`, `HANDOVER.md`, `docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md`

## Verdict: APPROVED WITH SHOULD-FIX (no MUST-FIX)

The change is correct, minimal and least-privilege. I found no blocking defect. There are two SHOULD-FIX items: the guard test does not protect the job's most important property (it must not be skippable when collection fails), and the dated 2026-11-26 check is in the RCA but not in the runbook that will actually be used.

## Checks performed (evidence)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Workflow-wide `contents: read` breaks nothing | PASS | The only token consumer is `actions/checkout@v4` (needs `contents: read`). `setup-node` `cache: npm` uses the Actions cache service via `ACTIONS_RUNTIME_TOKEN`, not `GITHUB_TOKEN` scopes. `setup-python` has no cache and reads only public version manifests. `nick-fields/retry` uses no token. Grep of `pipeline/`, `web/`, `.github/` for `GITHUB_TOKEN\|GH_TOKEN\|octokit\|api.github.com\|actions/cache\|upload-artifact` found no other use in pipeline.yml (`config.test.ts:189` even asserts there is no `upload-artifact`). `GITHUB_STEP_SUMMARY` is a file, and the healthcheck/revalidate calls go to external URLs with their own secrets. Nothing creates issues, commits, or artifacts. |
| 2 | Job-level `permissions` override semantics | PASS | Job-level `permissions` **replaces** the workflow default. It does not merge with it. So `workflow-keepalive` gets `actions: write` plus the implicit `metadata: read`, and every other scope is `none`, including `contents`. That is fine because the job does no checkout, and `gh api` with an explicit `repos/<owner>/<repo>` path needs no git checkout. `PUT …/actions/workflows/{id}/enable` requires Actions write, which is correct. The other two jobs inherit `contents: read`. |
| 3 | Runs when the main job fails, and on dispatch | PASS / desirable | There is no `needs:` or `if:`, so it runs in parallel at run start and is independent of `process-and-store`. It runs on `workflow_dispatch` too, which is harmless: a 204 no-op, and any run is proof of liveness. Job-level `continue-on-error: true` keeps the run conclusion green if the call fails, and `timeout-minutes: 2` bounds it. |
| 4 | No new secret exposure | PASS | `GH_TOKEN` is passed through `env` and never echoed. The only interpolation into the script is `${{ github.repository }}`, which is not attacker-controlled. Triggers are only `schedule` and `workflow_dispatch` (dispatch needs write access), so there is no path from a fork or PR. Pre-existing R4 still applies: workflow-level `env` gives Supabase secrets to every job, including this one. The job does not use them. This is correctly flagged as out of scope. |
| 5 | Guard test is meaningful (mutation) | PARTIAL | Baseline: 17/17 pass (`workflow-keepalive.test.ts` + `config.test.ts`). **Killed:** removing `continue-on-error` → red; deleting `actions: write` → red; removing the top-level `permissions` → red; pointing enable at `ci.yml` → red. **Survived:** adding `needs: process-and-store` → green; adding `if: ${{ success() }}` → green. See SF-1. The file was restored each time (`git status` clean). |
| 6 | YAML valid | PASS | Ruby `YAML.load_file` parses. Jobs are `process-and-store`, `keep-alive`, `workflow-keepalive`, and the top-level `permissions` is `{contents: read}`. `actionlint` is not installed, so I did not run it. |
| 7 | Residual risk / healthchecks wiring | PASS with gap | `HEALTHCHECK_PING_URL` is a repo secret (set 2026-09-18) and is passed to the run step. `run.ts:44` calls `pingHealthcheck`, and the last run's log (35983172760, 2026-09-24) shows `healthcheck ping ok`. The backstop is wired. The repo is public (`gh api … .visibility`), and `Deal Pipeline` is `active` today. Gap: the 2026-11-26 check is only in the RCA. See SF-2. |

## MUST-FIX

None.

## SHOULD-FIX

**SF-1: The guard test does not protect "a failed collection must not skip it".**
The comment at pipeline.yml:192 says this is the reason the keepalive is a separate job. However, a future `needs: process-and-store` or `if: success()` passes all tests (mutations M3 and M4 above). If that happened, the job would be skipped on exactly the runs that matter: weeks of failing collections followed by a disable. Add one assertion to `workflow-keepalive.test.ts`:
```ts
it('is independent of the collection job (no needs:/if:)', () => {
  expect(job).not.toMatch(/\n {4}(needs|if):/)
})
```

**SF-2: Put the dated verification into HANDOVER.md, not only the RCA.**
R1 (it is undocumented whether enable resets the timer) is the real open risk. The RCA says "check around 2026-11-26", but the PM is stepping away and HANDOVER.md is what gets read. Add one line under the runbook: *"On/after 2026-11-26 (60 days after the last commit 2026-09-27): `gh workflow list --all` must show Deal Pipeline `active`. If it shows `disabled_inactivity`, the enable-API keepalive does not reset the timer. Re-enable, and escalate to a PAT-based marker commit (RCA option b)."* A calendar reminder or scheduled agent for that date would be better still, because nothing in the repo will prompt anyone.

## NIT

- **N1:** The RCA's point E4 correctly notes that `gautamkrishnar/keepalive-workflow` is ToS-disabled. The pipeline.yml comment (lines 187–188) still presents it as a peer mechanism. Consider adding "(now disabled by GitHub)" so nobody later swaps in `uses:` for it.
- **N2:** `echo "Workflow keepalive OK"` could also print the HTTP status (`gh api -i … | head -1`) so the log shows the 204. This is optional.
- **N3 (pre-existing, outside this diff, affects the R1 backstop's credibility):** attempt 1 of a retried run pings `/75`, which healthchecks.io treats as FAILURE (log: `healthcheck ping ok (exit 75)` at 10:32 on 2026-09-24). The check therefore flaps down until attempt 2 pings `/0`. Separately, the runbook's suggested Period 3 days + Grace 1 day is about equal to the Thu→Mon gap (4 days), and runs start ~4h late. Both can cause false alerts, and alert fatigue weakens the dead-man's switch this change relies on. I could not verify the healthchecks.io dashboard settings from the repo. Worth a follow-up ticket; not for this branch.

## What's good

- The RCA was done first, the evidence table is honest about the undocumented timer reset, and the rejected options are reasoned.
- There is no third-party action, no commits, no push, and no CI loop. The fix is the smallest one that could work.
- Tightening the workflow default to read-only at the same time is a genuine security improvement, and it is verified not to break any step.
- The HANDOVER runbook gives the exact recovery commands.
