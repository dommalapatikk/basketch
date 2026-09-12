// SupabaseClassificationCache — the memo, persisted.
//
// THE RULE THIS FILE OBEYS, as amended 2026-09-12.
//
// It used to be absolute: a cache failure degrades to a cache MISS, never to a
// run failure — losing the memo costs a few cents of model calls, losing the
// run costs a week of grocery data.
//
// That arithmetic broke when classification moved to a free tier capped at 15
// requests per MINUTE. A lost memo is no longer worth cents; it is worth
// minutes, and enough of them exceed the step timeout. On run 34703713179
// three unreadable lookup chunks (~600 products) turned a warm run — sized at
// ~2 minutes in pipeline.yml — into a cold-start-sized one. Both attempts hit
// the 45-minute wall and nothing was stored. Degrading did not protect the
// run; it guaranteed a slower failure that also spent the quota.
//
// So the rule now reads:
//   - a failed WRITE degrades to a miss, always. (Unchanged.)
//   - a failed READ is RETRIED first — most are transient.
//   - a minority of still-unreadable chunks degrades to a miss.
//   - a majority FAILS the lookup, because proceeding is a doomed run.
//
// The asymmetry between read and write is deliberate: if Supabase cannot be
// read it almost certainly cannot be written either, so a run that presses on
// was going to fail at the storage step regardless.
//
// Supabase vocabulary — PostgrestError, .upsert(), snake_case columns — stops
// here. The domain sees CachedClassification.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type Result, err, isOk, ok } from '../../../collection/domain/result'
import { createClassification, createConfidence } from '../../domain/classification'
import type { CachedClassification, ClassificationCache } from '../../domain/classification-cache'
import { mergeForCache } from '../../domain/classification-cache'

const TABLE = 'product_classification_cache'

/**
 * How many BYTES of encoded cache keys may go into one lookup request.
 *
 * NOT A KEY COUNT, and that is the whole point. This used to be
 * `LOOKUP_CHUNK = 200`, which made the request size a function of data we do
 * not control: cacheKeyFor() returns the raw lowercased product name, and
 * Swiss names carry umlauts, %, & and spaces that percent-encode to 3-6 bytes
 * each. Two chunks of 200 keys can differ by kilobytes.
 *
 * That is why exactly 3 of 8 chunks failed on every attempt of every run while
 * the other 5 were fine: the failures were the chunks holding the longest
 * names. A count cannot express "keep the request small enough to send"; bytes
 * can.
 *
 * VERIFIED IN postgrest-js src/PostgrestBuilder.ts:
 *   :141  this.urlLengthLimit = builder.urlLengthLimit ?? 8000
 *   :412  hint 'HTTP headers exceeded server limits (typically 16KB)'
 *   :415  "If filtering with large arrays (e.g., .in('id', [200+ IDs])),
 *          consider using an RPC function instead."
 *
 * The library anticipates this exact call shape. 5,000 leaves generous room
 * under its 8,000 for the base URL, the select list and headers.
 */
const LOOKUP_BUDGET_BYTES = 5_000

/**
 * Belt and braces: Postgres also has a practical ceiling on `IN (...)` length,
 * independent of how short the keys are.
 */
const LOOKUP_MAX_KEYS = 150

const WRITE_CHUNK = 100

/**
 * How many times one lookup chunk is attempted before it counts as unreadable.
 *
 * Run 34703713179 lost three chunks — ~600 products — to `TypeError: fetch
 * failed`, a transient network error that a single retry would almost
 * certainly have cleared.
 */
const LOOKUP_ATTEMPTS = 3

/** Backoff between lookup attempts. Short: eight chunks, and the run is waiting. */
const LOOKUP_BACKOFF_MS = [250, 1_000] as const

