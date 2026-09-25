// resolveCatalogueIdentity — orchestrates the batched catalogue-identity
// write (ARCH-X §2.2-2.4, "application/resolve-catalogue.ts"). Replaces the
// per-deal loop in `v3-cutover.ts`'s `populateV3Layer` (about 2 HTTP round
// trips PER DEAL) with a handful of batched round trips total (C-4).
//
// LAYERING: this file is the APPLICATION layer. It defines `CatalogueStore`
// — the port every real write must satisfy — and orchestrates
// `planCatalogueIdentity` (domain) against that port. It imports no Supabase
// client; `infrastructure/supabase-catalogue-store.ts` is the only file that
// builds the real thing (same shape as `run-pipeline.ts` / `PipelineDeps`).

import type { Deal } from '../../../shared/types'
import type { Result } from '../../collection/domain/result'
import { isOk } from '../../collection/domain/result'
import type { ConceptDraft, ConceptFamilyDraft } from '../domain/catalogue-plan'
import { pendingSkuKeyToString, planCatalogueIdentity } from '../domain/catalogue-plan'
import type { ResolverRule } from '../domain/concept-resolution'
import type { SkuKey } from '../domain/sku-key'
import { skuKey, skuKeyToString } from '../domain/sku-key'

export type SkuUpsertInput = {
  readonly key: SkuKey
  readonly sourceProductName: string
  /** V-c: absent, never present-with-null, when no shelf price was observed. */
  readonly regularPrice?: number
  readonly lastDealSeenAt: string
}

/**
 * Everything `resolveCatalogueIdentity` needs from storage — one port so a
 * test can substitute an in-memory fake for the whole catalogue write path,
 * the same reason `OfferSource` exists for collection (CLAUDE.md § DDD).
 *
 * Every batched write returns ids mapped BY NATURAL KEY, never by response
 * order — PostgREST does not promise to return rows in input order (C-5).
 * Never throws: a read or write failure is a `Result` error, not an
 * exception, so this module's own contract ("never throws", same as the step
 * it replaces) does not depend on every implementation remembering to catch.
 */
export type CatalogueStore = {
  readonly loadResolverRules: () => Promise<Result<readonly ResolverRule[]>>
  readonly loadValidTaxonomySubcats: () => Promise<Result<ReadonlySet<string>>>
  readonly upsertFamilies: (families: readonly ConceptFamilyDraft[]) => Promise<Result<undefined>>
  readonly upsertConcepts: (concepts: readonly ConceptDraft[]) => Promise<Result<ReadonlyMap<string, string>>>
  readonly upsertSkus: (skus: readonly SkuUpsertInput[]) => Promise<Result<ReadonlyMap<string, string>>>
}

export type CatalogueLinks = {
  /** Keyed by `dealKeyToString` — the sku_id each stored deal resolved to this run. */
  readonly skuIdByDeal: ReadonlyMap<string, string>
  readonly conceptsResolved: number
  readonly skusUpserted: number
  readonly skipped: {
    readonly noSubCategory: number
    readonly rulesUnreadable: boolean
    readonly subcatsUnreadable: boolean
  }
}

function emptyLinks(skipped: CatalogueLinks['skipped']): CatalogueLinks {
  return { skuIdByDeal: new Map(), conceptsResolved: 0, skusUpserted: 0, skipped }
}

const NO_SKIP = { noSubCategory: 0, rulesUnreadable: false, subcatsUnreadable: false }

/**
 * Resolves every deal to a concept + sku, in a handful of batched round trips
 * instead of one (or two) per deal. Never throws.
 *
 * V-a/V-b (TL cross-review §2.4): if the resolver rules or the taxonomy
 * sub-category list cannot be read, catalogue resolution ABORTS for the
 * whole run rather than falling back silently to the wrong concept — "wrong
 * concepts are worse than stale ones". No concept or sku is written this
 * run. Deals keep whatever `sku_id` they already had: nothing here nulls an
 * existing link, because linking a deal to a sku happens elsewhere, fed by
 * `skuIdByDeal` — an aborted run simply returns an empty map (C-6).
 */
