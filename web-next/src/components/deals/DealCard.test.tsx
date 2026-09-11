// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import { createCropRegion } from '@/lib/domain/crop-region'
import { createPriceBasis } from '@/lib/domain/price-basis'
import { unwrap } from '@/lib/domain/result'

import messages from '@/messages/en.json'

import { DealCard, type DealCardProps } from './DealCard'

/**
 * Rendering rules that are binding, tested where they are actually decided.
 *
 * The unit tests underneath this cover the arithmetic and the domain. What they
 * cannot see is whether the rule reaches the screen: a member price is only
 * labelled if the label is in the DOM, and a flyer crop is only lawful if the
 * element fetching it is a plain <img> pointing at the retailer.
 */

afterEach(cleanup)

const renderCard = (over: Partial<DealCardProps> = {}) => {
  const props: DealCardProps = {
    variant: 'primary',
    id: 'd1',
    category: 'fresh',
    store: 'coop',
    productName: 'Emmi Vollmilch 1L',
    current: 1.45,
    previous: 1.95,
    savingsPct: 26,
    href: 'https://coop.ch/x',
    ...over,
  }
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DealCard {...props} />
    </NextIntlClientProvider>,
  )
}

describe('the member price label (Art. 3(1)(e) UWG)', () => {
  // LIDL publishes its Lidl Plus price with no flag at all. An unlabelled
  // member price is the exposure the whole loyalty check exists to prevent, so
  // this must be true on every surface that shows a price.
  it('names the programme on the primary card', () => {
    renderCard({ memberPriceLabel: 'Lidl Plus members only' })
    expect(screen.getByText('Lidl Plus members only')).toBeTruthy()
  })

  it('names the programme on the compact card too', () => {
    // The compact card is 280px wide and truncates. Narrow is not an exemption.
    renderCard({ variant: 'compact', memberPriceLabel: 'Lidl Plus members only' })
    expect(screen.getByText('Lidl Plus members only')).toBeTruthy()
  })

  it('says nothing about membership for an open price', () => {
    renderCard({ memberPriceLabel: null })
    expect(screen.queryByText(/members only/i)).toBeNull()
  })

  it('carries the label as text, not as a colour', () => {
    // WCAG 2.1 AA: no colour-only information. "The yellow one is the Lidl
    // price" is exactly that, and it is also a legal label.
    renderCard({ memberPriceLabel: 'Lidl Plus members only' })
    const label = screen.getByText('Lidl Plus members only')
    expect(label.textContent?.trim()).toBe('Lidl Plus members only')
  })

  it('cannot be built without a programme name in the first place', () => {
    // The component takes a prepared string, so the guarantee lives upstream.
    // This pins the two together: there is no path that produces a member
    // price whose programme is unknown.
    const basis = createPriceBasis('member-only', null)
    expect(basis.ok).toBe(false)
  })
})

describe('the flyer crop (Art. 2 Abs. 3bis URG)', () => {
  const crop = unwrap(
    createCropRegion({
      pageImageUrl: 'https://image.isu.pub/rev/jpg/page_5.jpg',
      x: 0.25,
      y: 0.5,
      width: 0.2,
      height: 0.1,
    }),
  )

  it('fetches the page from the retailer, not from basketch', () => {
    const { container } = renderCard({ crop, imageUrl: null })
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://image.isu.pub/rev/jpg/page_5.jpg')
  })

  it('uses a plain img, never an optimised next/image URL', () => {
    // next/image rewrites src to /_next/image?url=... — a copy of the
    // photograph re-encoded and served from our own domain, which is the one
    // thing the URG constraint forbids. This assertion is the tripwire.
    const { container } = renderCard({ crop, imageUrl: null })
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).not.toContain('/_next/image')
    expect(img?.getAttribute('srcset')).toBeNull()
  })

  it('positions the crop with the geometry the domain allows', () => {
    const { container } = renderCard({ crop, imageUrl: null })
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.style.width).toBe('500%')
    expect(img.style.transform).toBe('translate(-25%, -55%)')
    // Without the clip, a crop wider than the square slot shows the
    // neighbouring products above and below it.
    expect(img.style.clipPath).toBe('inset(50% 55% 40% 25%)')
  })

  it('renders no image at all rather than an empty frame when there is neither', () => {
    const { container } = renderCard({ crop: null, imageUrl: null })
    expect(container.querySelector('img')).toBeNull()
  })

  it('leaves the product photo path alone when the retailer gave us one', () => {
    const { container } = renderCard({ imageUrl: 'https://image.coop.ch/a.jpg', crop: null })
    expect(container.querySelector('img')).toBeTruthy()
  })
})