/**
 * How many PRODUCTS may be unreadable before the lookup FAILS instead of
 * quietly reporting a miss.
 *
 * COUNTED IN PRODUCTS, NOT CHUNKS, AND THAT MATTERS. The first version of this
 * guard was a share of CHUNKS (0.25). Its denominator was an artefact of the
 * chunking constant, so shrinking chunks — which the byte-budget fix does —
 * would have turned the very failure it was written for (3 bad chunks) from
 * 3/8 = 0.38 and FAILING into roughly 3/30 = 0.10 and silently degrading. A
 * guard that flips meaning when you tune an unrelated constant is not a guard.
 *
 * CALIBRATED FROM THE BUDGET, not picked round. At the free tier's 15
 * requests/minute, and against pipeline.yml's 45-minute step:
 *
 *     100 products ~  7 min   fits
 *     200 products ~ 13 min   fits, with room for the rest of the run
 *     440 products ~ 30 min   the 2026-09-12 failure — did NOT fit
 *     600 products ~ 40 min   the same failure at its worst
 *
 * So 200 sits above what a run can genuinely absorb and well below what killed
 * it. Lower is not safer: it would fail runs that would have finished.
 *
 * THE REASONING, and why this file's opening rule now has an exception.
 *
 * "Degrade to a miss, never to a run failure" assumed the downside was "a few
 * cents of model calls". Under the free tier's 15 requests/minute that is no
 * longer the downside. On 2026-09-12 losing ~440 cached classifications turned
 * a warm run — which pipeline.yml sizes at ~2 minutes — into a cold-start-sized
 * one that the 45-minute step timeout could not fit. Both attempts died.
 *
 * So proceeding on a mostly-unreadable cache does not degrade gracefully; it
 * guarantees a slow failure while burning the day's quota. Failing here is
 * faster, cheaper, and names the real cause in the log.
 *
 * A minority is still tolerated: two hundred lost hits is ~13 minutes, which a
 * warm run absorbs. Same shape of judgement as MIN_REFRESH_SHARE in
 * stale-sweep.ts — proceed only on a plausible share of what should be there —
 * but expressed, as there, in a real-world unit rather than an internal one.
 */
const MAX_UNREADABLE_KEYS = 200

type CacheRow = {
  cache_key: string
  normalised_name: string
  category: string
  sub_category: string
  attributes: Record<string, unknown> | null
  confidence: number
  is_uncertain: boolean
  model: string
  tier: number
  taxonomy_version: number
  prompt_version: number
  schema_version: number
  run_id: string | null
}

export type SupabaseCacheDeps = {
  client: SupabaseClient
  versions: { taxonomyVersion: number; promptVersion: number; schemaVersion: number }
  /** Injected so a degraded cache is visible in telemetry rather than silent. */
  onDegraded?: (operation: string, detail: string) => void
  /** Injected so retry tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * A thrown value, flattened into something a log can be read from.
 *
 * `TypeError: fetch failed` is a WRAPPER. Node's undici puts the real reason on
 * `.cause` — ECONNRESET, UND_ERR_HEADERS_TIMEOUT, ConnectTimeoutError,
 * getaddrinfo ENOTFOUND — and those call for different fixes. Logging only
 * `.message` is why three runs of this failure produced identical, useless log
 * lines, and why two hypotheses were chased and disproven against evidence that
 * could not tell them apart.
 */
function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)

  const cause = (e as Error & { cause?: unknown }).cause
  if (cause === undefined || cause === null) return e.message

  const causeText =
    cause instanceof Error
      ? `${cause.message}${(cause as Error & { code?: string }).code ? ` (${(cause as Error & { code?: string }).code})` : ''}`
      : String(cause)

  return `${e.message} — caused by: ${causeText}`
}

/**
 * Bytes a set of keys occupies once percent-encoded into a query string.
 *
 * Length in CHARACTERS is the wrong unit — `ä` is one character and three
 * bytes encoded (`%C3%A4`), and a space is one character and three (`%20`).
 * Measuring characters is what let a "200 key" chunk silently become a
 * 20-kilobyte request.
 */
export function encodedSize(keys: readonly string[]): number {
  // +1 per key for the separating comma; quoting adds a couple more.
  return keys.reduce((total, k) => total + encodeURIComponent(k).length + 3, 0)
}

/**
 * Splits keys into chunks that each fit the transport budget.
 *
 * A single key larger than the whole budget is still emitted, alone. It will
 * probably fail — but failing loudly on one product is honest, whereas
 * dropping it means re-classifying it every run forever while the cache
 * reports a clean lookup. That is the failure mode this codebase keeps
 * producing, so it is refused explicitly here.
 */
