import { describe, expect, it } from 'vitest'
import { statefulClock } from './clock'

describe('statefulClock (F9) — shared by every test that scripts now(), throws rather than silently drifting', () => {
  it('returns each scripted value once, in order', () => {
    const clock = statefulClock([10, 20, 30])
    expect(clock()).toBe(10)
    expect(clock()).toBe(20)
    expect(clock()).toBe(30)
  })

  it('throws once the script is exhausted, instead of silently repeating the last value', () => {
    // THE WHOLE POINT: the old two duplicated implementations repeated the
    // last value forever, which is exactly how one extra now() call inserted
    // upstream could silently change what a test's later assertions measure
    // without the test ever going red.
    const clock = statefulClock([1])
    expect(clock()).toBe(1)
    expect(() => clock()).toThrow(/exhausted/)
  })
})
