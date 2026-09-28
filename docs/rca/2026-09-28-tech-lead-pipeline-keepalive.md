# RCA + decision: keep the scheduled pipeline alive without commits

**Date:** 2026-09-28 · **Role:** Tech Lead · **Branch:** `ops/keepalive` (not pushed)

## Problem

The PM is stepping away; basketch must run unattended. `dommalapatikk/basketch` is
public. GitHub auto-disables scheduled workflows in public repos after 60 days
without repository activity. It happened on 2026-07-31 (`disabled_inactivity`,
fixed by hand with `gh workflow enable pipeline.yml`). Last commit 2026-09-27 →
next auto-disable around 2026-11-26 if nothing changes.

**Root cause:** the pipeline's liveness depended on human commits. Nothing in
the system itself resets the inactivity timer.

## Evidence (primary sources, fetched 2026-09-28)

| # | Source | What it says |
|---|---|---|
| E1 | GitHub Docs, "Disabling and enabling a workflow" (docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows) | "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." Re-enable via UI or `gh workflow enable`. **Does not define "activity".** |
| E2 | GitHub REST docs, "Enable a workflow" | `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable` → `204 No Content`. |
| E3 | liskin/gh-workflow-keepalive README | "will not create any dummy commits. Instead, it uses GitHub API to preemptively re-enable the workflow". Requires `permissions: actions: write` (i.e. GITHUB_TOKEN is enough). |
| E4 | gautamkrishnar/keepalive-workflow (github.com) | Repo page now shows it **disabled by GitHub Staff for a ToS violation**. Its v1 made dummy commits; its v2 switched to the enable API. |
| E5 | schloerke/schloerke.github.io PR #2 | Inlines the same `PUT …/enable` call "that gautamkrishnar/keepalive-workflow@v2 made … blocked by GitHub since 2025-04, so `uses:` would fail"; also notes github-actions[bot] commits from the workflow did not count as activity. |
| E6 | GitHub community discussion #184653 | No staff answer on what counts as activity; one user explicitly unsure whether the API call resets the timer. |

## Options

| Option | Verdict |
|---|---|
| (a) `PUT …/enable` from the workflow, GITHUB_TOKEN `actions: write` | **Chosen.** The mechanism used by the two most-used keepalive actions (E3, E4 v2), no commits, no pushes, no CI trigger, no third-party code. Not officially documented as resetting the timer (E1, E6). |
| (b) periodic empty/marker commit, `contents: write` | Rejected. Commits by GITHUB_TOKEN reportedly do not count as activity (E5); a PAT would be needed (a long-lived secret that also expires). Pollutes history, needs write scope on code, and the dummy-commit style is what the ToS-blocked action was known for (E4). |
| (c) third-party keepalive action | Rejected. Supply-chain risk for a 1-line API call; the best-known one is already blocked (E4) — `uses:` would have broken the run. |
| (d) separate monthly keepalive workflow | Rejected. It is itself a scheduled workflow subject to the same 60-day rule; adds a second thing to disable. |

## Decision (implemented)

`.github/workflows/pipeline.yml`:

1. New job `workflow-keepalive` — separate job (a failed collection must not skip it),
   `continue-on-error: true` (can never fail the run), `timeout-minutes: 2`,
   job-level `permissions: actions: write` only, runs `gh api -X PUT
   repos/${{ github.repository }}/actions/workflows/pipeline.yml/enable`.
   Runs on every pipeline run (Mon/Tue/Thu) → ~26 calls per 60-day window.
   Enabling an enabled workflow is a no-op 204. Nothing is pushed → no CI loop.
2. Workflow-level `permissions: contents: read` (least privilege for all other
   jobs; only `actions/checkout` uses the token — verified no pipeline code reads
   `GITHUB_TOKEN`).
3. Guard test `pipeline/observability/workflow-keepalive.test.ts` (runs in CI's
   `Test (TypeScript)` job): asserts the job exists, calls the enable endpoint for
   `pipeline.yml`, has `continue-on-error: true`, `actions: write`, and the
   read-only default. Verified red when `continue-on-error` is flipped to false.
4. HANDOVER.md health check + runbook (`gh workflow list --all`, `gh workflow enable pipeline.yml`).

## Residual risk

- **R1 (medium):** GitHub does not document that the enable API resets the
  inactivity timer (E1, E6). Evidence is community practice (E3–E5). If it
  does not, the workflow still gets disabled ~60 days after the last human commit.
  **Backstop:** the existing healthchecks.io dead-man's switch (AP-5,
  `HEALTHCHECK_PING_URL`) alerts when runs stop; fix is one command
  (`gh workflow enable pipeline.yml`). Recommended check: `gh workflow list --all`
  around 2026-11-26 (60 days after the last commit) to confirm it is still `active`.
- **R2 (low):** GitHub could treat keepalive tooling as ToS abuse (E4). The API
  call is a documented, first-party endpoint used on the repo's own workflow at the
  pipeline's normal cadence — no synthetic commits — which is the least-abusive form.
- **R3 (low):** A disabled workflow cannot re-enable itself; the call only helps
  while it keeps running. Covered by the R1 backstop.
- **R4 (low):** workflow-level `env:` still exposes Supabase secrets to every job,
  including this one (it doesn't use them). Unchanged; out of scope.