describe('an uncertain category (D3)', () => {
  it('still shows the deal and its price', () => {
    renderCard({ isUncertain: true, unverifiedLabel: 'Category unverified' })
    expect(screen.getByText('Emmi Vollmilch 1L')).toBeTruthy()
    expect(screen.getByText('1.45')).toBeTruthy()
  })

  it('marks the category as unverified rather than presenting it as settled', () => {
    renderCard({ isUncertain: true, unverifiedLabel: 'Category unverified' })
    expect(screen.getByText('Category unverified')).toBeTruthy()
  })

  it('says nothing when the classifier was confident', () => {
    renderCard({ isUncertain: false, unverifiedLabel: 'Category unverified' })
    expect(screen.queryByText('Category unverified')).toBeNull()
  })

  it('keeps the mark on the compact card, where it is abbreviated', () => {
    const { container } = renderCard({
      variant: 'compact',
      isUncertain: true,
      unverifiedLabel: 'Category unverified',
    })
    // Abbreviated for width, but the full wording stays reachable rather than
    // the mark being dropped.
    expect(container.querySelector('[title="Category unverified"]')).toBeTruthy()
  })
})

describe('the only-at-store claim', () => {
  it('shows the badge only alongside the note that states its scope', () => {
    renderCard({
      onlyStoreBadge: 'Only at Coop',
      onlyStoreNote: 'No other store we track has a Dairy deal this week.',
    })
    expect(screen.getByText('Only at Coop')).toBeTruthy()
    expect(screen.getByText(/No other store we track has a Dairy deal/)).toBeTruthy()
  })

  it('withholds the badge when there is no note to scope it', () => {
    // The badge alone reads as "this product is only at Coop", which is more
    // than the data supports — products are resolved per store, so there is no
    // cross-store identity behind that claim.
    renderCard({ onlyStoreBadge: 'Only at Coop', onlyStoreNote: null })
    expect(screen.queryByText('Only at Coop')).toBeNull()
  })

  it('shows neither for a sub-category several stores compete in', () => {
    renderCard({ onlyStoreBadge: null, onlyStoreNote: null })
    expect(screen.queryByText(/Only at/)).toBeNull()
  })
})

describe('the attribute line', () => {
  it('shows the facts the retailer stated', () => {
    renderCard({
      attributes: [
        { id: 'organic', label: 'Organic', value: 'Organic' },
        { id: 'fatPercent', label: 'Fat', value: '3.5%' },
      ],
    })
    expect(screen.getByText('Organic')).toBeTruthy()
    expect(screen.getByText('3.5%')).toBeTruthy()
  })

  it('labels a value that means nothing on its own', () => {
    renderCard({ attributes: [{ id: 'fatPercent', label: 'Fat', value: '3.5%' }] })
    const item = screen.getByText('3.5%').closest('li') as HTMLElement
    expect(within(item).getByText('Fat')).toBeTruthy()
  })

  it('renders no line at all when nothing was stated', () => {
    const { container } = renderCard({ attributes: [] })
    expect(container.querySelector('ul')).toBeNull()
  })
})

describe('accessibility basics', () => {
  it('names the card by its product title', () => {
    const { container } = renderCard()
    const article = container.querySelector('article') as HTMLElement
    const labelledBy = article.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('Emmi Vollmilch 1L')
  })

  it('uses an article element rather than a div', () => {
    const { container } = renderCard()
    expect(container.querySelector('article')).toBeTruthy()
  })

  it('marks decorative imagery as decorative', () => {
    // The product name is already the accessible name for the card; alt text
    // repeating it would make a screen reader say it twice.
    const crop = unwrap(
      createCropRegion({
        pageImageUrl: 'https://image.isu.pub/rev/jpg/page_5.jpg',
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      }),
    )
    const { container } = renderCard({ crop, imageUrl: null })
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  it('opens retailer links safely', () => {
    renderCard()
    const link = screen.getByText('Emmi Vollmilch 1L') as HTMLAnchorElement
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
