import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isOk, unwrap } from '../../../collection/domain/result'
import { createClassification, createConfidence } from '../../domain/classification'
import { CURRENT_VERSIONS, cacheKeyFor, normaliseForCache } from '../../domain/classification-cache'
import { createSupabaseClassificationCache } from './supabase-classification-cache'

const row = (over: Record<string, unknown> = {}) => ({
  cache_key: 'emmi milch|t3|p1|s1',
  normalised_name: 'emmi milch',
  category: 'dairy',
  sub_category: 'dairy',
  attributes: { fatPercent: 3.5 },
  confidence: 0.95,
  is_uncertain: false,
  model: 'gemini-3.5-flash-lite',
  tier: 1,
  taxonomy_version: 3,
  prompt_version: 1,
  schema_version: 1,
  run_id: 'run-1',
  ...over,
})

/** Minimal Supabase stub — records calls, returns whatever the test supplies. */
function stubClient(behaviour: {
  selectResult?: { data: unknown[] | null; error: { message: string } | null }
  upsertResult?: { error: { message: string } | null }
  throwOn?: 'select' | 'upsert'
}) {
  const calls: { upserted: unknown[][] } = { upserted: [] }
  const client = {
    from() {
      return {
        select() {
          return {
            in() {
              if (behaviour.throwOn === 'select') throw new Error('connection reset')
              return Promise.resolve(behaviour.selectResult ?? { data: [], error: null })
            },
          }
        },
        upsert(rows: unknown[]) {
          if (behaviour.throwOn === 'upsert') throw new Error('connection reset')
          calls.upserted.push(rows)
          return Promise.resolve(behaviour.upsertResult ?? { error: null })
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const make = (client: SupabaseClient, onDegraded?: (op: string, d: string) => void) =>
  createSupabaseClassificationCache({ client, versions: CURRENT_VERSIONS, onDegraded })

describe('the cache key', () => {
  it('ignores case and whitespace — one product, one entry, one model call', () => {
    expect(normaliseForCache('EMMI  CAFFÈ   LATTE')).toBe(normaliseForCache('Emmi Caffè Latte'))
  })

  it('strips non-breaking spaces — Denner ships U+00A0 inside its text', () => {
    expect(normaliseForCache('ca. 900 g')).toBe('ca. 900 g')
  })

  it('puts the versions in the key so a bump invalidates everything', () => {
    const a = cacheKeyFor('Emmi Milch', CURRENT_VERSIONS)
    const b = cacheKeyFor('Emmi Milch', { ...CURRENT_VERSIONS, promptVersion: 2 })
    expect(a).not.toBe(b)
  })

  it('is retailer-independent — Coca-Cola is Drinks wherever it is sold', () => {
    expect(cacheKeyFor('Coca-Cola Classic')).toBe(cacheKeyFor('Coca-Cola Classic'))
  })
})

describe('lookup', () => {
  it('returns hits mapped into the domain', async () => {
    const { client } = stubClient({ selectResult: { data: [row()], error: null } })
    const r = await make(client).lookup(['emmi milch|t3|p1|s1'])
    expect(isOk(r) && r.value).toHaveLength(1)
    if (isOk(r)) {
      expect(r.value[0]?.classification.category).toBe('dairy')
      expect(r.value[0]?.attributes).toEqual({ fatPercent: 3.5 })
    }
  })

  it('does not query at all for an empty key list', async () => {
    const { client } = stubClient({ throwOn: 'select' })
    const r = await make(client).lookup([])
    expect(isOk(r) && r.value).toEqual([])
  })
})

describe('a cache failure degrades to a MISS, never to a run failure', () => {
  it('returns no hits when the query errors', async () => {
    // Losing the memo costs cents. Losing the run costs a week of data.
    const notes: string[] = []
    const { client } = stubClient({ selectResult: { data: null, error: { message: 'relation does not exist' } } })
    const r = await make(client, (op, d) => notes.push(`${op}: ${d}`)).lookup(['k'])
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value).toEqual([])
    expect(notes[0]).toContain('relation does not exist')
  })

  it('survives the client throwing outright', async () => {
    const { client } = stubClient({ throwOn: 'select' })
    const r = await make(client).lookup(['k'])
    expect(isOk(r) && r.value).toEqual([])
  })

  it('reports a failed write instead of losing the run', async () => {
    const notes: string[] = []
    const { client } = stubClient({ upsertResult: { error: { message: 'permission denied' } } })
    const cls = unwrap(createClassification({ category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1, model: 'm' }))
    const r = await make(client, (op, d) => notes.push(`${op}: ${d}`)).save([
      { cacheKey: 'k', normalisedName: 'n', classification: cls, attributes: {}, runId: 'r' },
    ])
    expect(isOk(r) && r.value).toBe(0)
    expect(notes[0]).toContain('permission denied')
  })
})

describe('rows are re-validated on READ', () => {
  it('ignores a cached row whose category no longer exists', async () => {
    // A row can go stale without being touched: remove a sub-category from the
    // taxonomy and every cached row pointing at it is silently wrong.
    const notes: string[] = []
    const { client } = stubClient({ selectResult: { data: [row({ category: 'tinned-goods' })], error: null } })
    const r = await make(client, (_op, d) => notes.push(d)).lookup(['k'])
    expect(isOk(r) && r.value).toEqual([])
    expect(notes.join(' ')).toContain('no longer satisfy the taxonomy')
  })

  it('ignores a row whose sub-category moved to another category', async () => {
    const { client } = stubClient({ selectResult: { data: [row({ sub_category: 'chocolate' })], error: null } })
    const r = await make(client).lookup(['k'])
    expect(isOk(r) && r.value).toEqual([])
  })

  it('ignores a row with an out-of-range confidence', async () => {
    const { client } = stubClient({ selectResult: { data: [row({ confidence: 1.7 })], error: null } })
    const r = await make(client).lookup(['k'])
    expect(isOk(r) && r.value).toEqual([])
  })
})

describe('save', () => {
  it('writes the traceability fields, not just the answer', async () => {
    const { client, calls } = stubClient({})
    const cls = unwrap(createClassification({ category: 'bakery', subCategory: 'pastry', confidence: unwrap(createConfidence(0.8)), tier: 2, model: 'gemini-3.5-flash-lite' }))
    await make(client).save([{ cacheKey: 'k', normalisedName: 'donut', classification: cls, attributes: { salted: false }, runId: 'run-9' }])

    const written = calls.upserted[0]?.[0] as Record<string, unknown>
    expect(written.model).toBe('gemini-3.5-flash-lite')
    expect(written.tier).toBe(2)
    expect(written.run_id).toBe('run-9')
    expect(written.prompt_version).toBe(CURRENT_VERSIONS.promptVersion)
  })

  it('chunks large writes rather than sending one enormous statement', async () => {
    const { client, calls } = stubClient({})
    const cls = unwrap(createClassification({ category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1, model: 'm' }))
    const entries = Array.from({ length: 250 }, (_, i) => ({
      cacheKey: `k${i}`, normalisedName: `n${i}`, classification: cls, attributes: {}, runId: null,
    }))
    const r = await make(client).save(entries)
    expect(isOk(r) && r.value).toBe(250)
    expect(calls.upserted.length).toBe(3)
  })

  it('writes nothing for an empty list', async () => {
    const { client, calls } = stubClient({})
    expect(isOk(await make(client).save([])) && calls.upserted.length).toBe(0)
  })
})
