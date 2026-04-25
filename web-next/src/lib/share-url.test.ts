import { describe, expect, it } from 'vitest'

import type { ListItem } from '@/stores/list-store'

import { buildShareUrl, parseListIds, serializeListIds } from './share-url'

const I = (id: string): Pick<ListItem, 'id'> => ({ id })

describe('share-url roundtrip', () => {
  it('serialize → parse returns the original id list', () => {
    const ids = ['abc-123', 'def-456', 'ghi-789']
    const round = parseListIds(serializeListIds(ids.map((id) => I(id))))
    expect(round).toEqual(ids)
  })

  it('survives URL-special chars', () => {
    const ids = ['migros/123', 'coop?weird=true', 'lidl,trick']
    const round = parseListIds(serializeListIds(ids.map((id) => I(id))))
    expect(round).toEqual(ids)
  })

  it('empty list serialises to empty string and parses to []', () => {
    expect(serializeListIds([])).toBe('')
    expect(parseListIds('')).toEqual([])
    expect(parseListIds(null)).toEqual([])
  })

  it('buildShareUrl uses /list for default locale, /<locale>/list otherwise', () => {
    const items = [I('a'), I('b')]
    const de = buildShareUrl({ origin: 'https://basketch.app', locale: 'de', items })
    const en = buildShareUrl({ origin: 'https://basketch.app', locale: 'en', items })
    expect(de).toBe('https://basketch.app/list?items=a%2Cb')
    expect(en).toBe('https://basketch.app/en/list?items=a%2Cb')
  })

  it('rehydrate parity: a recipient parsing the share URL gets the same id set the sender encoded', () => {
    // Spec §11 M6 acceptance: "Share URL rehydrate test."
    const senderIds = ['fresh-1', 'longlife-2', 'household-3']
    const url = buildShareUrl({
      origin: 'https://basketch.app',
      locale: 'de',
      items: senderIds.map(I),
    })
    const recipient = new URL(url)
    const incoming = parseListIds(recipient.searchParams.get('items'))
    expect(incoming).toEqual(senderIds)
  })
})
