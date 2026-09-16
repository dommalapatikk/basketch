// config.test.ts — guards on `.github/workflows/pipeline.yml` that no unit
// test elsewhere can see, because the file is config, not code.
//
// No YAML dependency added for one number: the workflow is small and stable
// enough that a scoped regex reading the ACTUAL file on disk is simpler and
// more honest than a hand-maintained duplicate of its structure (Kelsey
// Hightower: "no code is the best code").

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUN_DEADLINE_MS } from './transformation/domain/resilience'

const WORKFLOW_PATH = path.resolve(import.meta.dirname, '../.github/workflows/pipeline.yml')

function readCategorizeStepTimeoutMinutes(): number {
  const yaml = fs.readFileSync(WORKFLOW_PATH, 'utf-8')
  const stepIndex = yaml.indexOf('Categorize and store (with retry)')
  if (stepIndex === -1) {
    throw new Error(`pipeline.yml no longer has a "Categorize and store (with retry)" step — update this test's anchor`)
  }
  const afterStep = yaml.slice(stepIndex)
  const match = afterStep.match(/timeout_minutes:\s*(\d+)/)
  if (!match?.[1]) {
    throw new Error('no timeout_minutes found under the "Categorize and store (with retry)" step')
  }
  return Number(match[1])
}

describe('RUN_DEADLINE_MS < timeout_minutes in pipeline.yml — a threshold at the kill line can never be observed', () => {
  it('reads the real timeout_minutes off the workflow file, not a duplicated copy of it', () => {
    // Pinned to the value HANDOVER.md documents (45) so a change to EITHER
    // side without the other breaks this test loudly, rather than silently
    // drifting the two apart.
    expect(readCategorizeStepTimeoutMinutes()).toBe(45)
  })

  it('leaves the in-process deadline strictly inside the external step timeout', () => {
    const timeoutMs = readCategorizeStepTimeoutMinutes() * 60_000
    // Verified against nick-fields/retry's own source (index.ts:91-120,147): a
    // process killed by the EXTERNAL timeout is SIGTERM'd and never sets its
    // own exit code, so `exit` stays 0 and `retry_on_exit_code: 75` does not
    // match — that run is NOT retried, it just fails. `RUN_DEADLINE_MS` only
    // does its job if the process reaches `process.exit(75)` on its own,
    // before the external kill line. Equal is not enough — there must be
    // real room for the write pipeline (taxonomy, product resolution,
    // storeDeals, sweep, v3 cutover) to finish on whatever was classified.
    expect(RUN_DEADLINE_MS).toBeLessThan(timeoutMs)
  })
})
