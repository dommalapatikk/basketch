// One-shot fix for the 5 dairy-miscategorised deals the PM flagged on
// 2026-04-27. Re-tags each row's sub_category / category / category_slug, and
// inserts concept_resolver rules so future pipeline runs catch the same
// patterns automatically.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// Mapping: sub_category → category + category_slug + type ('category' on deals)
const SUBCAT_TO_CHAIN: Record<string, { category: string; category_slug: string }> = {
  cookies: { category: 'long-life', category_slug: 'snacks-sweets' },
  wine:    { category: 'long-life', category_slug: 'drinks' },
  pasta:   { category: 'long-life', category_slug: 'pasta-rice-grains' },
}

// Pattern → target sub_category. These become concept_resolver rules AND
// drive the one-shot UPDATE for any matching active deal currently mistagged
// as dairy/something-wrong. 'priority' is asc (lower = fires first).
const RULES: { pattern: string; sub_category: string; priority: number; reason: string }[] = [
  // Cookies / biscuits — keyword 'milch' inside 'milchschokolade' falsely matched dairy.
  { pattern: 'milchschokolade',  sub_category: 'cookies', priority: 10, reason: 'milchschokolade is chocolate, not dairy' },
  { pattern: 'butterherzli',     sub_category: 'cookies', priority: 10, reason: 'butterherzli are biscuits, not butter' },
  { pattern: 'petit beurre',     sub_category: 'cookies', priority: 10, reason: 'petit beurre are biscuits' },
  { pattern: 'guezli',           sub_category: 'cookies', priority: 15, reason: 'guezli = small cookies' },
  { pattern: 'prussiens',        sub_category: 'cookies', priority: 10, reason: 'prussiens = puff-pastry biscuits' },

  // Wine — many wine names have geographical / appellation strings that lookalike.
  { pattern: 'côtes du',         sub_category: 'wine', priority: 10, reason: 'côtes du Rhône = French red wine' },
  { pattern: 'cabernet',         sub_category: 'wine', priority: 10, reason: 'cabernet = wine grape' },
  { pattern: 'merlot',           sub_category: 'wine', priority: 10, reason: 'merlot = wine grape' },
  { pattern: 'rioja',            sub_category: 'wine', priority: 10, reason: 'rioja = wine region' },
  { pattern: 'gewürztraminer',   sub_category: 'wine', priority: 10, reason: 'gewürztraminer = wine grape' },

  // Pasta — ricotta keyword falsely matched dairy.
  { pattern: 'tortelloni',       sub_category: 'pasta', priority: 10, reason: 'tortelloni is pasta even with ricotta filling' },
  { pattern: 'tortellini',       sub_category: 'pasta', priority: 10, reason: 'tortellini is pasta' },
  { pattern: 'ravioli',          sub_category: 'pasta', priority: 10, reason: 'ravioli is pasta' },
]

async function ensureConceptFamilies() {
  // Concept_family rows must exist for the corrected sub_categories.
  const slugs = Array.from(new Set(RULES.map((r) => r.sub_category)))
  const { data: existing } = await supabase.from('concept_family').select('slug').in('slug', slugs)
  const have = new Set((existing ?? []).map((r) => r.slug))
  const missing = slugs.filter((s) => !have.has(s)).map((slug) => ({
    slug,
    display_name: slug.charAt(0).toUpperCase() + slug.slice(1),
    category_slug: SUBCAT_TO_CHAIN[slug]?.category_slug ?? null,
    subcategory_slug: null,
    in_starter_pack: false,
    sort_order: 0,
  }))
  if (missing.length > 0) {
    const { error } = await supabase.from('concept_family').upsert(missing, { onConflict: 'slug', ignoreDuplicates: true })
    if (error) throw error
    console.log(`  ensured ${missing.length} new concept_family rows: ${missing.map((m) => m.slug).join(', ')}`)
  } else {
    console.log('  all target concept_family rows already exist')
  }
}

async function fixActiveDeals() {
  let totalFixed = 0
  for (const rule of RULES) {
    // Find active deals matching this pattern that are NOT already in the right sub_category.
    const { data: deals } = await supabase
      .from('deals')
      .select('id, product_name, sub_category, category, category_slug')
      .eq('is_active', true)
      .ilike('product_name', `%${rule.pattern}%`)
    if (!deals || deals.length === 0) continue

    const targetChain = SUBCAT_TO_CHAIN[rule.sub_category]
    const toUpdate = deals.filter((d) => d.sub_category !== rule.sub_category)
    if (toUpdate.length === 0) continue

    for (const d of toUpdate) {
      const { error } = await supabase
        .from('deals')
        .update({
          sub_category: rule.sub_category,
          category: targetChain?.category ?? d.category,
          category_slug: targetChain?.category_slug ?? d.category_slug,
        })
        .eq('id', d.id)
      if (error) {
        console.error(`  failed to update ${d.id}: ${error.message}`)
        continue
      }
      console.log(`  fixed: "${d.product_name}" → ${rule.sub_category}`)
      totalFixed++
    }
  }
  console.log(`  total deals re-tagged: ${totalFixed}`)
}

async function insertResolverRules() {
  // Insert concept_resolver rules so future pipeline runs catch these
  // patterns. concept_id is left NULL — the rule's job here is to STEER the
  // categoriser via sub_category, not to point to a specific concept. The
  // ingestion-time resolver looks at sub_category first, then concept.
  // Idempotent: ON CONFLICT DO NOTHING via unique-ish (rule_type, pattern).
  const rows = RULES.map((r) => ({
    rule_type: 'contains' as const,
    pattern: r.pattern,
    concept_id: null,
    priority: r.priority,
    is_active: true,
    reason: r.reason,
    created_by: 'fix-dairy-miscategorisation 2026-04-27',
  }))
  // No unique constraint on (rule_type, pattern) — but we can dedup by checking first.
  const { data: existing } = await supabase
    .from('concept_resolver')
    .select('rule_type, pattern')
    .in('pattern', rows.map((r) => r.pattern))
  const haveSet = new Set((existing ?? []).map((r) => `${r.rule_type}|${r.pattern}`))
  const toInsert = rows.filter((r) => !haveSet.has(`${r.rule_type}|${r.pattern}`))
  if (toInsert.length === 0) {
    console.log('  resolver rules already in place')
    return
  }
  const { error } = await supabase.from('concept_resolver').insert(toInsert)
  if (error) throw error
  console.log(`  inserted ${toInsert.length} concept_resolver rules`)
}

async function refreshMvs() {
  for (const view of ['concept_cheapest_now', 'worth_picking_up_candidates']) {
    const { error } = await supabase.rpc('exec_refresh_mv', { view_name: view })
    if (error) console.error(`  failed to refresh ${view}: ${error.message}`)
    else console.log(`  refreshed ${view}`)
  }
}

async function main() {
  console.log('fix-dairy-miscategorisation — starting')
  console.log('1/4  ensuring concept_family rows…')
  await ensureConceptFamilies()
  console.log('2/4  fixing active deals…')
  await fixActiveDeals()
  console.log('3/4  inserting concept_resolver rules…')
  await insertResolverRules()
  console.log('4/4  refreshing materialised views…')
  await refreshMvs()
  console.log('done.')
}

main().catch((err) => {
  console.error('failed:', err)
  process.exit(1)
})
