import { describe, expect, it } from 'vitest'

import { productLookupKey } from './product-key'

describe('productLookupKey', () => {
  it('joins store and product name with a pipe', () => {
    expect(productLookupKey('denner', 'bio vollmilch 1l')).toBe('denner|bio vollmilch 1l')
  })

  it('keeps two different stores of the same product name apart', () => {
    expect(productLookupKey('denner', 'milch')).not.toBe(productLookupKey('coop', 'milch'))
  })
})
