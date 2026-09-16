// revalidate-webhook — busts the web-next snapshot cache after a run
// publishes new deals, so fresh data shows up immediately instead of waiting
// for the `cacheLife('hours')` safety belt to expire on its own.
//
// NEVER THROWS, NEVER CHANGES THE OUTCOME: `finishRun` (`run-pipeline.ts`)
// calls `deps.revalidate()` unconditionally, first, before deciding this
// run's status (F3, code review of WP-P3) — and its type is `() =>
// Promise<void>`. Nothing here is ever inspected by the caller. A failure —
// including a timeout — means the site's cache stays stale a while longer,
// never that the run is reported as failed.
//
// INFRASTRUCTURE: the fetch call and the env lookup live here on purpose,
// same reasoning as `healthcheck-ping.ts`.

export type RevalidateWebhookDeps = {
  /** Injected so a test never makes a real network call. */
  readonly fetch: typeof fetch
  readonly log?: (message: string) => void
}

/**
 * N3 (code review, round 2 of WP-P3): F4 bounded the healthcheck ping for
 * exactly this reason — an unbounded webhook call, now on the
 * UNCONDITIONAL, FIRST line of `finishRun` (F3), could hold the process past
 * `RUN_TIMEOUT_MS` and get SIGTERM'd before it ever reaches its own
 * `process.exit`, which nick-fields/retry does NOT retry (verified against
 * its source — see `transformation/domain/resilience.ts`'s `RUN_DEADLINE_MS`
 * comment).
 *
 * 30s, not `healthcheck-ping.ts`'s 5s (`PING_TIMEOUT_MS`): this call
 * REGENERATES a Next.js snapshot (`revalidateTag`), not a bare ping —
 * legitimately slower, and a cold Vercel function can itself take several
 * seconds. Still small next to `SAFETY_MARGIN_MS` (2 min,
 * `resilience.ts`): even a FULL timeout leaves 90s of the deadline's own
 * margin unspent.
 */
export const REVALIDATE_TIMEOUT_MS = 30_000

/**
 * POSTs to `WEB_REVALIDATE_URL` if both env vars are set. NEVER throws — a
 * missing secret, a timeout, a network error or a non-2xx response are all
 * logged and nothing more.
 */
export async function pingRevalidateWebhook(
  env: Readonly<Record<string, string | undefined>>,
  deps: RevalidateWebhookDeps,
): Promise<void> {
  const log = deps.log ?? (() => {})
  const url = env.WEB_REVALIDATE_URL
  const secret = env.WEB_REVALIDATE_SECRET

  if (!url || !secret) {
    log('[pipeline] [INFO] revalidate webhook skipped — env vars not set')
    return
  }

  try {
    const res = await deps.fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'deals' }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    })
    if (!res.ok) {
      log(`[pipeline] [WARN] revalidate webhook ${res.status} ${res.statusText}`)
      return
    }
    log('[pipeline] [INFO] revalidate webhook ok')
  } catch (err) {
    // `AbortSignal.timeout` rejects with a `TimeoutError` DOMException —
    // named explicitly so the log says WHY, not just THAT it failed.
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    const detail = err instanceof Error ? err.message : String(err)
    log(
      `[pipeline] [WARN] revalidate webhook failed${timedOut ? ` (timed out after ${REVALIDATE_TIMEOUT_MS}ms)` : ''}: ${detail}`,
    )
  }
}
