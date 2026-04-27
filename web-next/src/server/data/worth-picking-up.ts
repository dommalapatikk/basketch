import 'server-only'

import { unstable_cacheLife as cacheLife } from 'next/cache'

import { createAnonClient } from '@/lib/supabase/anon-server'
import { STORE_META, type Store } from '@/lib/v3-types'
import type { WorthPickingUpCandidate } from '@/components/landing/WorthPickingUpCard'

// Server fetch for Surface 3 candidates.
// Cold-start (no email or <5 user_interest rows): top discounted active deals.
// Personal: pre-scored worth_picking_up_candidates MV joined with concept names.
//
// 'use cache' satisfies Next.js 16 Cache Components — without it, Next refuses
// to prerender the home page (uncached data outside <Suspense>).

export async function getWorthPickingUpCandidates(args: {
  userEmail?: string | null
  locale: string
}): Promise<{ mode: 'personal' | 'cold-start'; candidates: WorthPickingUpCandidate[] }> {
  'use cache'
  cacheLife('hours')
  const sb = createAnonClient()

  // 1. Cold-start path — used until user has 5+ interest rows (PM Q11 locked).
  if (!args.userEmail) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb) }
  }

  const { count: interestCount } = await sb
    .from('user_interest')
    .select('*', { count: 'exact', head: true })
    .eq('user_email', args.userEmail)
    .is('dismissed_at', null)

  if (!interestCount || interestCount < 5) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb) }
  }

  // 2. Personal path — read from MV.
  const { data, error } = await sb
    .from('worth_picking_up_candidates')
    .select('concept_id, deal_store, deal_id, deal_price, deal_regular_price, discount_percent, interest_signal, interest_added_at')
    .eq('user_email', args.userEmail)
    .order('score', { ascending: false })
    .limit(10)

  if (error || !data || data.length === 0) {
    return { mode: 'cold-start', candidates: await coldStartCandidates(sb) }
  }

  // Hydrate concept names + image (latest deal image as a proxy).
  const conceptIds = data.map((r) => r.concept_id)
  const { data: concepts } = await sb
    .from('concept')
    .select('id, display_name')
    .in('id', conceptIds)
  const nameById = new Map((concepts ?? []).map((c) => [c.id, c.display_name as string]))

  const { data: dealImages } = await sb
    .from('deals')
    .select('id, image_url')
    .in('id', data.map((r) => r.deal_id))
  const imageByDealId = new Map((dealImages ?? []).map((d) => [d.id, d.image_url as string | null]))

  return {
    mode: 'personal',
    candidates: data.map((r) => {
      const meta = STORE_META[r.deal_store as Store]
      return {
        conceptId: r.concept_id,
        conceptName: nameById.get(r.concept_id) ?? '—',
        imageUrl: imageByDealId.get(r.deal_id) ?? null,
        storeSlug: r.deal_store,
        storeLabel: meta?.label ?? r.deal_store,
        dealPrice: r.deal_price,
        regularPrice: r.deal_regular_price ?? r.deal_price,
        discountPercent: r.discount_percent,
        contextLine: contextLineFromSignal(r.interest_signal, r.interest_added_at),
      }
    }),
  }
}

async function coldStartCandidates(
  sb: ReturnType<typeof createAnonClient>,
): Promise<WorthPickingUpCandidate[]> {
  const { data } = await sb
    .from('deals')
    .select('id, store, product_name, sale_price, original_price, discount_percent, image_url, sub_category, category_slug')
    .eq('is_active', true)
    .gte('discount_percent', 30)
    .order('discount_percent', { ascending: false })
    .limit(10)

  return (data ?? []).map((d) => {
    const meta = STORE_META[d.store as Store]
    return {
      conceptId: d.id,  // best-effort — uses deal id since cold-start has no concept link yet
      conceptName: d.product_name as string,
      imageUrl: d.image_url as string | null,
      storeSlug: d.store as string,
      storeLabel: meta?.label ?? (d.store as string),
      dealPrice: d.sale_price as number,
      regularPrice: (d.original_price as number | null) ?? (d.sale_price as number),
      discountPercent: d.discount_percent as number,
      contextLine: `Top discount in ${(d.sub_category ?? d.category_slug ?? '—').toString().replace(/-/g, ' ')} this week`,
    }
  })
}

function contextLineFromSignal(signal: string, addedAt: string): string {
  const days = Math.floor((Date.now() - new Date(addedAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days < 7) return `You ${signal === 'browsed' ? 'browsed' : 'added'} this ${days}d ago`
  if (days < 28) return `You ${signal === 'browsed' ? 'browsed' : 'added'} these ${Math.floor(days / 7)} weeks ago`
  return `You added these ${Math.floor(days / 30)} months ago — strong deal back this week`
}
