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
import { computeRunId, runPipeline } from './run-pipeline'

async function shell(): Promise<void> {
  const now = new Date()
  const runId = computeRunId(process.env, now)
  const deps = createProductionDeps(process.env)

  const outcome = await runPipeline(deps, {
    cwd: process.cwd(),
    now,
    runId,
    collectionMode: readCollectionMode(process.env),
  })

  // Exit 0 on full success, exit 1 on every other outcome. WP-P3 splits this
  // into 0 / 75 / 1 with a final-attempt flag — this shell does not.
  if (outcome.status !== 'ok') {
    process.exit(1)
  }
}

shell().catch((err) => {
  console.error('[pipeline] [ERROR] Unexpected pipeline error:', err)
  process.exit(1)
})
