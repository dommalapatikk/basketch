import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import type { WorthPickingUpCandidate } from '@/components/landing/WorthPickingUpCard'
import { createPriceBasis, type PriceBasis } from '@/lib/domain/price-basis'
import { isOk } from '@/lib/domain/result'
import { isInEffect } from '@/lib/domain/validity'
import { createAnonClient } from '@/lib/supabase/anon-server'
import { STORE_META, type Store } from '@/lib/v3-types'

/**
 * Reads the two loyalty columns as one value object, the same rule
 * server/data/supabase-provider.ts's `mapRow` already applies to the main
 * deals list: a member price we cannot label is the one row we refuse
 * outright, rather than show as an open price (Art. 3(1)(e) UWG).
 *
 * `context` is only for the log line — this module has two different row
 * shapes (personal MV rows keyed by `deal_id`, cold-start rows keyed by
 * `id`), and a caller-supplied identifier is simpler than a second
 * overload per shape.
 */
function toPriceBasisOrNull(
  priceBasis: string | null,
  loyaltyProgramme: string | null,
  context: string,
): PriceBasis | null {
  const result = createPriceBasis(priceBasis, loyaltyProgramme)
  if (!isOk(result)) {
    console.error(`[wpu] dropping candidate ${context}: ${result.error}`)
    return null
  }
  return result.value
}

// Server fetch for Surface 3 candidates.
// Cold-start (no email or <5 user_interest rows): top discounted active deals.
// Personal: pre-scored worth_picking_up_candidates MV joined with concept names.
//
// 'use cache' satisfies Next.js 16 Cache Components — without it, Next refuses
// to prerender the home page (uncached data outside <Suspense>).

/**
 * One row of `worth_picking_up_candidates`, the columns this module reads.
 * `valid_from`/`valid_to` exist so `inEffectCandidateRows` can re-check
 * validity at read time — see that function for why.
 */
type PersonalCandidateRow = {
  concept_id: string
  deal_store: string
  deal_id: string
  deal_price: number
  deal_regular_price: number | null
  discount_percent: number
  valid_from: string
  /** `deals.valid_to` is nullable (baseline.sql:96) — see `inEffectCandidateRows`. */
  valid_to: string | null
  /**
   * Carried through from `deals` via `concept_cheapest_now`
   * (supabase/migrations/20260917_mv_price_basis.sql). `deals.price_basis`
   * is `NOT NULL DEFAULT 'everyone'` at the source, but this column is
   * typed nullable here regardless — see that migration's own comment on
   * why the view does not assert a default a schema drift could silently
   * hide.
   */
  price_basis: string | null
  loyalty_programme: string | null
  /**
   * WP-C4/D2/TP-7a, carried through the same way as price_basis above
   * (supabase/migrations/20260917_mv_price_basis.sql). `null` is the
   * ordinary single-item price — see lib/domain/quantity-requirement.ts.
   */
  min_quantity: number | null
  interest_signal: string
  interest_added_at: string
}

/**
 * Re-applies `isInEffect` to rows already read from the
 * `worth_picking_up_candidates` materialised view.
 *
 * WHY THIS EXISTS (WP-W3, docs/decisions/2026-09-15-in-effect-vs-upcoming.md
 * "Open"; migration 20260916_mv_validity_window.sql). A materialised view
 * freezes `CURRENT_DATE` at REFRESH time, not at read time — REFRESH runs
 * once, at the end of every pipeline run. The migration's WHERE clause is
 * correct AT REFRESH, but a row it correctly included can still have expired,
 * or a row can still be one whose window has not yet opened relative to a
 * request that lands hours or days later, before the next refresh. This is
 * the exact reason `WeeklySnapshot.today` is threaded into `buildSections`
 * instead of trusting a query filter alone (WP-W2) — the same predicate,
 * reused, not reimplemented, here.
 *
 * `valid_to: string | null` matches `deals.valid_to`'s real nullability
 * (baseline.sql:96) rather than the `string` the row types here previously,
 * dishonestly, claimed. A null `valid_to` is treated as NOT in effect —
 * "expire aggressively" (CLAUDE.md) means an end date this module cannot
 * confirm is one it does not vouch for. In practice this branch should never
 * fire: both queries that feed this function already carry
 * `.gte('valid_to', today)` (`coldStartCandidates`) or are built from a view
 * whose own WHERE clause excludes a null `valid_to` (Postgres: `NULL >=
 * CURRENT_DATE` is neither true nor false, so the row is dropped) — but the
 * type is honest about the column regardless of how reliably today's callers
 * happen to pre-filter it.
 */
