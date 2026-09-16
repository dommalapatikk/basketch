// Pipeline entry point — a thin shell.
//
// Reads env, builds the real dependencies (composition.ts), calls the
// orchestration (run-pipeline.ts), and maps the outcome to an exit code.
// Nothing else lives here: every log line and decision that used to be in
// this file's 700-line `main()` moved to `run-pipeline.ts`, unchanged, so it
// could finally be imported by a test.

import 'dotenv/config'

import { createProductionDeps } from './composition'
import { pingHealthcheck } from './observability/healthcheck-ping'
import { computeRunId, exitCodeFor, runPipeline } from './run-pipeline'

/**
 * WP-P3 / RCA T1: `pipeline.yml`'s `new_command_on_retry` sets this to `1` for
 * nick-fields/retry's final attempt. Attempt 1 leaving the in-process deadline
 * unfinished must exit 75 (retried); the final attempt hitting it must
 * publish what it has and exit 0 — there is no further attempt to defer to.
 */
function isFinalAttempt(env: Record<string, string | undefined>): boolean {
  return env.PIPELINE_FINAL_ATTEMPT === '1'
}

async function shell(): Promise<void> {
  const now = new Date()
  const runId = computeRunId(process.env, now)
  const deps = createProductionDeps(process.env)

  const outcome = await runPipeline(deps, {
    now,
    runId,
    isFinalAttempt: isFinalAttempt(process.env),
  })

  const exitCode = exitCodeFor(outcome)

  // AP-5: the dead-man ping fires on every exit — success or not, retried or
  // not — carrying the exit code itself (F4: healthchecks.io reads `/0` as
  // success and any other suffix as failure, so the dashboard's pass/fail
  // state tracks what actually happened, not merely "a process ran"). It
  // answers "did the run reach its end", never "was the run good" (that is
  // `alerts.ts`'s job). Awaited so it cannot race process.exit below.
  await pingHealthcheck(process.env, exitCode, { fetch, log: (m) => console.log(m) })

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

shell().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(1)
})
