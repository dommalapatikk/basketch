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
    renderNote({ item: item({ validFrom: '2026-09-17' }) })
    expect(screen.getByText(/^From /)).toBeTruthy()
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
})
