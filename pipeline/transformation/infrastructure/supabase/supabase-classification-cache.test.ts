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
  createSupabaseClassificationCache({
    client,
    versions: CURRENT_VERSIONS,
    onDegraded,
    // Lookups now retry with backoff; without this the suite really waits.
    sleep: async () => {},
  })

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

/**
 * THIS BLOCK REVERSES A DELIBERATE DECISION. Read before changing it back.
 *
 * It used to read "a cache failure degrades to a MISS, never to a run failure",
 * justified as: "Losing the memo costs cents. Losing the run costs a week of
 * data." That was sound when a lost memo meant re-paying for a model call.
 *
 * It stopped being sound when the model moved to a free tier capped at 15
 * requests per MINUTE. On run 34703713179 three unreadable lookup chunks
 * turned a warm run — sized at ~2 minutes in pipeline.yml — into a
 * cold-start-sized one that the 45-minute step timeout could not fit. Both
 * attempts died and nothing was stored. Degrading did not save the run; it
 * guaranteed a slower, more expensive failure.
 *
 * So the rule now has a threshold rather than being absolute:
 *   - transient failures are RETRIED (LOOKUP_ATTEMPTS)
 *   - a minority of unreadable chunks still degrades to a miss
 *   - a majority FAILS, because proceeding is a doomed run that spends quota
 *
 * A failed WRITE still degrades — that half is unchanged and still correct.
 *
 * Note the asymmetry is deliberate: if Supabase cannot be READ, it almost
 * certainly cannot be WRITTEN either, so the run was going to fail anyway.
 */
describe('an unreadable cache fails fast; a failed write still degrades', () => {
  it('fails the lookup when the query errors on every attempt', async () => {
    const notes: string[] = []
    const { client } = stubClient({ selectResult: { data: null, error: { message: 'relation does not exist' } } })
    const r = await make(client, (op, d) => notes.push(`${op}: ${d}`)).lookup(['k'])
    expect(isOk(r)).toBe(false)
    expect(notes.join(' ')).toContain('relation does not exist')
  })

  it('fails rather than pretending an unreachable cache is an empty one', async () => {
    const { client } = stubClient({ throwOn: 'select' })
    const r = await make(client).lookup(['k'])
    expect(isOk(r)).toBe(false)
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

// ---------------------------------------------------------------------------
// A transient lookup failure must not be reported as "not in the cache"
// ---------------------------------------------------------------------------
/**
 * THE DEFECT, measured on run 34703713179, 2026-09-12.
 *
 * The pipeline log:
 *
 *   [WARN] classification cache lookup: TypeError: fetch failed   x3
 *   [transform] cache: 742/1598 hits
 *   chunk 1/8: classify+judge 1079.8s (100 products, 100 judged)
 *   ##[error]Final attempt failed. Timeout of 2700000ms hit
 *
 * Lookups go out in chunks of LOOKUP_CHUNK (200). Three chunks failed with a
 * transient network error, and `lookup` caught each one, logged it, and
 * CONTINUED — so ~600 products that were sitting in the cache were reported as
 * uncached and re-sent to the model. The five readable chunks hit 742/1000
 * (74%), so those 600 most likely held ~440 more hits.
 *
 * The blast radius is not "a few cents". This was meant to be a WARM run,
 * which pipeline.yml sizes at ~2 minutes. Re-classifying 440 products at the
 * free tier's 15 requests/minute turned it into a cold-start-sized run that
 * the 45-minute step timeout could never fit. Both attempts died mid-way, and
 * the second restarted from chunk 1.
 *
 * The rule this file states —
 *
 *   "a cache failure degrades to a cache MISS, never to a run failure.
 *    Losing the memo costs a few cents of model calls."
 *
 * — was written when model calls were cheap AND fast. Under a per-minute cap,
 * losing the memo costs the whole run. So: retry first, and if a large share
 * of the cache still cannot be read, say so instead of silently doing hours of
 * work we already paid for.
 *
 * An empty cache is NOT this case. A first cold start reads every chunk
 * successfully and finds no rows; that is a legitimate zero, and it still
 * proceeds.
 */

/** Stub whose `in()` returns a different result per call, so retries are observable. */
function sequencedClient(results: Array<{ data: unknown[] | null; error: { message: string } | null } | 'throw'>) {
  let call = 0
  const client = {
    from() {
      return {
        select() {
          return {
            in() {
              const r = results[Math.min(call, results.length - 1)]
              call++
              if (r === 'throw') throw new Error('TypeError: fetch failed')
              return Promise.resolve(r)
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls: () => call }
}

const noSleep = async () => {}

describe('a transient lookup failure is retried, not treated as a miss', () => {
  it('retries and returns the rows the second attempt reads', async () => {
    const { client, calls } = sequencedClient(['throw', { data: [row()], error: null }])
    const cache = createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
    })

    const r = await cache.lookup(['emmi milch|t3|p1|s1'])
    expect(isOk(r)).toBe(true)
    expect(unwrap(r)).toHaveLength(1)
    expect(calls()).toBe(2)
  })

  it('retries a PostgREST error result, not just a thrown one', async () => {
    const { client, calls } = sequencedClient([
      { data: null, error: { message: 'upstream timeout' } },
      { data: [row()], error: null },
    ])
    const cache = createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
    })

    expect(unwrap(await cache.lookup(['emmi milch|t3|p1|s1']))).toHaveLength(1)
    expect(calls()).toBe(2)
  })

  it('gives up after a bounded number of attempts rather than hanging the run', async () => {
    const { client, calls } = sequencedClient(['throw'])
    const cache = createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
    })

    await cache.lookup(['k'])
    expect(calls()).toBeLessThanOrEqual(3)
    expect(calls()).toBeGreaterThan(1)
  })

  it('FAILS the lookup when the cache cannot be read at all', async () => {
    // Proceeding here means re-classifying everything under a per-minute cap
    // and hitting the step timeout anyway. Failing fast saves the quota and
    // names the real cause in the log.
    const { client } = sequencedClient(['throw'])
    const notes: string[] = []
    const cache = createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
      onDegraded: (op, d) => notes.push(`${op}: ${d}`),
    })

    const r = await cache.lookup(['k'])
    expect(isOk(r)).toBe(false)
    expect(notes.join(' ')).toMatch(/unreadable|could not be read/i)
  })

  it('an EMPTY cache is not an unreadable one — a cold start still proceeds', async () => {
    // The distinction that matters: every chunk was read successfully and held
    // no rows. That is a legitimate zero.
    const { client } = sequencedClient([{ data: [], error: null }])
    const cache = createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
    })

    const r = await cache.lookup(['a', 'b', 'c'])
    expect(isOk(r)).toBe(true)
    expect(unwrap(r)).toEqual([])
  })

  it('tolerates a minority of unreadable chunks, since most of the memo survives', async () => {
    // 1 unreadable chunk in 8 loses ~90 hits, which a warm run absorbs. The
    // run continues rather than failing over a blip.
    const keys = Array.from({ length: 1_600 }, (_, i) => `key-${i}`)
    let chunk = 0
    const client = {
      from() {
        return {
          select() {
            return {
              in(_col: string, ks: string[]) {
                // Fail every attempt of the first chunk only.
                const isFirstChunk = ks[0] === 'key-0'
                chunk++
                if (isFirstChunk) throw new Error('TypeError: fetch failed')
                return Promise.resolve({ data: [row()], error: null })
              },
            }
          },
        }
      },
    } as unknown as SupabaseClient

    const r = await createSupabaseClassificationCache({
      client,
      versions: CURRENT_VERSIONS,
      sleep: noSleep,
    }).lookup(keys)

    expect(isOk(r)).toBe(true)
    expect(chunk).toBeGreaterThan(8)
  })
})

