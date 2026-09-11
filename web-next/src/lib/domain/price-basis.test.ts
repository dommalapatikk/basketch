import { describe, expect, it } from 'vitest'
import { createPriceBasis, isMemberOnly, programmeOf } from './price-basis'
import { isOk, unwrap } from './result'

/**
 * THE LIDL RULE, as a type.
 *
 * LIDL publishes its Lidl Plus member price in the same field as an open price,
 * with nothing to distinguish them. Rendering one as a price anybody can pay is
 * the Art. 3(1)(e) UWG exposure the pipeline's loyalty check exists to prevent.
 *
 * The point of these tests is that "member price with no programme named" must
 * be UNREPRESENTABLE, not merely discouraged. A nullable `loyaltyProgramme`
 * beside a `priceBasis` string lets it be built and pushes the problem to
 * whoever renders it — which is how it ended up being handled by a fallback
 * string that says "Loyalty members only" and names nobody.
 */
describe('createPriceBasis', () => {
  it('builds an open price that anybody can pay', () => {
    const basis = unwrap(createPriceBasis('everyone', null))
    expect(isMemberOnly(basis)).toBe(false)
    expect(programmeOf(basis)).toBeNull()
  })

  it('builds a member price that names its programme', () => {
    const basis = unwrap(createPriceBasis('member-only', 'Lidl Plus'))
    expect(isMemberOnly(basis)).toBe(true)
    expect(programmeOf(basis)).toBe('Lidl Plus')
  })

  it('REFUSES a member price with no programme', () => {
    expect(isOk(createPriceBasis('member-only', null))).toBe(false)
    expect(isOk(createPriceBasis('member-only', ''))).toBe(false)
    expect(isOk(createPriceBasis('member-only', '   '))).toBe(false)
  })

  it('explains the refusal in terms of the rule it enforces', () => {
    const r = createPriceBasis('member-only', null)
    if (!isOk(r)) expect(r.error).toMatch(/programme/i)
  })

  it('ignores a programme attached to an open price', () => {
    // The database allows loyalty_programme to be set alongside 'everyone'.
    // Carrying it would let a card claim membership is required when it is not.
    const basis = unwrap(createPriceBasis('everyone', 'Supercard'))
    expect(isMemberOnly(basis)).toBe(false)
    expect(programmeOf(basis)).toBeNull()
  })

  it('trims a padded programme name rather than rendering the padding', () => {
    const basis = unwrap(createPriceBasis('member-only', '  Cumulus  '))
    expect(programmeOf(basis)).toBe('Cumulus')
  })

  it('treats an unknown basis as open rather than failing the whole deal', () => {
    // A value the CHECK constraint would reject should never arrive. If it
    // does, the safe reading is the one that claims LESS: an open price makes
    // no assertion about membership.
    const basis = unwrap(createPriceBasis('mitglieder', null))
    expect(isMemberOnly(basis)).toBe(false)
  })

  it('makes the invalid state unrepresentable in the type, not just at runtime', () => {
    const basis = unwrap(createPriceBasis('member-only', 'Lidl Plus'))
    // Narrowing on the discriminant is what gives the renderer a non-null
    // programme without a check of its own.
    if (basis.kind === 'member-only') {
      const programme: string = basis.programme
      expect(programme).toBe('Lidl Plus')
    } else {
      throw new Error('expected a member-only basis')
    }
  })
})
