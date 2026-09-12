import { describe, expect, it } from 'vitest'

import type { ListItem } from '@/stores/list-store'
import { createShareTarget } from './share-target'

/**
 * THE DEFECT THIS MODULE EXISTS FOR, found live 2026-09-12.
 *
 * Three share controls — the deals BottomBar, and the WhatsApp and Email
 * buttons in ListDrawer — rendered as `<a href="#">` and assigned the real
 * destination inside their own click handler:
 *
 *     function onShareClick(e) { e.currentTarget.href = buildWhatsAppHref(text) }
 *
 * That works for exactly one interaction: a plain left click. It fails for
 * every other way a browser follows a link, because none of them fire onClick:
 *
 *   - middle click / Cmd+click / Ctrl+click  → opens `#`
 *   - context menu → "Open link in new tab"  → opens `#`
 *   - context menu → "Copy link address"     → copies `#`
 *
 * `#` resolves to the current basketch page, so the user asks for WhatsApp and
 * gets basketch back. That is the same symptom reported for the Migros and
 * ALDI product links, from the same root cause: an anchor whose href does not
 * name where it goes.
 *
 * The fix is not "add a guard to the handler" — it is that the href must be
 * CORRECT AT REST, before any interaction. So the destination has to be
 * derivable during render, which means this decision is a pure function of
 * (origin, locale, items) and belongs in the domain, not in three components.
 *
 * The invariant, enforced by the return type rather than by a comment:
 *
 *     a share control is an ANCHOR only when a real destination exists;
 *     otherwise it is a DISABLED BUTTON, never an anchor.
 *
 * `unavailable` is not an error case. During the server prerender pass there is
 * no `window.location.origin`, and an empty list has nothing to share. Both are
 * ordinary, and in both the honest rendering is a button that does not pretend
 * to navigate.
 */

const item = (id: string, salePrice: number): ListItem => ({
  id,
  store: 'coop',
  productName: `product ${id}`,
  category: 'fresh',
  salePrice,
  imageUrl: null,
  sourceUrl: null,
})

const ORIGIN = 'https://basketch.vercel.app'

describe('createShareTarget', () => {
  it('is unavailable when the list is empty', () => {
    const target = createShareTarget({ origin: ORIGIN, locale: 'de', items: [] })
    expect(target.kind).toBe('unavailable')
    expect(target).toMatchObject({ reason: 'empty-list' })
  })

  it('is unavailable during the server prerender, when origin is not known', () => {
    // This is the case that forced the lazy-href trick in the first place:
    // `window.location.origin` is undefined server-side and `new URL('')`
    // throws. Modelling it as a state removes the need for the trick.
    const target = createShareTarget({ origin: '', locale: 'de', items: [item('a', 2)] })
    expect(target.kind).toBe('unavailable')
    expect(target).toMatchObject({ reason: 'origin-unknown' })
  })

  it('exposes real destinations the moment both are known', () => {
    const target = createShareTarget({ origin: ORIGIN, locale: 'de', items: [item('a', 2.5)] })
    if (target.kind !== 'ready') throw new Error('expected ready')

    expect(target.whatsappHref).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(target.mailtoHref).toMatch(/^mailto:\?subject=/)
    expect(target.shareUrl).toContain(ORIGIN)
  })

  it('NEVER yields "#" as a destination', () => {
    // The regression itself. If this ever passes a "#" through, the middle
    // click bug is back.
    for (const items of [[], [item('a', 1)]]) {
      for (const origin of ['', ORIGIN]) {
        const target = createShareTarget({ origin, locale: 'de', items })
        if (target.kind === 'ready') {
          expect(target.whatsappHref).not.toBe('#')
          expect(target.mailtoHref).not.toBe('#')
          expect(target.shareUrl).not.toBe('#')
        }
      }
    }
  })

  it('carries the list contents into the WhatsApp text, not just the link', () => {
    const target = createShareTarget({
      origin: ORIGIN,
      locale: 'de',
      items: [item('a', 2), item('b', 3)],
    })
    if (target.kind !== 'ready') throw new Error('expected ready')

    const text = decodeURIComponent(target.whatsappHref.split('text=')[1] ?? '')
    expect(text).toContain('basketch')
    expect(text).toContain('5.00') // 2 + 3, summed per store
  })

  it('round-trips the item ids so the recipient opens the same list', () => {
    const target = createShareTarget({
      origin: ORIGIN,
      locale: 'de',
      items: [item('a', 1), item('b', 1)],
    })
    if (target.kind !== 'ready') throw new Error('expected ready')
    expect(new URL(target.shareUrl).searchParams.get('items')).toBe('a,b')
  })

  it('localises the path for non-default locales', () => {
    const de = createShareTarget({ origin: ORIGIN, locale: 'de', items: [item('a', 1)] })
    const fr = createShareTarget({ origin: ORIGIN, locale: 'fr', items: [item('a', 1)] })
    if (de.kind !== 'ready' || fr.kind !== 'ready') throw new Error('expected ready')

    expect(new URL(de.shareUrl).pathname).toBe('/list')
    expect(new URL(fr.shareUrl).pathname).toBe('/fr/list')
  })

  it('treats a whitespace-only origin as unknown rather than building a broken URL', () => {
    const target = createShareTarget({ origin: '   ', locale: 'de', items: [item('a', 1)] })
    expect(target.kind).toBe('unavailable')
  })
})
