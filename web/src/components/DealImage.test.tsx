// Sanity test: DealImage always renders a monogram fallback tile per store.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { DealImage } from './DealImage'

afterEach(cleanup)

describe('DealImage fallback tile', () => {
  it('renders Migros monogram "M"', () => {
    const { container } = render(<DealImage store='migros' size={72} />)
    expect(container.textContent).toContain('M')
  })

  it('renders LIDL monogram "L"', () => {
    const { container } = render(<DealImage store='lidl' size={48} />)
    expect(container.textContent).toContain('L')
  })

  it('exposes an aria-label naming the store', () => {
    const { getByLabelText } = render(<DealImage store='coop' size={40} />)
    expect(getByLabelText(/Coop product placeholder/i)).toBeTruthy()
  })
})
