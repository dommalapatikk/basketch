import { describe, expect, it } from 'vitest'
import { createNoopGate } from './gate'

describe('createNoopGate', () => {
  it('calls the attempt exactly once and returns its result unchanged', async () => {
    let calls = 0
    const gate = createNoopGate()
    const result = await gate.request(async () => {
      calls++
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  it('propagates a thrown error without retrying', async () => {
    let calls = 0
    const gate = createNoopGate()
    await expect(
      gate.request(async () => {
        calls++
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(calls).toBe(1)
  })
})