export async function resolveCatalogueIdentity(
  deals: readonly Deal[],
  store: CatalogueStore,
  now: string,
): Promise<CatalogueLinks> {
  if (deals.length === 0) return emptyLinks(NO_SKIP)

  const rulesResult = await store.loadResolverRules()
  if (!isOk(rulesResult)) {
    console.error(`[catalogue] skipped (resolver rules unreadable): ${rulesResult.error}`)
    return emptyLinks({ ...NO_SKIP, rulesUnreadable: true })
  }

  const subcatsResult = await store.loadValidTaxonomySubcats()
  if (!isOk(subcatsResult)) {
    console.error(`[catalogue] skipped (taxonomy sub-categories unreadable): ${subcatsResult.error}`)
    return emptyLinks({ ...NO_SKIP, subcatsUnreadable: true })
  }

  const plan = planCatalogueIdentity(deals, rulesResult.value, subcatsResult.value, now)
  const skipped = { ...NO_SKIP, noSubCategory: plan.skipped.noSubCategory }

  if (plan.families.length > 0) {
    const familiesResult = await store.upsertFamilies(plan.families)
    if (!isOk(familiesResult)) {
      console.error(`[catalogue] failed to upsert concept families — no concept or sku written this run: ${familiesResult.error}`)
      return emptyLinks(skipped)
    }
  }

  let idBySlug: ReadonlyMap<string, string> = new Map()
  if (plan.concepts.length > 0) {
    const conceptsResult = await store.upsertConcepts(plan.concepts)
    if (!isOk(conceptsResult)) {
      console.error(`[catalogue] failed to upsert concepts — no sku written this run: ${conceptsResult.error}`)
      return emptyLinks(skipped)
    }
    idBySlug = conceptsResult.value
  }

  // Resolve every draft's FINAL concept id: 'existing' already has one from a
  // resolver rule; 'planned' comes from the batch just upserted, mapped by
  // natural key (slug) — never by response order (C-5, enforced by the port
  // implementation, not here).
  const skuInputs: SkuUpsertInput[] = []
  const finalKeyByDraft = new Map<string, SkuKey>()
  let conceptsResolved = 0
  for (const draft of plan.skuDrafts) {
    const conceptId = draft.key.conceptRef.kind === 'existing' ? draft.key.conceptRef.id : idBySlug.get(draft.key.conceptRef.slug)
    // The concept batch failed to return an id for this slug (e.g. it was in
    // a chunk PostgREST rejected) — its skus are skipped, never written with
    // a missing/blank concept id.
    if (!conceptId) continue
    conceptsResolved++
    const key = skuKey(conceptId, draft.key.store, draft.key.region, draft.key.sourceProductId)
    finalKeyByDraft.set(pendingSkuKeyToString(draft.key), key)
    skuInputs.push({
      key,
      sourceProductName: draft.sourceProductName,
      ...(draft.regularPrice !== undefined ? { regularPrice: draft.regularPrice } : {}),
      lastDealSeenAt: draft.lastDealSeenAt,
    })
  }

  let idByKey: ReadonlyMap<string, string> = new Map()
  if (skuInputs.length > 0) {
    const skusResult = await store.upsertSkus(skuInputs)
    if (isOk(skusResult)) {
      idByKey = skusResult.value
    } else {
      // A failed sku batch never nulls an existing link (ARCH-X §2.4): those
      // deals simply get no NEW sku_id this run — see C-8, applied at the
      // storage layer that links deals.sku_id from this result.
      console.error(`[catalogue] failed to upsert a sku batch — those deals keep no new sku_id this run: ${skusResult.error}`)
    }
  }

  const skuIdByDeal = new Map<string, string>()
  for (const [dealKeyStr, pendingKey] of plan.skuKeyByDeal) {
    const finalKey = finalKeyByDraft.get(pendingSkuKeyToString(pendingKey))
    if (!finalKey) continue
    const skuId = idByKey.get(skuKeyToString(finalKey))
    if (skuId) skuIdByDeal.set(dealKeyStr, skuId)
  }

  return { skuIdByDeal, conceptsResolved, skusUpserted: idByKey.size, skipped }
}
