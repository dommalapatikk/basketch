// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import { createPriceBasis } from '@/lib/domain/price-basis'
import messages from '@/messages/en.json'

import { type WorthPickingUpCandidate, WorthPickingUpCard } from './WorthPickingUpCard'

/**
 * Architect audit, 2026-09-16: neither `worth-picking-up.ts` read path
 * (personal MV, cold-start) ever selected `price_basis`/`loyalty_programme`,
 * so a Lidl Plus (or any member-only) price could render on the home page
 * with no label at all — the same CLAUDE.md rule
 * (`components/deals/DealCard.tsx`'s own member-price tests) one surface
 * over. QA confirmed the live cold-start set is 100% Coop open-price today,
 * so this was not visible yet — it surfaces the first week a member-only
 * deal qualifies (>= 30% discount, in effect).
 */

afterEach(cleanup)

const candidate = (over: Partial<WorthPickingUpCandidate> = {}): WorthPickingUpCandidate => ({
  conceptId: 'c1',
  conceptName: 'Alpine milk 1L',
  imageUrl: null,
  storeSlug: 'lidl',
  storeLabel: 'LIDL',
  dealPrice: 1.2,
  regularPrice: 1.5,
  discountPercent: 20,
  contextLine: 'You added these 6 weeks ago',
  priceBasis: { kind: 'everyone' },
  ...over,
})

const renderCard = (c: WorthPickingUpCandidate) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorthPickingUpCard
        candidate={c}
        onAdd={() => {}}
        onNotNow={() => {}}
        onDontSuggestAgain={() => {}}
      />
    </NextIntlClientProvider>,
  )

describe('the home page never shows a member price without naming the programme', () => {
  it('names the programme for a member-only candidate', () => {
    renderCard(candidate({ priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } }))
    expect(screen.getByText('Lidl Plus members only')).toBeTruthy()
  })

  it('says nothing about membership for an open price', () => {
    renderCard(candidate({ priceBasis: { kind: 'everyone' } }))
    expect(screen.queryByText(/members only/i)).toBeNull()
  })

  it('carries the label as text, not as a colour (WCAG 2.1 AA)', () => {
    renderCard(candidate({ priceBasis: { kind: 'member-only', programme: 'Supercard' } }))
    const label = screen.getByText('Supercard members only')
    expect(label.textContent?.trim()).toBe('Supercard members only')
  })

  it('cannot be built without a programme name in the first place', () => {
    // Mirrors DealCard.test.tsx's own pinning test: the component takes a
    // prepared PriceBasis, so the guarantee that a member price always names
    // its programme lives upstream, at construction — the worth-picking-up
    // read path's toPriceBasisOrNull refuses the row before this component
    // ever sees it (server/data/worth-picking-up.ts).
    const basis = createPriceBasis('member-only', null)
    expect(basis.ok).toBe(false)
  })
})