export function inEffectCandidateRows<T extends { valid_from: string; valid_to: string | null }>(
  rows: T[],
  today: string,
): T[] {
  return rows.filter(
    (row) => row.valid_to !== null && isInEffect({ validFrom: row.valid_from, validTo: row.valid_to }, today),
  )
}

export async function getWorthPickingUpCandidates(args: {
  userEmail?: string | null
  locale: string
  /** Zurich calendar date (`YYYY-MM-DD`) — the same one carried on `WeeklySnapshot.today`. */
  today: string
}): Promise<{ mode: 'personal' | 'cold-start'; candidates: WorthPickingUpCandidate[] }> {
  'use cache'
  cacheLife('hours')
  // Same tag `snapshot.ts` uses — without it, the pipeline's /api/revalidate
  // call (which invalidates by tag, not by function) cannot reach this
  // cache, and cold-start suggestions can lag a pipeline run by up to a day
  // (the `expire` bound cacheLife('hours') carries).
  cacheTag('deals')
  const sb = createAnonClient()

  // 1. Cold-start path — used until user has 5+ interest rows (PM Q11 locked).
  if (!args.userEmail) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb, args.today) }
  }

  const { count: interestCount } = await sb
    .from('user_interest')
    .select('*', { count: 'exact', head: true })
    .eq('user_email', args.userEmail)
    .is('dismissed_at', null)

  if (!interestCount || interestCount < 5) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb, args.today) }
  }

  // 2. Personal path — read from MV.
  const { data, error } = await sb
    .from('worth_picking_up_candidates')
    .select(
      'concept_id, deal_store, deal_id, deal_price, deal_regular_price, discount_percent, valid_from, valid_to, price_basis, loyalty_programme, min_quantity, interest_signal, interest_added_at',
    )
    .eq('user_email', args.userEmail)
    .order('score', { ascending: false })
    .limit(10)

  if (error) {
    // Distinct from "no rows" below — an actual query failure. The most
    // likely cause right now is the exact staleness window this WP closes:
    // `valid_from`/`valid_to` do not exist on `worth_picking_up_candidates`
    // until the migration is applied (PostgREST 400), or PostgREST's schema
    // cache has not picked up the applied migration yet (stale schema
    // cache — `NOTIFY pgrst, 'reload schema';` fixes that specifically).
    // Without this log every affected user silently degrades to cold-start
    // with zero telemetry of why.
    console.error('[wpu] personal path failed', { error: error.message, userEmail: args.userEmail })
  }

  if (error || !data || data.length === 0) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb, args.today) }
  }

  // Re-apply isInEffect: the MV's own filter is only as fresh as its last
  // REFRESH (WP-W3). Falls back to cold-start on an empty result, same as
  // an empty MV read — the personal path has nothing honest to show today.
  const inEffect = inEffectCandidateRows(data as PersonalCandidateRow[], args.today)
  if (inEffect.length === 0) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb, args.today) }
  }

  // Hydrate concept names + image (latest deal image as a proxy). The two
  // reads are independent — same store, same pipeline snapshot, no ordering
  // dependency between them — so they run in parallel rather than paying two
  // sequential round trips (CLAUDE.md: parallelise independent requests).
  const conceptIds = inEffect.map((r) => r.concept_id)
  const dealIds = inEffect.map((r) => r.deal_id)
  const [{ data: concepts }, { data: dealImages }] = await Promise.all([
    sb.from('concept').select('id, display_name').in('id', conceptIds),
    sb.from('deals').select('id, image_url').in('id', dealIds),
  ])
  const nameById = new Map((concepts ?? []).map((c) => [c.id, c.display_name as string]))
  const imageByDealId = new Map((dealImages ?? []).map((d) => [d.id, d.image_url as string | null]))

  return {
    mode: 'personal',
    // flatMap, not map: a row whose loyalty columns cannot be honestly read
    // as a PriceBasis is dropped (toPriceBasisOrNull), the same "refuse
    // rather than mislabel" rule supabase-provider.ts's mapRow applies to
    // the main deals list — never reachable in practice (the CHECK
    // constraint on `deals` should make it impossible), but a row this
    // module cannot label is not one it shows as an open price.
    candidates: inEffect.flatMap((r) => {
      const priceBasis = toPriceBasisOrNull(r.price_basis, r.loyalty_programme, r.deal_id)
      if (!priceBasis) return []
      const meta = STORE_META[r.deal_store as Store]
      return [
        {
          conceptId: r.concept_id,
          conceptName: nameById.get(r.concept_id) ?? '—',
          imageUrl: imageByDealId.get(r.deal_id) ?? null,
          storeSlug: r.deal_store,
          storeLabel: meta?.label ?? r.deal_store,
          dealPrice: r.deal_price,
          regularPrice: r.deal_regular_price ?? r.deal_price,
          discountPercent: r.discount_percent,
          contextLine: contextLineFromSignal(r.interest_signal, r.interest_added_at),
          priceBasis,
          minQuantity: r.min_quantity,
        },
      ]
    }),
  }
}

