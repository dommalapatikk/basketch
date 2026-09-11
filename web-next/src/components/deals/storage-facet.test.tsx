// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FILTERS, type DealsFilters } from '@/lib/filters'
import messages from '@/messages/en.json'
import { STORAGE_ORDER } from '@/server/data/filter-deals'

import { FilterRail } from './FilterRail'
import { FilterSheet } from './FilterSheet'

/**
 * The storage facet, on the surface the user actually touches.
 *
 * ADR-001 argues at length that storage is a facet rather than a category, and
 * the migration comment calls the Frozen browse tile "a saved filter over this
 * column". Both of those are claims about the UI, so they are checked here.
 */

afterEach(cleanup)

const STORAGES = STORAGE_ORDER.map((key) => ({ key, count: key === 'frozen' ? 88 : 12 }))

const renderRail = (over: Partial<DealsFilters> = {}, onChange = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FilterRail
        filters={{ ...DEFAULT_FILTERS, ...over }}
        onChange={onChange}
        typeCounts={{ all: 100, fresh: 40, longlife: 40, household: 20 }}
        storeCounts={{ coop: 10 } as never}
        categories={[]}
        subCategories={[]}
        storages={STORAGES}
        locale="en"
      />
    </NextIntlClientProvider>,
  )
  return onChange
}

describe('the storage facet in the rail', () => {
  it('offers every storage state the database allows', () => {
    renderRail()
    for (const label of ['Frozen', 'Chilled', 'Fresh', 'Ambient']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('leads with Frozen — the one people come looking for', () => {
    renderRail()
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    const frozen = buttons.findIndex((t) => t.includes('Frozen'))
    const ambient = buttons.findIndex((t) => t.includes('Ambient'))
    expect(frozen).toBeGreaterThan(-1)
    expect(frozen).toBeLessThan(ambient)
  })

  it('is always available, without needing a Type picked first', () => {
    // Unlike Category and Sub-category, which are progressive. "Where is the
    // frozen stuff" does not depend on having chosen a Type.
    renderRail({ type: 'all', category: null })
    expect(screen.getAllByText('Frozen').length).toBeGreaterThan(0)
  })

  it('selects a storage state without clearing the category filters', () => {
    // Storage is orthogonal to them (ADR-001) — "frozen vegetables" has to
    // stay reachable, so selecting one must not reset the other.
    const onChange = renderRail({ type: 'fresh', category: 'vegetables' })
    fireEvent.click(screen.getByRole('button', { name: /Frozen/ }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ storage: 'frozen', type: 'fresh', category: 'vegetables' }),
    )
  })

  it('deselects when the active state is clicked again', () => {
    const onChange = renderRail({ storage: 'frozen' })
    fireEvent.click(screen.getByRole('button', { name: /Frozen/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ storage: null }))
  })

  it('reports selection state to assistive technology, not only by colour', () => {
    renderRail({ storage: 'frozen' })
    const frozen = screen.getByRole('button', { name: /Frozen/ })
    expect(frozen.getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps an empty state visible rather than hiding it', () => {
    // "Nothing frozen is on offer this week" is information. A vanished row
    // just looks like a broken filter.
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FilterRail
          filters={DEFAULT_FILTERS}
          onChange={vi.fn()}
          typeCounts={{ all: 0, fresh: 0, longlife: 0, household: 0 }}
          storeCounts={{} as never}
          categories={[]}
          subCategories={[]}
          storages={STORAGE_ORDER.map((key) => ({ key, count: 0 }))}
          locale="en"
        />
      </NextIntlClientProvider>,
    )
    const frozen = screen.getByRole('button', { name: /Frozen/ })
    expect(frozen.hasAttribute('disabled')).toBe(false)
  })

  it('dims an empty row with ink, never with opacity', () => {
    // Regression: `opacity-50` on --color-ink-2 renders as #8b8b8c on #f6f6f3,
    // which is 3.14:1 — below the 4.5:1 WCAG 2.1 AA floor. CI's axe sweep
    // failed on /de/deals because of it. --color-ink-3 is 4.87:1.
    //
    // These buttons are deliberately NOT disabled, so unlike the store chips
    // they are not exempt from the contrast check.
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FilterRail
          filters={DEFAULT_FILTERS}
          onChange={vi.fn()}
          typeCounts={{ all: 0, fresh: 0, longlife: 0, household: 0 }}
          storeCounts={{} as never}
          categories={[]}
          subCategories={[]}
          storages={STORAGE_ORDER.map((key) => ({ key, count: 0 }))}
          locale="en"
        />
      </NextIntlClientProvider>,
    )
    const frozen = screen.getByRole('button', { name: /Frozen/ })
    expect(frozen.className).not.toMatch(/\bopacity-/)
    expect(frozen.className).toContain('--color-ink-3')
  })

  it('clears storage along with everything else on reset', () => {
    const onChange = renderRail({ storage: 'frozen' })
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ storage: null }))
  })
})

describe('mobile parity', () => {
  // The rail is `hidden lg:block`. If the sheet does not carry this filter,
  // Frozen is desktop-only on a mobile-first site — which is exactly what the
  // first version of this feature shipped as.
  const openSheet = (over: Partial<DealsFilters> = {}) => {
    const onChange = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FilterSheet
          filters={{ ...DEFAULT_FILTERS, ...over }}
          onChange={onChange}
          facets={[]}
          matchedCount={42}
          locale="en"
        />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    return onChange
  }

  it('offers every storage state on the mobile sheet too', () => {
    openSheet()
    for (const label of ['Frozen', 'Chilled', 'Ambient']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('lets a mobile visitor actually reach Frozen', () => {
    openSheet()
    const frozen = screen.getAllByRole('button', { name: /Frozen/ })[0] as HTMLElement
    fireEvent.click(frozen)
    expect(frozen.getAttribute('aria-pressed')).toBe('true')
  })

  it('gives the control a 44px touch target', () => {
    // WCAG 2.1 AA and CLAUDE.md both make this a build requirement rather than
    // a QA finding.
    openSheet()
    const frozen = screen.getAllByRole('button', { name: /Frozen/ })[0] as HTMLElement
    expect(frozen.className).toContain('min-h-11')
  })
})
