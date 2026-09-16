// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import de from '@/messages/de.json'
import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import itMessages from '@/messages/it.json'

import { WorthPickingUp } from './WorthPickingUp'
import type { WorthPickingUpCandidate } from './WorthPickingUpCard'

/**
 * 452c538 shipped the cold-start CTA with copy that promises a curated
 * "starter pack" — "Pick a starter pack" / "Starter-Set wählen" / "Choisir un
 * pack de démarrage" / "Scegli un pack iniziale". No starter-pack feature or
 * route was ever built. 4b0b5a5 found the control rendering `href="#"`,
 * pointed it at /deals as a stopgap, and flagged the mismatch for PM review.
 *
 * Two separate PM decisions, both dated 2026-09-15, drive what this file
 * checks. Quoting only what the PM actually said; everything else below is
 * builder reasoning about how to satisfy it, not the PM's own words.
 *
 *   (a) On the CTA: "no one is using it, remove it." Read as: remove the
 *       control (`cold_start_cta`); do not build the starter-pack feature it
 *       promised, and do not reword the promise into something the link
 *       does deliver — the instruction was to remove, not to fix the copy.
 *   (b) Follow-up: remove the starter-pack sentence from
 *       `subtitle_cold_start` in all four locales, keep the first sentence.
 *       The CTA control's own text was already gone by (a), but the
 *       subtitle's second sentence ("Pick a starter pack to make this
 *       personal." / de/fr/it equivalents) made the same promise on its
 *       own and PM asked for it to go too.
 *
 * WorthPickingUpCard renders only <article> and <button> — never an <a> —
 * so any anchor or button found OUTSIDE an <article> in the cold-start
 * render is the section's own control, not the card's. That is asserted
 * structurally (element + position), not by text match, because a comeback
 * of the same control as a <button> rather than an <a> would still need to
 * fail this test — the codebase's own rule from 4b0b5a5 is that a control
 * that cannot navigate is a disabled <button>, not a dimmed link.
 */

afterEach(cleanup)

const candidate: WorthPickingUpCandidate = {
  conceptId: 'c1',
  conceptName: 'Alpine milk 1L',
  imageUrl: null,
  storeSlug: 'coop',
  storeLabel: 'Coop',
  dealPrice: 1.2,
  regularPrice: 1.5,
  discountPercent: 20,
  contextLine: 'You added these 6 weeks ago',
  priceBasis: { kind: 'everyone' },
}

const LOCALES = [
  { code: 'en', messages: en },
  { code: 'de', messages: de },
  { code: 'fr', messages: fr },
  { code: 'it', messages: itMessages },
] as const

// The sentence the PM asked kept, unchanged, per locale.
const KEPT_FIRST_SENTENCE: Record<(typeof LOCALES)[number]['code'], string> = {
  en: 'Strong deals across the basics.',
  de: 'Gute Angebote rund um Grundnahrungsmittel.',
  fr: 'Bons prix sur les essentiels.',
  it: 'Buoni prezzi sui beni essenziali.',
}

// The sentence the PM asked removed, per locale — the starter-pack promise
// the subtitle made independently of the CTA that already went away.
const REMOVED_SECOND_SENTENCE: Record<(typeof LOCALES)[number]['code'], string> = {
  en: 'Pick a starter pack to make this personal.',
  de: 'Wähle ein Starter-Set, um es persönlich zu machen.',
  fr: 'Choisis un pack de démarrage pour personnaliser.',
  it: 'Scegli un pack iniziale per personalizzare.',
}

// The removed CTA's own label, per locale — checked against the whole
// render, independent of the locale under test, so a hardcoded leftover in
// the wrong language would still be caught.
const FORMER_CTA_LABEL: Record<(typeof LOCALES)[number]['code'], string> = {
  en: 'Pick a starter pack',
  de: 'Starter-Set wählen',
  fr: 'Choisir un pack de démarrage',
  it: 'Scegli un pack iniziale',
}

function renderColdStart(code: string, messages: Record<string, unknown>) {
  return render(
    <NextIntlClientProvider locale={code} messages={messages}>
      <WorthPickingUp
        mode="cold-start"
        candidates={[candidate]}
        onAdd={() => {}}
        onNotNow={() => {}}
        onDontSuggestAgain={() => {}}
      />
    </NextIntlClientProvider>,
  )
}

describe('the cold-start "worth picking up" section', () => {
  it.each(LOCALES)('does not promise a starter pack that does not exist ($code)', ({
    code,
    messages,
  }) => {
    const { container } = renderColdStart(code, messages)

    // Positive check first: without it, this test would pass vacuously if
    // cold-start rendered nothing at all instead of the section minus its CTA.
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()

    // WorthPickingUpCard's own interactive elements (Add / Not now / Don't
    // suggest again, and the overflow menu) all live inside its <article>
    // root — confirmed here rather than assumed. Anything interactive
    // OUTSIDE an <article> is the section's own control. With a single
    // candidate there is no "Show all" button either (remaining < 0), so
    // this set should be empty regardless of whether the former CTA comes
    // back as an <a> or, per 4b0b5a5's own rule, a disabled <button>.
    expect(container.querySelectorAll('article')).toHaveLength(1)
    const controlsOutsideCard = [...container.querySelectorAll('a, button')].filter(
      (el) => !el.closest('article'),
    )
    expect(controlsOutsideCard).toHaveLength(0)

    // Belt and braces: none of the four former CTA labels appear anywhere in
    // the render, in any language, as any element type.
    for (const label of Object.values(FORMER_CTA_LABEL)) {
      expect(container.textContent).not.toContain(label)
    }
  })

  it('leaves no cold_start_cta key behind in any locale bundle', () => {
    for (const { messages } of LOCALES) {
      const namespace = messages.worth_picking_up as Record<string, unknown>
      expect(namespace).not.toHaveProperty('cold_start_cta')
    }
  })

  it.each(LOCALES)('the cold-start subtitle no longer promises a starter pack ($code)', ({
    code,
    messages,
  }) => {
    const { container } = renderColdStart(code, messages)
    const subtitle = container.querySelector('header p')

    expect(subtitle?.textContent).not.toContain(REMOVED_SECOND_SENTENCE[code])
    // Exact equality, not `.toContain` — catches a stray leading/trailing
    // space or a leftover second-sentence fragment the same way a substring
    // check would not.
    expect(subtitle?.textContent).toBe(KEPT_FIRST_SENTENCE[code])
  })
})
