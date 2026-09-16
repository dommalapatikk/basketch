// healthcheck-ping — the out-of-band dead-man's switch (AP-5).
//
// Every failure mode this pipeline can detect ABOUT ITSELF still requires the
// process to be alive enough to report it. A hang that never reaches
// `run.ts`'s exit mapping, a workflow that silently stops being scheduled
// (HANDOVER.md §4: "pipeline stopped for 60 days — GitHub disables idle cron;
// nothing noticed"), or a runner that dies before any log line is written are
// all invisible to `alerts.ts`, because nothing inside the run ever gets to
// run.
//
// healthchecks.io (or any compatible service) inverts that: IT watches for
// silence. This module's only job is to tell it "the run reached its end,
// with THIS exit code" — which is why it is called unconditionally, on every
// exit code, success or not.
//
// SEMANTICS (F4, code review of the first WP-P3 submission; written up in
// `docs/runbooks/healthcheck-ping.md` so nobody reads a green check as
// healthy): a bare GET is healthchecks.io's SUCCESS signal regardless of how
// the run actually went, so an exit-1 run pinging the bare URL would have
// reported itself healthy. Pinging `${url}/${exitCode}` uses healthchecks.io's
// own convention — `/0` reports success, any other value reports FAILURE —
// so the dashboard's pass/fail state tracks `run.ts`'s actual exit code, not
// merely "a process ran". This still only measures "did the run happen at
// all"; whether the run was GOOD is `alerts.ts`'s job, a separate question.
//
// INFRASTRUCTURE: the fetch call and the env lookup live here on purpose —
// "should a missing secret warn instead of fail" is not a domain decision,
// it is what AP-5 already decided. Nothing here is worth a pure function.

export type HealthcheckPingResult =
  | { readonly status: 'ok' }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string }

export type HealthcheckPingDeps = {
  /** Injected so a test never makes a real network call. */
  readonly fetch: typeof fetch
  readonly log?: (message: string) => void
}

/**
 * F4: undici's default headers timeout is 300s. A hung ping would add up to
 * five minutes to a run whose whole problem is running out of time — the
 * dead-man switch helping to kill the run it watches. Five seconds is
 * generous for a bare GET against a purpose-built ping endpoint.
 */
const PING_TIMEOUT_MS = 5_000

function pingUrlFor(baseUrl: string, exitCode: number): string {
  return `${baseUrl.replace(/\/+$/, '')}/${exitCode}`
}

/**
 * Pings `HEALTHCHECK_PING_URL` (suffixed with the run's exit code) if the
 * secret is set. NEVER throws and NEVER fails the run — a missing secret, a
 * timeout, a network error or a non-2xx response are all logged as warnings
 * and nothing more. A dead-man's switch that can fail the thing it is
 * watching defeats its own purpose.
 */
export async function pingHealthcheck(
  env: Readonly<Record<string, string | undefined>>,
  exitCode: number,
  deps: HealthcheckPingDeps,
): Promise<HealthcheckPingResult> {
  const log = deps.log ?? (() => {})
  const baseUrl = env.HEALTHCHECK_PING_URL

  if (!baseUrl) {
    const reason = 'HEALTHCHECK_PING_URL not set — dead-man ping skipped'
    log(`[pipeline] [WARN] ${reason}`)
    return { status: 'skipped', reason }
  }

  const url = pingUrlFor(baseUrl, exitCode)

  try {
    const res = await deps.fetch(url, { method: 'GET', signal: AbortSignal.timeout(PING_TIMEOUT_MS) })
    if (!res.ok) {
      const reason = `healthcheck ping responded ${res.status} ${res.statusText}`
      log(`[pipeline] [WARN] ${reason}`)
      return { status: 'failed', reason }
    }
    log(`[pipeline] [INFO] healthcheck ping ok (exit ${exitCode})`)
    return { status: 'ok' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    log(`[pipeline] [WARN] healthcheck ping failed: ${reason}`)
    return { status: 'failed', reason }
  }
}
