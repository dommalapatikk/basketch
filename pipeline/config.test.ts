// config.test.ts — guards on `.github/workflows/pipeline.yml` that no unit
// test elsewhere can see, because the file is config, not code.
//
// No YAML dependency added for a handful of numbers: the workflow is small
// and stable enough that a scoped regex reading the ACTUAL file on disk is
// simpler and more honest than a hand-maintained duplicate of its structure
// (Kelsey Hightower: "no code is the best code").
//
// F2 (code review of the first WP-P3 submission): the reviewer deleted
// `retry_on_exit_code: 75`, `new_command_on_retry` and `PIPELINE_FINAL_ATTEMPT`
// from the workflow and BOTH tests that existed at the time still passed —
// they only ever checked `timeout_minutes`. Every load-bearing piece of the
// T1 retry contract now has its own assertion below.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_CHUNK_MS, RUN_DEADLINE_MS, SAFETY_MARGIN_MS, WRITE_TAIL_MS } from './transformation/domain/resilience'

const WORKFLOW_PATH = path.resolve(import.meta.dirname, '../.github/workflows/pipeline.yml')
const STEP_ANCHOR = 'Categorize and store (with retry)'

/**
 * The exact text of one step's block — from its `- name:` line up to (but
 * not including) the next line at the SAME OR LESSER indentation: a sibling
 * step, or a dedent back to job level.
 *
 * F2: an unscoped regex over the WHOLE FILE would silently keep matching
 * `timeout_minutes:` from a LATER step (or a later job) if this step's own
 * line were ever deleted — the exact defect a reviewer found by deleting the
 * step's contract and watching the old tests stay green. Bounding to the
 * step's own block turns "the anchor's own key is missing" into a thrown
 * error instead of a wrong number.
 */
export function extractStepBlock(yaml: string, stepAnchor: string): string {
  const lines = yaml.split('\n')
  const startIndex = lines.findIndex((l) => l.includes(stepAnchor))
  if (startIndex === -1) {
    throw new Error(`pipeline.yml has no step matching "${stepAnchor}" — update this test's anchor`)
  }
  const stepIndent = lines[startIndex]!.match(/^(\s*)/)?.[1]?.length ?? 0

  const blockLines = [lines[startIndex]!]
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') {
      blockLines.push(line)
      continue
    }
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0
    if (indent <= stepIndent) break // a sibling step, or a dedent back to job level
    blockLines.push(line)
  }
  return blockLines.join('\n')
}

function readCategorizeStepBlock(): string {
  const yaml = fs.readFileSync(WORKFLOW_PATH, 'utf-8')
  return extractStepBlock(yaml, STEP_ANCHOR)
}

function readCategorizeStepTimeoutMinutes(): number {
  const block = readCategorizeStepBlock()
  const match = block.match(/timeout_minutes:\s*(\d+)/)
  if (!match?.[1]) {
    throw new Error(`no timeout_minutes found under the "${STEP_ANCHOR}" step`)
  }
  return Number(match[1])
}

describe('the step-block scoping itself (F2) — a defect the old, file-wide regex could not see', () => {
  it('throws when the step keeps its timeout but a LATER, unrelated step also has one — never silently matches the wrong one', () => {
    const syntheticYaml = [
      '      - name: Categorize and store (with retry)',
      '        with:',
      '          timeout_minutes: 60',
      '          max_attempts: 2',
      '      - name: Some later step',
      '        with:',
      '          timeout_minutes: 999',
    ].join('\n')

    const block = extractStepBlock(syntheticYaml, STEP_ANCHOR)
    expect(block).not.toContain('999')
    expect(block.match(/timeout_minutes:\s*(\d+)/)?.[1]).toBe('60')
  })

  it('throws loudly when the step no longer carries its own timeout_minutes at all, rather than reading a later one', () => {
    // THE F2 SCENARIO EXACTLY: this step's own key is gone; an unscoped
    // regex over the whole string would have found "999" below and reported
    // a wrong-but-plausible number.
    const syntheticYaml = [
      '      - name: Categorize and store (with retry)',
      '        with:',
      '          max_attempts: 2',
      '      - name: Some later step',
      '        with:',
      '          timeout_minutes: 999',
    ].join('\n')

    const block = extractStepBlock(syntheticYaml, STEP_ANCHOR)
    expect(block.match(/timeout_minutes:\s*(\d+)/)).toBeNull()
  })

  it('stops at a dedent back to job level, not only at a sibling step', () => {
    const syntheticYaml = [
      '      - name: Categorize and store (with retry)',
      '        with:',
      '          timeout_minutes: 60',
      '  keep-alive:',
      '    steps:',
      '      - run: echo timeout_minutes: 999',
    ].join('\n')

    const block = extractStepBlock(syntheticYaml, STEP_ANCHOR)
    expect(block).not.toContain('keep-alive')
    expect(block).not.toContain('999')
  })
})

