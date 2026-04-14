// Backfill category + sub_category using three-tier matching (brand → source → keyword).
// Imports from shared/category-rules.ts — single source of truth.
// Run with: cd basketch && npx tsx pipeline/scripts/recategorize-deals.ts
//       or: cd pipeline && npx tsx scripts/recategorize-deals.ts

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

import { createClient } from '@supabase/supabase-js'
import { matchCategory } from '../../shared/category-rules'

// ---- Script ----

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function backfill() {
  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, product_name, category, sub_category, source_category')
    .eq('is_active', true)

  if (error || !deals) {
    console.error('[backfill] Failed:', error?.message)
    process.exit(1)
  }

  console.log(`[backfill] Found ${deals.length} active deals`)

  let updated = 0
  let unchanged = 0
  const updates: { id: string, category: string, sub_category: string | null }[] = []

  for (const deal of deals) {
    const result = matchCategory(deal.product_name, deal.source_category)
    if (deal.category !== result.category || deal.sub_category !== result.subCategory) {
      updates.push({ id: deal.id, category: result.category, sub_category: result.subCategory })
    } else {
      unchanged++
    }
  }

  console.log(`[backfill] ${updates.length} need updating, ${unchanged} correct`)

  if (updates.length > 0) {
    console.log('\nSample:')
    for (const u of updates.slice(0, 30)) {
      const d = deals.find((x) => x.id === u.id)!
      console.log(`  ${d.product_name.slice(0, 45).padEnd(45)} ${d.category}/${d.sub_category} -> ${u.category}/${u.sub_category}`)
    }
    if (updates.length > 30) console.log(`  ... and ${updates.length - 30} more`)
  }

  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100)
    for (const u of batch) {
      const { error: err } = await supabase
        .from('deals')
        .update({ category: u.category, sub_category: u.sub_category })
        .eq('id', u.id)
      if (err) console.error(`  Failed ${u.id}:`, err.message)
      else updated++
    }
    console.log(`[backfill] ${Math.min(i + 100, updates.length)}/${updates.length}`)
  }

  console.log(`\nDone: ${updated} updated, ${unchanged} unchanged`)
}

backfill().catch((e) => { console.error('Fatal:', e); process.exit(1) })
