import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guard for docs/rca/2026-09-28-tech-lead-pipeline-keepalive.md.
// GitHub auto-disables scheduled workflows in a public repo after 60 days with
// no repository activity (it happened 2026-07-31). pipeline.yml re-enables
// itself on every run. If someone deletes or weakens that job, the pipeline
// silently stops ~60 days after the last commit — this test goes red instead.
// Text-based on purpose: the repo has no YAML parser dependency.

const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/pipeline.yml'), 'utf8')

function jobBlock(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  if (start === -1) return ''
  const rest = workflow.slice(start + 1)
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

describe('pipeline.yml keeps itself enabled (60-day inactivity rule)', () => {
  const job = jobBlock('workflow-keepalive')

  it('has a workflow-keepalive job', () => {
    expect(job).not.toBe('')
  })

  it('calls the enable endpoint for pipeline.yml', () => {
    expect(job).toMatch(/gh api -X PUT[\s\\]+"repos\/\$\{\{ github\.repository \}\}\/actions\/workflows\/pipeline\.yml\/enable"/)
  })

  it('can never fail the pipeline run', () => {
    expect(job).toMatch(/\n {4}continue-on-error: true\n/)
  })

  it('asks for actions: write only, and the workflow default stays read-only', () => {
    expect(job).toMatch(/\n {4}permissions:\n {6}actions: write\n {4}steps:/)
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n/)
  })

  // Review SF-1: the job is separate so a failed collection cannot skip it.
  it('is independent of the collection job (no needs:/if:)', () => {
    expect(job).not.toMatch(/\n {4}(needs|if):/)
  })

  it('still runs on a schedule (the thing being kept alive)', () => {
    expect(workflow).toMatch(/\n {2}schedule:\n/)
  })
})
