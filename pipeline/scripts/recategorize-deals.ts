// Backfill category + sub_category using three-tier matching (brand → source → keyword).
// Self-contained to avoid cross-package ESM resolution issues.
// Run with: cd pipeline && npx tsx scripts/recategorize-deals.ts

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
import { createClient } from '@supabase/supabase-js'

// ---- Inlined from shared/category-rules.ts ----

type Category = 'fresh' | 'long-life' | 'non-food'

const BRAND_CATEGORIES: Record<string, { category: Category, subCategory: string }> = {
  'zweifel': { category: 'long-life', subCategory: 'snacks' },
  'kambly': { category: 'long-life', subCategory: 'snacks' },
  'kägi': { category: 'long-life', subCategory: 'snacks' },
  'chio': { category: 'long-life', subCategory: 'snacks' },
  'pringles': { category: 'long-life', subCategory: 'snacks' },
  'farmer': { category: 'long-life', subCategory: 'snacks' },
  'lindt': { category: 'long-life', subCategory: 'chocolate' },
  'cailler': { category: 'long-life', subCategory: 'chocolate' },
  'frey': { category: 'long-life', subCategory: 'chocolate' },
  'toblerone': { category: 'long-life', subCategory: 'chocolate' },
  'milka': { category: 'long-life', subCategory: 'chocolate' },
  'halba': { category: 'long-life', subCategory: 'chocolate' },
  'ovomaltine': { category: 'long-life', subCategory: 'chocolate' },
  'kitkat': { category: 'long-life', subCategory: 'chocolate' },
  'twix': { category: 'long-life', subCategory: 'chocolate' },
  "m&m's": { category: 'long-life', subCategory: 'chocolate' },
  'mars': { category: 'long-life', subCategory: 'chocolate' },
  'snickers': { category: 'long-life', subCategory: 'chocolate' },
  'bounty': { category: 'long-life', subCategory: 'chocolate' },
  'maltesers': { category: 'long-life', subCategory: 'chocolate' },
  'oreo': { category: 'long-life', subCategory: 'snacks' },
  'emmi': { category: 'fresh', subCategory: 'dairy' },
  'activia': { category: 'fresh', subCategory: 'dairy' },
  'danonino': { category: 'fresh', subCategory: 'dairy' },
  'danone': { category: 'fresh', subCategory: 'dairy' },
  'gazi': { category: 'fresh', subCategory: 'dairy' },
  'micarna': { category: 'fresh', subCategory: 'meat' },
  'rapelli': { category: 'fresh', subCategory: 'deli' },
  'optigal': { category: 'fresh', subCategory: 'poultry' },
  'coca-cola': { category: 'long-life', subCategory: 'drinks' },
  'rivella': { category: 'long-life', subCategory: 'drinks' },
  'aproz': { category: 'long-life', subCategory: 'drinks' },
  'nespresso': { category: 'long-life', subCategory: 'coffee-tea' },
  'barilla': { category: 'long-life', subCategory: 'pasta-rice' },
  'gala': { category: 'long-life', subCategory: 'pasta-rice' },
  'persil': { category: 'non-food', subCategory: 'laundry' },
  'swiffer': { category: 'non-food', subCategory: 'cleaning' },
  'calgon': { category: 'non-food', subCategory: 'cleaning' },
  'plenty': { category: 'non-food', subCategory: 'paper-goods' },
  'nivea': { category: 'non-food', subCategory: 'personal-care' },
  'elmex': { category: 'non-food', subCategory: 'personal-care' },
  'colgate': { category: 'non-food', subCategory: 'personal-care' },
  'dove': { category: 'non-food', subCategory: 'personal-care' },
}

