# Runbook: the healthchecks.io dead-man ping (AP-5)

**Read this before trusting a green check on the healthchecks.io dashboard.**
It answers one question, and one question only: *did the pipeline reach the
end of `run.ts`'s `shell()` function, on this run's last attempt.* It does
NOT mean the run published good data, published any data at all, or even
published at all. Run **quality** is `alerts.ts`'s job — a separate signal,
in Supabase's `pipeline_runs`, not this dashboard.

## What pings, and when

`pipeline/observability/healthcheck-ping.ts`'s `pingHealthcheck` is called
**exactly once**, unconditionally, at the very end of `run.ts`'s `shell()` —
after the pipeline outcome is known, before `process.exit`. It fires on every
outcome: success, a deadline-triggered retry, a deterministic failure. It
never fires more than once per process, and never fires if the process
crashes or is killed before reaching that line — which is precisely the
failure mode this exists to catch.

## The exit-code suffix — read this before assuming green means healthy

The ping URL is **`${HEALTHCHECK_PING_URL}/${exitCode}`**, not the bare
secret URL. This is healthchecks.io's own convention:

| Ping | healthchecks.io reads it as |
|---|---|
| `.../0` | **success** — exit code 0, `run.ts` completed normally |
| `.../75` | **failure** — a transient condition (the in-process deadline, or an unreadable classification cache/Supabase) asked to be retried |
| `.../1` | **failure** — a deterministic failure, a bug, or a critical alert; NOT retried |
| bare URL, no suffix | **success**, always, regardless of what actually happened |

**Before F4 (2026-09-16 code review of WP-P3's first submission), the ping
was a bare GET.** An exit-1 run — a genuine, unretried failure — reported
itself HEALTHY on the dashboard. If you are reading an old incident and the
dashboard says green while the site was stale, this is why: the ping predates
the exit-code suffix.

**So: a green check today means "the last attempt exited 0". A red check
means "the last attempt exited 75 or 1". Neither tells you whether data was
published — check `pipeline_runs` (or, once WP-P7 lands, the run metrics
snapshot) for that.**

## Timeout

The ping itself carries a 5-second `AbortSignal.timeout` (`PING_TIMEOUT_MS`
in `healthcheck-ping.ts`). Undici's default headers timeout is 300 seconds —
a hung ping could otherwise add up to five minutes to a run whose entire
problem is running out of time. A ping that times out, errors, or gets a
non-2xx response is logged as a `[WARN]` and **never fails the run** — a
dead-man's switch that can kill the run it watches defeats its own purpose.

## Setup

1. Create a check on healthchecks.io. Period: 1 day (once the daily cron
   lands, WP-J3; until then, 3 days). Grace: 1 day.
2. Add its ping URL as the GitHub secret `HEALTHCHECK_PING_URL` — **the base
   URL only**, no exit code suffix. The code appends it.
3. If the secret is absent, `pingHealthcheck` logs a `[WARN]` and returns
   `{ status: 'skipped' }`. The run is never failed by a missing secret.
