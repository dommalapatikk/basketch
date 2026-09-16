// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import messages from '@/messages/en.json'
import type { ListItem } from '@/stores/list-store'

import { ItemNote } from './ItemNote'

/**
 * TP-10 / RCA #10: CLAUDE.md requires a member price to be labelled
 * "wherever the price is shown" — the list drawer shows the price again, so
 * the label must not disappear once an item is added to the list. Same for
 * the not-yet-started "from" date: it is snapshotted at add-time
 * (stores/list-store.ts) precisely so it can still be shown here.
 */

afterEach(cleanup)

const TODAY = '2026-09-15'

const item = (over: Partial<ListItem> = {}): ListItem => ({
  id: '1',
  store: 'coop',
  productName: 'Milk',
  category: 'fresh',
  salePrice: 1.5,
  imageUrl: null,
  sourceUrl: null,
  validFrom: '2026-09-01',
  priceBasis: { kind: 'everyone' },
  ...over,
})

const renderNote = (props: { item: ListItem; locale?: string; today?: string }) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ItemNote item={props.item} locale={props.locale ?? 'en'} today={props.today ?? TODAY} />
    </NextIntlClientProvider>,
  )

describe('ItemNote', () => {
  it('names the loyalty programme for a member-only item', () => {
    renderNote({
      item: item({ priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } }),
    })
    expect(screen.getByText('Lidl Plus members only')).toBeTruthy()
  })

  it('shows the "from" date for an item that has not started yet', () => {
    const { container } = renderNote({ item: item({ validFrom: '2026-09-17' }) })
    expect(container.textContent).toContain('From Thu 17.9.')
  })

  // Code review NEW-4: only the date goes inside <time>, not the whole
  // sentence — same rule as DealCard, so drawer and card agree.
  it('wraps ONLY the date in a machine-readable <time dateTime> (a11y)', () => {
    renderNote({ item: item({ validFrom: '2026-09-17' }) })
    const time = screen.getByText('Thu 17.9.').closest('time')
    expect(time?.getAttribute('dateTime')).toBe('2026-09-17')
    expect(time?.textContent).toBe('Thu 17.9.')
  })

  it('shows both facts together when both apply', () => {
    renderNote({
      item: item({
        validFrom: '2026-09-17',
        priceBasis: { kind: 'member-only', programme: 'Lidl Plus' },
      }),
    })
    const text = screen.getByText(/Lidl Plus/).textContent
    expect(text).toContain('Lidl Plus members only')
    expect(text).toContain('From')
  })

  it('renders nothing for an open, already-started item', () => {
    const { container } = renderNote({ item: item() })
    expect(container.textContent).toBe('')
  })

  it('a list saved before WP-W2 still opens — renders nothing rather than throwing', () => {
    // BLOCKER, code review of 9525601: ListDrawer is mounted in every
    // layout and calls this component for every item. A legacy item with no
    // priceBasis/validFrom key at all threw a TypeError, crashing the page
    // for every returning user with a non-empty list.
    const legacyItem = {
      id: 'legacy-1',
      store: 'coop' as const,
      productName: 'Milk',
      category: 'fresh' as const,
      salePrice: 1.5,
      imageUrl: null,
      sourceUrl: null,
      // No validFrom, no priceBasis.
    }
    expect(() => renderNote({ item: legacyItem })).not.toThrow()
    const { container } = renderNote({ item: legacyItem })
    expect(container.textContent).toBe('')
  })
})
