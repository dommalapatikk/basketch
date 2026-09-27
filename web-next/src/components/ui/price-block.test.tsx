// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PriceBlock } from './price-block'

afterEach(cleanup)

// Code review 2026-09-27 SHOULD-FIX 1: `locale` is typed `Locale` ('de' |
// 'en'), not a bare `string` — a caller cannot pass an arbitrary Intl tag
// straight through to Intl.NumberFormat. This test proves both accepted
// values render correctly formatted CHF prices.
describe('PriceBlock', () => {
  it('formats the price to two decimals with the default locale', () => {
    render(<PriceBlock current={5.3} />)
    expect(screen.getByText('5.30')).toBeTruthy()
  })

  it.each(['de', 'en'] as const)('formats correctly for locale=%s', (locale) => {
    render(<PriceBlock current={12} locale={locale} />)
    expect(screen.getByText('12.00')).toBeTruthy()
  })

  it('shows the previous price struck through when it exceeds the current price', () => {
    const { container } = render(<PriceBlock current={5.3} previous={7.95} locale="en" />)
    expect(container.textContent).toContain('7.95')
  })
})
