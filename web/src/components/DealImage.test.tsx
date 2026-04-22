// Sanity test: DealImage always renders a monogram fallback tile per store.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { DealImage } from './DealImage'

afterEach(cleanup)

describe('DealImage fallback tile', () => {
  it('renders Migros monogram "M" when no photoUrl', () => {
    const { container } = render(<DealImage store='migros' size={72} />)
    expect(container.textContent).toContain('M')
  })

  it('renders LIDL monogram "L" when photoUrl is null', () => {
    const { container } = render(<DealImage store='lidl' size={48} photoUrl={null} />)
    expect(container.textContent).toContain('L')
  })

  it('exposes an aria-label naming the store', () => {
    const { getByLabelText } = render(<DealImage store='coop' size={40} />)
    expect(getByLabelText(/Coop product placeholder/i)).toBeTruthy()
  })
})

describe('DealImage photo rendering', () => {
  it('renders an <img> when photoUrl is present', () => {
    const { container } = render(
      <DealImage store='spar' size={72} photoUrl='https://example.test/img.webp' alt='Tomatoes 1kg' />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.test/img.webp')
    expect(img?.getAttribute('alt')).toBe('Tomatoes 1kg')
    expect(img?.getAttribute('loading')).toBe('lazy')
  })

  it('omits the monogram label when rendering a real photo', () => {
    const { queryByLabelText } = render(
      <DealImage store='spar' size={48} photoUrl='https://example.test/img.webp' />,
    )
    expect(queryByLabelText(/product placeholder/i)).toBeNull()
  })
})