/**
 * One row of `deals`, the columns `coldStartCandidates` reads. `valid_from`/
 * `valid_to` exist for the same reason as `PersonalCandidateRow` above.
 */
type ColdStartRow = {
  id: string
  store: string
  product_name: string
  sale_price: number
  original_price: number | null
  discount_percent: number
  image_url: string | null
  sub_category: string | null
  category_slug: string | null
  valid_from: string
  /** `deals.valid_to` is nullable (baseline.sql:96) — see `inEffectCandidateRows`. */
  valid_to: string | null
  /** `deals.price_basis`/`deals.loyalty_programme` — read directly, no view in the way. */
  price_basis: string | null
  loyalty_programme: string | null
  /** `deals.min_quantity` (WP-C4/D2/TP-7a) — read directly, no view in the way. */
  min_quantity: number | null
}

/**
 * Cold-start reads `deals` directly, not a materialised view — but the same
 * "listed but has not started, or has expired" gap applies, and until this
 * fix it had NEITHER half of the rule: no `.gte('valid_to', …)` safety net
 * (CLAUDE.md — every other deal query in this codebase carries one) and no
 * `isInEffect` re-check. Both are applied here, for the two different
 * failure modes each one alone cannot cover: `.gte('valid_to', today)` is
 * the source-level filter Postgres applies once; `inEffectCandidateRows` is
 * the request-time re-check that also excludes a not-yet-started deal
 * (`.gte('valid_to', …)` cannot express `valid_from`) and defends against a
 * query-level filter that, for whatever reason, let a row through.
 */
export async function coldStartCandidates(
  sb: ReturnType<typeof createAnonClient>,
  today: string,
): Promise<WorthPickingUpCandidate[]> {
  const { data } = await sb
    .from('deals')
    .select(
      'id, store, product_name, sale_price, original_price, discount_percent, image_url, sub_category, category_slug, valid_from, valid_to, price_basis, loyalty_programme, min_quantity',
    )
    .eq('is_active', true)
    .gte('valid_to', today)
    .gte('discount_percent', 30)
    .order('discount_percent', { ascending: false })
    .limit(10)

  const inEffect = inEffectCandidateRows((data ?? []) as ColdStartRow[], today)

  // flatMap, not map — same "refuse rather than mislabel" reasoning as the
  // personal path above, via the same toPriceBasisOrNull helper.
  return inEffect.flatMap((d) => {
    const priceBasis = toPriceBasisOrNull(d.price_basis, d.loyalty_programme, d.id)
    if (!priceBasis) return []
    const meta = STORE_META[d.store as Store]
    return [
      {
        conceptId: d.id, // best-effort — uses deal id since cold-start has no concept link yet
        conceptName: d.product_name,
        imageUrl: d.image_url,
        storeSlug: d.store,
        storeLabel: meta?.label ?? d.store,
        dealPrice: d.sale_price,
        regularPrice: d.original_price ?? d.sale_price,
        discountPercent: d.discount_percent,
        contextLine: `Top discount in ${(d.sub_category ?? d.category_slug ?? '—').replace(/-/g, ' ')} this week`,
        priceBasis,
        minQuantity: d.min_quantity,
      },
    ]
  })
}

function contextLineFromSignal(signal: string, addedAt: string): string {
  const days = Math.floor((Date.now() - new Date(addedAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days < 7) return `You ${signal === 'browsed' ? 'browsed' : 'added'} this ${days}d ago`
  if (days < 28) return `You ${signal === 'browsed' ? 'browsed' : 'added'} these ${Math.floor(days / 7)} weeks ago`
  return `You added these ${Math.floor(days / 30)} months ago — strong deal back this week`
}