// ---------------------------------------------------------------------------
// The reason a fetch failed must survive into the log
// ---------------------------------------------------------------------------
/**
 * WHY THIS EXISTS, 2026-09-12.
 *
 * Three pipeline runs reported the same thing and taught us nothing:
 *
 *   [WARN] classification cache lookup: TypeError: fetch failed
 *
 * In Node that string is a WRAPPER. undici puts the actual reason on
 * `error.cause` — ECONNRESET, UND_ERR_HEADERS_TIMEOUT, ConnectTimeoutError,
 * getaddrinfo ENOTFOUND — and they call for completely different fixes. We
 * logged `e.message` only, so every distinct failure looked identical and two
 * hypotheses (transient blip, URL length) were investigated and disproven
 * against evidence that could not distinguish them.
 *
 * A diagnostic that cannot tell two causes apart is not a diagnostic.
 */
describe('a wrapped fetch error reports its underlying cause', () => {
  const throwingClient = (toThrow: unknown) =>
    ({
      from() {
        return {
          select() {
            return {
              in() {
                throw toThrow
              },
            }
          },
        }
      },
    }) as unknown as SupabaseClient

  it('includes error.cause, not just "fetch failed"', async () => {
    const wrapped = new TypeError('fetch failed')
    ;(wrapped as Error & { cause?: unknown }).cause = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    })

    const notes: string[] = []
    await createSupabaseClassificationCache({
      client: throwingClient(wrapped),
      versions: CURRENT_VERSIONS,
      sleep: async () => {},
      onDegraded: (_op, d) => notes.push(d),
    }).lookup(['k'])

    const log = notes.join(' | ')
    expect(log).toContain('fetch failed')
    expect(log).toContain('ECONNRESET')
  })

  it('reports how many keys the failed chunk held, so size can be ruled in or out', async () => {
    const notes: string[] = []
    await createSupabaseClassificationCache({
      client: throwingClient(new TypeError('fetch failed')),
      versions: CURRENT_VERSIONS,
      sleep: async () => {},
      onDegraded: (_op, d) => notes.push(d),
    }).lookup(['a', 'b', 'c'])

    const log = notes.join(' ')
    expect(log).toContain('3 keys')
    // Duration distinguishes a timeout from a reset — both say "fetch failed".
    expect(log).toMatch(/in \d+ms/)
    expect(log).toMatch(/chunk \d+/)
  })

  it('survives a cause that is not an Error', async () => {
    const wrapped = new TypeError('fetch failed')
    ;(wrapped as Error & { cause?: unknown }).cause = 'socket hang up'

    const notes: string[] = []
    await createSupabaseClassificationCache({
      client: throwingClient(wrapped),
      versions: CURRENT_VERSIONS,
      sleep: async () => {},
      onDegraded: (_op, d) => notes.push(d),
    }).lookup(['k'])

    expect(notes.join(' ')).toContain('socket hang up')
  })

  it('does not invent a cause when there is none', async () => {
    const notes: string[] = []
    await createSupabaseClassificationCache({
      client: throwingClient(new TypeError('fetch failed')),
      versions: CURRENT_VERSIONS,
      sleep: async () => {},
      onDegraded: (_op, d) => notes.push(d),
    }).lookup(['k'])

    expect(notes.join(' ')).not.toMatch(/caused by:\s*(undefined|null)/i)
  })
})
