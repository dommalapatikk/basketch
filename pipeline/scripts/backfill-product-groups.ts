// One-time backfill: assign product_group and product_form to all existing products.
// Run with: cd pipeline && npx tsx scripts/backfill-product-groups.ts

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

import { assignProductGroup } from '../product-group-assign'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function backfill() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, source_name, product_group, product_form')

  if (error || !products) {
    console.error('[backfill] Failed to fetch products:', error?.message)
    process.exit(1)
  }

  console.log(`[backfill] Found ${products.length} products`)

  let assigned = 0
  let skipped = 0

  for (const product of products) {
    // Skip if already has a group
    if (product.product_group) {
      skipped++
      continue
    }

    const groupResult = assignProductGroup(product.source_name)
    if (!groupResult) {
      skipped++
      continue
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({
        product_group: groupResult.groupId,
        product_form: groupResult.productForm,
      })
      .eq('id', product.id)

    if (updateError) {
      console.error(`[backfill] Failed to update ${product.source_name}:`, updateError.message)
    } else {
      assigned++
    }
  }

  console.log(`[backfill] Assigned: ${assigned}, Skipped: ${skipped}`)
}

backfill().catch((err) => {
  console.error('[backfill] Error:', err)
  process.exit(1)
})
