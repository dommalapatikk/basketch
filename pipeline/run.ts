// Pipeline entry point — a thin shell.
//
// Reads env, builds the real dependencies (composition.ts), calls the
// orchestration (run-pipeline.ts), and maps the outcome to an exit code.
// Nothing else lives here: every log line and decision that used to be in
// this file's 700-line `main()` moved to `run-pipeline.ts`, unchanged, so it
// could finally be imported by a test.

import 'dotenv/config'

import { createProductionDeps } from './composition'
import { readCollectionMode } from './collection/application/collection-mode'
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
    cwd: process.cwd(),
    now,
    runId,
    collectionMode: readCollectionMode(process.env),
    isFinalAttempt: isFinalAttempt(process.env),
  })

  // AP-5: the dead-man ping fires on every exit — success or not, retried or
  // not. It answers "did the run reach its end", never "was the run good"
  // (that is `alerts.ts`'s job). Awaited so it cannot race process.exit below.
  await pingHealthcheck(process.env, { fetch, log: (m) => console.log(m) })

  const exitCode = exitCodeFor(outcome)
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

shell().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(1)
})
