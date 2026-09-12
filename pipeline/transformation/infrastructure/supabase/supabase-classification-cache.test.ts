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

describe('one statement, one row per cache key', () => {
  /**
   * THE DEFECT, verified against the live table 2026-09-12. Postgres rejects
   * the WHOLE statement with SQLSTATE 21000 when it carries a conflict key
   * twice, so a single duplicate pair discarded ~100 classifications per chunk.
   * `save` then took its error branch, returned 0, and nothing surfaced why.
   */
  const entry = (name: string, runId = 'run-1') => ({
    cacheKey: cacheKeyFor(name),
    normalisedName: normaliseForCache(name),
    classification: unwrap(
      createClassification({
        category: 'dairy',
        subCategory: 'dairy',
        confidence: unwrap(createConfidence(0.9)),
        tier: 1,
        model: 'gemini-3.5-flash-lite',
      }),
    ),
    attributes: {},
    runId,
  })

  it('never sends the same cache_key twice — Postgres would reject the whole batch', async () => {
    const { client, calls } = stubClient({})
    const cache = createSupabaseClassificationCache({ client, versions: CURRENT_VERSIONS })
    const saved = await cache.save([entry('Emmi Vollmilch 1L'), entry('Emmi Vollmilch 1L')])

    const keys = (calls.upserted[0] as { cache_key: string }[]).map((r) => r.cache_key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(isOk(saved) ? saved.value : -1).toBe(1)
  })

  it('the same product from two retailers is one row — the key is retailer-independent by design', async () => {
    // This is the production condition, not a corner case: seven retailers,
    // and the key deliberately omits the retailer so a product classified once
    // is classified for everyone.
    const { client, calls } = stubClient({})
    const cache = createSupabaseClassificationCache({ client, versions: CURRENT_VERSIONS })
    const saved = await cache.save([
      entry('Coca-Cola Classic 6x50cl', 'coop-run'),
      entry('Coca-Cola Classic 6x50cl', 'denner-run'),
    ])
    expect(calls.upserted[0]).toHaveLength(1)
    expect(isOk(saved) ? saved.value : -1).toBe(1)
  })

  it('merges BEFORE chunking, so a duplicate never splits a statement', async () => {
    // Deduping per chunk would stop the 21000 but leave two writes of one key
    // in two statements — last-write-wins across statements, so the enriched
    // copy could still be overwritten by the empty one, non-deterministically.
    const { client, calls } = stubClient({})
    const cache = createSupabaseClassificationCache({ client, versions: CURRENT_VERSIONS })
    const many = Array.from({ length: 150 }, (_, i) => entry(`Produkt ${i % 100}`))
    await cache.save(many)
    expect(calls.upserted).toHaveLength(1)
    expect(calls.upserted[0]).toHaveLength(100)
  })

  it('counts rows written, not entries offered', async () => {
    const { client } = stubClient({})
    const cache = createSupabaseClassificationCache({ client, versions: CURRENT_VERSIONS })
    const saved = await cache.save([entry('A'), entry('B'), entry('A')])
    expect(isOk(saved) ? saved.value : -1).toBe(2)
  })
})
