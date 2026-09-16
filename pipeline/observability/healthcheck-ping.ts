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
// silence. This module's only job is to tell it "the run reached its end" —
// which is why it is called unconditionally, on every exit code, success or
// not. Run quality is `alerts.ts`'s job; this is "did the run happen at all".
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
 * Pings `HEALTHCHECK_PING_URL` if it is set. NEVER throws and NEVER fails the
 * run — a missing secret, a network error or a non-2xx response are all
 * logged as warnings and nothing more. A dead-man's switch that can fail the
 * thing it is watching defeats its own purpose.
 */
export async function pingHealthcheck(
  env: Readonly<Record<string, string | undefined>>,
  deps: HealthcheckPingDeps,
): Promise<HealthcheckPingResult> {
  const log = deps.log ?? (() => {})
  const url = env.HEALTHCHECK_PING_URL

  if (!url) {
    const reason = 'HEALTHCHECK_PING_URL not set — dead-man ping skipped'
    log(`[pipeline] [WARN] ${reason}`)
    return { status: 'skipped', reason }
  }

  try {
    const res = await deps.fetch(url, { method: 'GET' })
    if (!res.ok) {
      const reason = `healthcheck ping responded ${res.status} ${res.statusText}`
      log(`[pipeline] [WARN] ${reason}`)
      return { status: 'failed', reason }
    }
    log('[pipeline] [INFO] healthcheck ping ok')
    return { status: 'ok' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    log(`[pipeline] [WARN] healthcheck ping failed: ${reason}`)
    return { status: 'failed', reason }
  }
}
