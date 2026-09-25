// planCatalogueIdentity — pure planning step (ARCH-X §2.2, "catalogue-plan.ts").
//
// Replaces the per-deal loop in `v3-cutover.ts:260-292` (`ensureConceptFamily`
// + `ensureConcept` + `ensureSku`, one upsert each PER DEAL). This function
// does no I/O: it turns a list of deals plus the resolver rules and valid
// taxonomy sub-categories (both read ONCE by the application layer) into a
// deduplicated plan of what to write. The write itself — batched upserts,
// concept ids fed back into the sku drafts — is `resolveCatalogueIdentity`
// (application layer), which is what makes it possible: Postgres rejects a
// single upsert statement that touches the same conflict target twice, so
// deduping BEFORE the batch is sent is what makes batching safe (C-1).

import type { Deal } from '../../../shared/types'
import { normalizeProductName } from '../../../shared/types'
import { applyResolver, regionForStore, slugify, type ResolverRule } from './concept-resolution'
import { dealKey, dealKeyToString } from './deal-key'

export type ConceptFamilyDraft = {
  readonly slug: string
  readonly displayName: string
  readonly categorySlug: string | null
  readonly subcategorySlug: string | null
}

export type ConceptDraft = {
  readonly slug: string
  readonly displayName: string
  readonly familySlug: string
}

/**
 * Which concept a sku draft belongs to, before concepts are upserted.
 * `existing` — a resolver rule already named a real concept id (C-2): no
 * concept write is needed or attempted for this deal at all.
 * `planned` — the fallback one-concept-per-(sub-category, product): the
 * concept must be upserted first, and its id is filled in afterwards.
 */
export type ConceptRef = { readonly kind: 'existing'; readonly id: string } | { readonly kind: 'planned'; readonly slug: string }

export function conceptRefKey(ref: ConceptRef): string {
  return ref.kind === 'existing' ? `id:${ref.id}` : `slug:${ref.slug}`
}

export type PendingSkuKey = {
  readonly conceptRef: ConceptRef
  readonly store: string
  readonly region: string
  readonly sourceProductId: string
}

export function pendingSkuKeyToString(key: PendingSkuKey): string {
  return `${conceptRefKey(key.conceptRef)}|${key.store}|${key.region}|${key.sourceProductId}`
}

export type SkuDraft = {
  readonly key: PendingSkuKey
  readonly sourceProductName: string
  /**
   * V-c (ARCH-X §2.1, tech-lead ruling §5 #5): OMITTED — never set to null —
   * when the source printed no shelf price this week. The migration's own
   * column comment says "null if never observed"; a batched write that set
   * it to null on every ALDI-style week with no printed reference price
   * would erase a genuinely observed one from a previous week.
   */
  readonly regularPrice?: number
  readonly lastDealSeenAt: string
}

export type CataloguePlan = {
  readonly families: readonly ConceptFamilyDraft[]
  readonly concepts: readonly ConceptDraft[]
  readonly skuDrafts: readonly SkuDraft[]
  /** Which sku draft resolves each stored deal's sku_id, once skus are upserted and given real ids. */
  readonly skuKeyByDeal: ReadonlyMap<string, PendingSkuKey>
  readonly skipped: { readonly noSubCategory: number }
}

/**
 * Pure. No I/O. `rules` must already be sorted ascending by priority (the
 * port loads them that way, same contract `applyResolver` always had).
 * `now` is threaded in rather than read from the clock so this function stays
 * pure and deterministic (Kent Beck TDD; CLAUDE.md "pure planning step").
 */
export function planCatalogueIdentity(
  deals: readonly Deal[],
  rules: readonly ResolverRule[],
  validSubcats: ReadonlySet<string>,
  now: string,
): CataloguePlan {
  const families = new Map<string, ConceptFamilyDraft>()
  const concepts = new Map<string, ConceptDraft>()
  const skuDrafts = new Map<string, SkuDraft>()
  const skuKeyByDeal = new Map<string, PendingSkuKey>()
  let noSubCategory = 0

  for (const deal of deals) {
    const subCategory = deal.subCategory
    if (!subCategory) {
      noSubCategory++
      continue
    }

    // Step 1: a resolver rule wins over the fallback (C-2) — no family or
    // concept is created for a deal a rule already resolved.
    const ruleConceptId = applyResolver(deal.productName, rules)
    let conceptRef: ConceptRef
    if (ruleConceptId) {
      conceptRef = { kind: 'existing', id: ruleConceptId }
    } else {
      if (!families.has(subCategory)) {
        families.set(subCategory, {
          slug: subCategory,
          displayName: subCategory.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          categorySlug: deal.categorySlug ?? null,
          subcategorySlug: validSubcats.has(subCategory) ? subCategory : null,
        })
      }
      const slug = slugify(`${subCategory}-${deal.productName}`).slice(0, 200)
      if (!concepts.has(slug)) {
        concepts.set(slug, { slug, displayName: deal.productName, familySlug: subCategory })
      }
      conceptRef = { kind: 'planned', slug }
    }

    // Normalised: matches what `deals.product_name` actually holds after
    // `storeDeals` writes it, and is what future runs will look this sku up
    // by (C-1: two differently-cased/spaced names collapse to one draft).
    const sourceProductId = normalizeProductName(deal.productName)
    const pendingKey: PendingSkuKey = {
      conceptRef,
      store: deal.store,
      region: regionForStore(deal.store),
      sourceProductId,
    }
    const draftId = pendingSkuKeyToString(pendingKey)
    if (!skuDrafts.has(draftId)) {
      const regularPrice = deal.originalPrice ?? undefined
      skuDrafts.set(draftId, {
        key: pendingKey,
        sourceProductName: deal.productName,
        // Conditional spread, not `regularPrice: undefined` — the KEY must be
        // absent, not merely undefined-valued, so a batching writer can group
        // drafts by column set (P2a) instead of trusting JSON.stringify to
        // drop it later.
        ...(regularPrice !== undefined ? { regularPrice } : {}),
        lastDealSeenAt: now,
      })
    }

    const dk = dealKeyToString(dealKey(deal.store, deal.productName, deal.validFrom))
    skuKeyByDeal.set(dk, pendingKey)
  }

  return {
    families: [...families.values()],
    concepts: [...concepts.values()],
    skuDrafts: [...skuDrafts.values()],
    skuKeyByDeal,
    skipped: { noSubCategory },
  }
}