const SOURCE_CATEGORY_MAP: Record<string, { category: Category, subCategory: string }> = {
  'fleisch & fisch': { category: 'fresh', subCategory: 'meat' },
  'früchte & gemüse': { category: 'fresh', subCategory: 'fruit' },
  'milchprodukte, eier & frische fertiggerichte': { category: 'fresh', subCategory: 'dairy' },
  'brot, backwaren & frühstück': { category: 'fresh', subCategory: 'bread' },
  'getränke, kaffee & tee': { category: 'long-life', subCategory: 'drinks' },
  'tiefkühlprodukte': { category: 'long-life', subCategory: 'frozen' },
  'waschen & putzen': { category: 'non-food', subCategory: 'cleaning' },
  'haushalt & wohnen': { category: 'non-food', subCategory: 'household' },
  'chips & snacks': { category: 'long-life', subCategory: 'snacks' },
  'butter & margarine': { category: 'fresh', subCategory: 'dairy' },
  'milchgetränke': { category: 'fresh', subCategory: 'dairy' },
  'softdrinks': { category: 'long-life', subCategory: 'drinks' },
}

interface Rule { keywords: string[], category: Category, subCategory?: string }
const RULES: Rule[] = [
  { keywords: ['milch', 'milk', 'joghurt', 'yogurt', 'quark', 'rahm', 'sahne', 'cream'], category: 'fresh', subCategory: 'dairy' },
  { keywords: ['käse', 'kaese', 'cheese', 'mozzarella', 'gruyère', 'emmentaler', 'feta'], category: 'fresh', subCategory: 'dairy' },
  { keywords: ['butter', 'margarine'], category: 'fresh', subCategory: 'dairy' },
  { keywords: ['eier', 'egg'], category: 'fresh', subCategory: 'eggs' },
  { keywords: ['fleisch', 'meat', 'rind', 'schwein', 'pork', 'hackfleisch', 'lamm', 'kalb', 'steak', 'entrecôte', 'geschnetzeltes', 'braten', 'ragout', 'gulasch', 'rindsfilet', 'schweinsfilet'], category: 'fresh', subCategory: 'meat' },
  { keywords: ['poulet', 'chicken', 'truthahn', 'turkey', 'geflügel', 'pouletbrust', 'pouletfilet', 'pouletflügel'], category: 'fresh', subCategory: 'poultry' },
  { keywords: ['wurst', 'schinken', 'salami', 'aufschnitt', 'cervelat', 'landjäger', 'wienerli', 'bratwurst', 'kalbsbratwurst', 'speck', 'pancetta', 'coppa', 'bresaola', 'bündnerfleisch', 'mostbröckli', 'trockenfleisch', 'lyoner'], category: 'fresh', subCategory: 'deli' },
  { keywords: ['fisch', 'fish', 'lachs', 'salmon', 'crevetten', 'shrimp', 'thon', 'forelle', 'fischstäbchen', 'lachsfilet', 'lachsrücken', 'pangasius', 'kabeljau', 'dorsch', 'garnelen'], category: 'fresh', subCategory: 'fish' },
  { keywords: ['brot', 'bread', 'brötchen', 'zopf', 'toast', 'naan', 'ciabatta', 'focaccia'], category: 'fresh', subCategory: 'bread' },
  { keywords: ['gemüse', 'gemuese', 'vegetable', 'tomaten', 'zwiebeln', 'kartoffeln', 'knoblauch', 'ingwer', 'spinat', 'peperoni', 'zucchetti', 'aubergine', 'gurke', 'karotten', 'rüebli', 'champignons', 'pilze', 'salat', 'salad', 'rucola'], category: 'fresh', subCategory: 'vegetables' },
  { keywords: ['frucht', 'früchte', 'obst', 'fruit', 'beeren', 'erdbeeren', 'bananen', 'äpfel', 'apfel', 'himbeeren', 'heidelbeeren', 'trauben', 'orangen', 'zitronen', 'mango', 'ananas', 'kiwi', 'birnen'], category: 'fresh', subCategory: 'fruit' },
  { keywords: ['tofu', 'hummus', 'fertiggericht', 'convenience'], category: 'fresh', subCategory: 'ready-meals' },
  { keywords: ['tiefkühl', 'tiefkuehl', 'frozen', 'glacé', 'glace', 'tiefkühlpizza', 'eiscreme'], category: 'long-life', subCategory: 'frozen' },
  { keywords: ['pasta', 'spaghetti', 'penne', 'fusilli', 'nudeln', 'teigwaren', 'reis', 'risotto', 'müesli', 'müsli', 'cornflakes', 'haferflocken', 'mehl'], category: 'long-life', subCategory: 'pasta-rice' },
  { keywords: ['wasser', 'mineralwasser', 'saft', 'juice', 'limonade', 'cola', 'bier', 'beer', 'wein', 'wine', 'prosecco', 'sirup', 'eistee', 'energy', 'rivella'], category: 'long-life', subCategory: 'drinks' },
  { keywords: ['kaffee', 'coffee', 'espresso', 'nespresso', 'tee', 'tea', 'kakao', 'ovomaltine'], category: 'long-life', subCategory: 'coffee-tea' },
  { keywords: ['chips', 'snack', 'nüsse', 'nuss', 'erdnüsse', 'cashew', 'mandeln', 'zweifel', 'popcorn', 'cracker', 'guetzli', 'kekse', 'biscuit'], category: 'long-life', subCategory: 'snacks' },
  { keywords: ['schokolade', 'chocolate', 'praline', 'lindt', 'toblerone', 'branches', 'riegel', 'cailler'], category: 'long-life', subCategory: 'chocolate' },
  { keywords: ['dose', 'büchse', 'konserve', 'canned', 'thunfisch', 'tuna', 'pelati', 'tomatenmark', 'tomatenpüree', 'kokosmilch', 'kichererbsen', 'linsen', 'bohnen', 'mais', 'oliven'], category: 'long-life', subCategory: 'canned' },
  { keywords: ['ketchup', 'senf', 'mustard', 'mayonnaise', 'mayo', 'essig', 'vinegar', 'öl', 'olivenöl', 'rapsöl', 'sauce', 'sojasauce', 'gewürz', 'spice', 'salz', 'pfeffer', 'zucker', 'honig', 'konfitüre', 'marmelade'], category: 'long-life', subCategory: 'condiments' },
  { keywords: ['waschmittel', 'waschpulver', 'detergent', 'weichspüler', 'softener', 'persil'], category: 'non-food', subCategory: 'laundry' },
  { keywords: ['reinigung', 'reiniger', 'putzmittel', 'cleaning', 'geschirrspüler', 'abwaschmittel', 'dish', 'swiffer'], category: 'non-food', subCategory: 'cleaning' },
  { keywords: ['pflege', 'körperpflege', 'hygiene', 'hygieneprodukt', 'shampoo', 'duschgel', 'shower', 'seife', 'soap', 'zahnpasta', 'zahnbürste', 'toothpaste', 'mundwasser', 'deodorant', 'deo', 'nivea', 'elmex'], category: 'non-food', subCategory: 'personal-care' },
  { keywords: ['papier', 'toilettenpapier', 'taschentücher', 'küchenpapier', 'tempo'], category: 'non-food', subCategory: 'paper-goods' },
  { keywords: ['haushalt', 'household', 'windeln', 'diaper', 'müllsack', 'abfallsack', 'garbage', 'batterien', 'battery', 'glühbirne', 'lampe'], category: 'non-food', subCategory: 'household' },
]

function matchKeywords(name: string): { category: Category, subCategory: string | null } {
  const lower = name.toLowerCase()
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return { category: rule.category, subCategory: rule.subCategory ?? null }
    }
  }
  return { category: 'long-life', subCategory: null }
}

function categorize(productName: string, sourceCategory: string | null): { category: Category, subCategory: string | null } {
  const lower = productName.toLowerCase()
  // Tier 1: Brand
  const brands = Object.keys(BRAND_CATEGORIES).sort((a, b) => b.length - a.length)
  for (const brand of brands) {
    if (lower.includes(brand)) return BRAND_CATEGORIES[brand]!
  }
  // Tier 2: Source category
  if (sourceCategory) {
    const srcLower = sourceCategory.toLowerCase()
    if (SOURCE_CATEGORY_MAP[srcLower]) return SOURCE_CATEGORY_MAP[srcLower]
    const srcKw = matchKeywords(sourceCategory)
    if (srcKw.subCategory) return srcKw
  }
  // Tier 3: Keywords
  return matchKeywords(productName)
}

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
    const result = categorize(deal.product_name, deal.source_category)
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
