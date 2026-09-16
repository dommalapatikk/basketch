import { describe, expect, it } from 'vitest'
import { isOk } from '../../collection/domain/result'
import type { Classifier } from './classifier'
import { guardClassifier } from './classifier'

// WP-P5 (code review F6): these tests moved here from
// `infrastructure/resilient-classifier.test.ts` when that file was deleted.
// `resilientClassifier` had shrunk to `return guardClassifier(deps.inner, log)`
// — a wrapper adding nothing beyond a rename — once rate limiting, retry and
// the circuit breaker moved into `ModelGate` (see `model-gate.test.ts`).
// `guardClassifier` is what's left: a `Classifier` that THROWS must still
// come back as an `Err`, never take the run down. Its own tests now live
// beside its own definition, not attached to a file that no longer exists.

describe('a port failure is a value, not an exception', () => {
  /**
   * THE WIDEST HOLE FOUND ON 2026-09-11.
   *
   * This guard exists to absorb a broken port contract. But `inner.classify`
   * used to be called unguarded, so a classifier that THROWS escaped past
   * every caller's `isOk` check entirely. It was masked only because
   * `createGeminiClassifier` catches internally and returns `err`. The
   * caller was depending on an adapter's politeness.
   *
   * A throw is not a new state here — `err` already exists in the return
   * type. It is an existing state arriving by the wrong mechanism.
   */
  const throwing: Classifier = {
    name: 'throwing',
    tier: 1,
    batchSize: 25,
    async classify() {
      throw new Error('ECONNRESET')
    },
  }

  const req = [{ productName: 'Emmi Milch', descriptor: null, retailer: 'denner' }]

  it('returns a failure instead of taking the run down', async () => {
    const c = guardClassifier(throwing, () => {})
    const res = await c.classify(req as never)
    expect(isOk(res)).toBe(false)
  })

  it('names the thrown error so a CI log can explain the failure', async () => {
    const c = guardClassifier(throwing, () => {})
    const res = await c.classify(req as never)
    expect(isOk(res)).toBe(false)
    if (!isOk(res)) expect(res.error).toMatch(/ECONNRESET/)
  })

  it('logs the breach it caught, so a silent contract violation is never silent', async () => {
    const lines: string[] = []
    const c = guardClassifier(throwing, (m) => lines.push(m))
    await c.classify(req as never)
    expect(lines.join(' ')).toMatch(/port contract breached/)
  })
})

describe('an empty batch', () => {
  it('still reaches the inner classifier — no special case for zero items', async () => {
    let calls = 0
    const inner: Classifier = {
      name: 'empty-ok',
      tier: 1,
      batchSize: 25,
      async classify(batch) {
        calls++
        return { ok: true, value: batch.map(() => ({ ok: true }) as never) }
      },
    }
    const r = await guardClassifier(inner, () => {}).classify([])
    expect(isOk(r)).toBe(true)
    expect(calls).toBe(1)
  })
})

describe('identity passthrough', () => {
  it("exposes the inner classifier's name, tier and batchSize unchanged", () => {
    const inner: Classifier = {
      name: 'gemini-3.5-flash-lite',
      tier: 1,
      batchSize: 25,
      async classify() {
        return { ok: true, value: [] }
      },
    }
    const c = guardClassifier(inner, () => {})
    expect(c.name).toBe('gemini-3.5-flash-lite')
    expect(c.tier).toBe(1)
    expect(c.batchSize).toBe(25)
  })
})
