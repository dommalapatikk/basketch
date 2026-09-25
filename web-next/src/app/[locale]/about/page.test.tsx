// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { STORE_BRAND, STORE_DISPLAY_ORDER, type StoreKey } from '@/lib/store-tokens'
import de from '@/messages/de.json'
import en from '@/messages/en.json'

function sourceDescription(messages: typeof en | typeof de, store: StoreKey): string {
  const dataSources = messages.about.data_sources as Record<string, string>
  const description = dataSources[`source_${store}`]
  if (!description) {
    throw new Error(`about.data_sources.source_${store} is missing from the fixture messages`)
  }
  return description
}

// `setRequestLocale` (next-intl/server) throws "not supported in Client
// Components" outside a real `react-server` condition, which vitest never
// sets — same reason page.test.tsx and StaleBanner.test.tsx mock it out.
// AboutPage's own call to it is a side effect this test has no interest in.
vi.mock('next-intl/server', async () => {
  const actual = await vi.importActual<typeof import('next-intl/server')>('next-intl/server')
  return {
    ...actual,
    setRequestLocale: () => {},
  }
})

afterEach(cleanup)

/**
 * Design spec `docs/design/2026-09-25-data-source-copy-rework.md` §4, test 9:
 * "extend about/page.test.tsx … to assert all 7 store names render inside
 * the data-sources section — catches a future edit that silently drops a
 * retailer row." This file did not exist before this rework.
 */
describe.each([
  { locale: 'en' as const, messages: en },
  { locale: 'de' as const, messages: de },
])('About page data sources section ($locale)', ({ locale, messages }) => {
  it('renders all 7 retailers, each with its own source description, and no aktionis-only claim', async () => {
    const { default: AboutPage } = await import('./page')
    const element = await AboutPage({ params: Promise.resolve({ locale }) })

    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        {element}
      </NextIntlClientProvider>,
    )

    const dataSourcesHeading = screen.getByRole('heading', {
      name: messages.about.data_sources.heading,
    })
    const section = dataSourcesHeading.closest('section')
    expect(section).not.toBeNull()
    const sectionText = section?.textContent ?? ''

    // Regression for code review M-3/S-1 (425e43c): a mutation that dropped
    // the description (leaving only the bold store name) previously slipped
    // through, because the old assertion only checked for the store label.
    // This checks the full rendered row — name, separator, and its own
    // source description — so removing either half fails here.
    for (const store of STORE_DISPLAY_ORDER) {
      const label = STORE_BRAND[store].label
      const description = sourceDescription(messages, store)
      const expectedRow = `${label} — ${description}`
      expect(
        sectionText.includes(expectedRow),
        `expected the data-sources section to render "${expectedRow}"`,
      ).toBe(true)
    }

    // The stale, single-source claim must be gone from the rendered section.
    expect(sectionText).not.toMatch(/all deal data comes from aktionis/i)
    expect(sectionText).not.toMatch(/alle aktionsdaten stammen von aktionis/i)

    // The redundant flat "stores tracked" sentence is deleted — the
    // per-retailer list now does that job.
    expect(sectionText).not.toMatch(/stores tracked|erfasste läden/i)
  })
})