describe('the T1 retry contract in pipeline.yml (F2) — each piece asserted, not only timeout_minutes', () => {
  it('reads the real timeout_minutes off the workflow file, not a duplicated copy of it', () => {
    // Pinned to the value the F1 ruling set (60) so a change to EITHER side
    // without the other breaks this test loudly, rather than silently
    // drifting the two apart.
    expect(readCategorizeStepTimeoutMinutes()).toBe(60)
  })

  // ⚠️ LINE-ANCHORED (`^\s*key:`, multiline flag) — NOT a bare substring
  // search. This module's own comments narrate `retry_on_exit_code: 75` and
  // `new_command_on_retry` in prose right next to the real keys; an
  // unanchored regex matches the COMMENT and reports the key present when
  // the actual YAML line is gone. Caught by this file's own mutation pass
  // (deleting the real `retry_on_exit_code: 75` line still left the test
  // green until this anchor was added).
  it('retries EX_TEMPFAIL (75) only — the exit code run.ts uses for a transient failure', () => {
    expect(readCategorizeStepBlock()).toMatch(/^\s*retry_on_exit_code:\s*75\s*$/m)
  })

  it('allows exactly 2 attempts — each one RESUMES, a third is rarely useful', () => {
    expect(readCategorizeStepBlock()).toMatch(/^\s*max_attempts:\s*2\s*$/m)
  })

  it('runs a DIFFERENT command on the retry, flagged as the final attempt — without this, attempt 2 also defers and nothing ever publishes', () => {
    const block = readCategorizeStepBlock()
    const match = block.match(/^\s*new_command_on_retry:\s*(.+)$/m)
    expect(match?.[1]).toBeTruthy()
    const retryCommand = match![1]!
    expect(retryCommand).toContain('cd pipeline &&')
    expect(retryCommand).toContain('PIPELINE_FINAL_ATTEMPT=1')
  })
})

describe('RUN_DEADLINE_MS < timeout_minutes in pipeline.yml — a threshold at the kill line can never be observed', () => {
  it('leaves the FULL write tail inside the external step timeout, not merely the deadline itself (F1)', () => {
    const timeoutMs = readCategorizeStepTimeoutMinutes() * 60_000
    // F1, code review of the first WP-P3 submission: `RUN_DEADLINE_MS <
    // timeoutMs` alone is TRIVIALLY true and would have passed the whole time
    // the old 35-minute deadline was unsafe (35 < 45, and 35 + the ~19.5 min
    // p99 chunk + the ~9.5 min write tail = 64 > 45) — the exact
    // coverage-theatre shape HANDOVER §4 warns about. Assert the REAL
    // inequality, with the named, individually-measured constants:
    //
    //   RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS + SAFETY_MARGIN_MS
    //     ≤ timeout_minutes
    //
    // Verified against nick-fields/retry's own source (index.ts:91-120,147):
    // a process killed by THIS external timeout is SIGTERM'd and never sets
    // its own exit code, so `retry_on_exit_code: 75` never matches — that
    // run is NOT retried, it just fails. `RUN_DEADLINE_MS` only does its job
    // if the process reaches `process.exit(75)` on its own, with real room
    // left over for the write pipeline, before this line is ever reached.
    expect(RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS + SAFETY_MARGIN_MS).toBeLessThanOrEqual(timeoutMs)
  })
})