export function chunkByEncodedSize(
  keys: readonly string[],
  budgetBytes: number = LOOKUP_BUDGET_BYTES,
  maxKeys: number = LOOKUP_MAX_KEYS,
): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0

  for (const key of keys) {
    const keySize = encodedSize([key])

    const wouldOverflow = current.length > 0 && (size + keySize > budgetBytes || current.length >= maxKeys)
    if (wouldOverflow) {
      chunks.push(current)
      current = []
      size = 0
    }

    current.push(key)
    size += keySize
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

function rowToCached(row: CacheRow): CachedClassification | null {
  const conf = createConfidence(Number(row.confidence))
  if (!isOk(conf)) return null

  // Re-validated on READ, not just on write. A row can become invalid without
  // being touched: removing a sub-category from the taxonomy leaves cached rows
  // pointing at something that no longer exists. Treat those as misses.
  const built = createClassification({
    category: row.category,
    subCategory: row.sub_category,
    confidence: conf.value,
    tier: row.tier === 2 ? 2 : 1,
    model: row.model,
  })
  if (!isOk(built)) return null

  return {
    cacheKey: row.cache_key,
    normalisedName: row.normalised_name,
    classification: built.value,
    attributes: row.attributes ?? {},
    runId: row.run_id,
  }
}

export function createSupabaseClassificationCache(deps: SupabaseCacheDeps): ClassificationCache {
  const degraded = (op: string, detail: string) => deps.onDegraded?.(op, detail)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  /**
   * One chunk, retried. Returns null when every attempt failed.
   *
   * Both failure shapes are retried: a THROWN error (`TypeError: fetch failed`
   * — the one that actually bit us) and a returned PostgrestError. Treating
   * only the thrown one as retryable would leave half the hole open.
   */
  async function readChunk(chunk: readonly string[], index: number): Promise<CacheRow[] | null> {
    let lastDetail = 'unknown error'
    // Elapsed time separates a TIMEOUT (consistent, round number near a
    // configured limit) from a CONNECTION RESET (fast, variable). Without it
    // both read as "fetch failed".
    const startedAt = Date.now()

    for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(LOOKUP_BACKOFF_MS[attempt - 1] ?? LOOKUP_BACKOFF_MS[LOOKUP_BACKOFF_MS.length - 1] ?? 1_000)
      }

      try {
        const { data, error } = await deps.client
          .from(TABLE)
          .select('cache_key,normalised_name,category,sub_category,attributes,confidence,is_uncertain,model,tier,taxonomy_version,prompt_version,schema_version,run_id')
          .in('cache_key', chunk)

        if (!error) return (data ?? []) as CacheRow[]

        // ⚠️ READ .details AND .hint, NOT JUST .message.
        //
        // postgrest-js CATCHES network errors and RETURNS them
        // (PostgrestBuilder.ts:367), so the `catch` below never fires for a
        // dropped connection. `.message` is hardcoded to the useless wrapper
        // `"TypeError: fetch failed"` (:422) while the real cause goes to
        // `.details` (:423) and the remedy to `.hint` (:424).
        //
        // Four runs of this failure produced identical, uninformative log
        // lines for exactly this reason.
        lastDetail = [error.message, error.details, error.hint]
          .filter((part) => typeof part === 'string' && part.length > 0)
          .join(' | ')
      } catch (e) {
        lastDetail = describeError(e)
      }
    }

    degraded(
      'lookup',
      `chunk ${index}: ${chunk.length} keys (${encodedSize(chunk)} encoded bytes) unreadable ` +
        `after ${LOOKUP_ATTEMPTS} attempts in ${Date.now() - startedAt}ms: ${lastDetail}`,
    )
    return null
  }

  return {
    async lookup(cacheKeys): Promise<Result<readonly CachedClassification[]>> {
      if (cacheKeys.length === 0) return ok([])

      const found: CachedClassification[] = []
      let stale = 0
      let chunks = 0
      let unreadableChunks = 0
      // Counted in PRODUCTS, not chunks — see MAX_UNREADABLE_KEYS.
      let unreadableKeys = 0

      for (const chunk of chunkByEncodedSize(cacheKeys)) {
        chunks++
        const rows = await readChunk(chunk, chunks)
        if (rows === null) {
          unreadableChunks++
          unreadableKeys += chunk.length
          continue
        }

        for (const row of rows) {
          const mapped = rowToCached(row)
          if (mapped) found.push(mapped)
          else stale++
        }
      }

      if (stale > 0) degraded('lookup', `${stale} cached rows no longer satisfy the taxonomy and were ignored`)

      // Counts PRODUCTS that could not be read — not rows that were absent. An
      // empty cache reads cleanly and returns nothing, which is a legitimate
      // zero and must still proceed, or no cold start could ever run.
      // TWO conditions, because they catch different failures.
      //
      // A key count catches the partial case — enough products lost that the
      // re-classification will not fit the step budget.
      //
      // A total outage catches the case a key count cannot see: EVERY chunk
      // unreadable is Supabase being unreachable, and that is worth failing on
      // even when the dataset is small, because the storage step at the end of
      // the run is about to fail against the same host anyway.
      const totalOutage = chunks > 0 && unreadableChunks === chunks
      if (totalOutage || unreadableKeys > MAX_UNREADABLE_KEYS) {
        const detail = totalOutage
          ? `the classification cache is unreachable — all ${chunks} lookup chunks failed. ` +
            'Refusing to treat the whole memo as empty; the storage step would fail against ' +
            'the same host regardless.'
          : `${unreadableKeys} cached products across ${unreadableChunks} of ${chunks} lookup chunks ` +
            'could not be read — refusing to treat them as uncached. Re-classifying them at the ' +
            "free tier's per-minute cap would exceed the step timeout and spend quota already paid."
        degraded('lookup', detail)
        return err(detail)
      }

      if (unreadableKeys > 0) {
        degraded(
          'lookup',
          `${unreadableKeys} cached products were unreadable and will be re-classified — ` +
            `under the ${MAX_UNREADABLE_KEYS} tolerated, so the run continues.`,
        )
      }

      return ok(found)
    },

    async save(entries): Promise<Result<number>> {
      if (entries.length === 0) return ok(0)

      // ⚠️ ONE ROW PER CONFLICT KEY, ENFORCED HERE. Line below is the only place
      // in the codebase that says `onConflict: 'cache_key'`, so this is the
      // layer that owns that clause's precondition: Postgres raises SQLSTATE
      // 21000 and rejects the WHOLE statement if a key appears twice.
      //
      // Putting this in the callers would be an invariant that only exists in
      // the caller — and there are two of them, plus every future one. Merging
      // BEFORE chunking matters too: per-chunk dedupe would still allow two
      // statements for one key, where last-write-wins could overwrite enriched
      // attributes with an empty bag depending on where the chunk boundary fell.
      const merged = mergeForCache(entries)

      let written = 0
      for (let i = 0; i < merged.length; i += WRITE_CHUNK) {
        const chunk = merged.slice(i, i + WRITE_CHUNK)
        const rows: CacheRow[] = chunk.map((e) => ({
          cache_key: e.cacheKey,
          normalised_name: e.normalisedName,
          category: e.classification.category,
          sub_category: e.classification.subCategory,
          attributes: e.attributes,
          confidence: e.classification.confidence.value,
          is_uncertain: e.classification.isUncertain,
          model: e.classification.model,
          tier: e.classification.tier,
          taxonomy_version: deps.versions.taxonomyVersion,
          prompt_version: deps.versions.promptVersion,
          schema_version: deps.versions.schemaVersion,
          run_id: e.runId,
        }))

        try {
          const { error } = await deps.client.from(TABLE).upsert(rows, { onConflict: 'cache_key' })
          if (error) {
            // A failed write means we pay to classify these again next run.
            // Annoying; not a reason to lose the run.
            degraded('save', error.message)
            continue
          }
          written += rows.length
        } catch (e) {
          degraded('save', describeError(e))
        }
      }

      return ok(written)
    },
  }
}
