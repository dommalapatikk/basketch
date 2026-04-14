// shared/category-rules.ts — Product categorization rules.
// Three-tier matching: brand → source category → keyword fallback.
// Brand matching is highest confidence (zero false positives).
// Keywords are the last resort for products with no brand or source category.

import type { Category, CategoryRule } from './types'

// ============================================================
// Tier 1: Brand → category + sub-category (definitive match)
// ============================================================

export interface BrandCategory {
  category: Category
  subCategory: string
}

/** Map brand name (lowercase) to category. Highest confidence — no false positives. */
export const BRAND_CATEGORIES: Record<string, BrandCategory> = {
  // Snack brands
  'zweifel': { category: 'long-life', subCategory: 'snacks' },
  'kambly': { category: 'long-life', subCategory: 'snacks' },
  'kägi': { category: 'long-life', subCategory: 'snacks' },
  'chio': { category: 'long-life', subCategory: 'snacks' },
  'pringles': { category: 'long-life', subCategory: 'snacks' },
  'farmer': { category: 'long-life', subCategory: 'snacks' },
  // Chocolate brands
  'lindt': { category: 'long-life', subCategory: 'chocolate' },
  'cailler': { category: 'long-life', subCategory: 'chocolate' },
  'frey': { category: 'long-life', subCategory: 'chocolate' },
  'toblerone': { category: 'long-life', subCategory: 'chocolate' },
  'milka': { category: 'long-life', subCategory: 'chocolate' },
  'halba': { category: 'long-life', subCategory: 'chocolate' },
  'ovomaltine': { category: 'long-life', subCategory: 'chocolate' },
  'kitkat': { category: 'long-life', subCategory: 'chocolate' },
  'twix': { category: 'long-life', subCategory: 'chocolate' },
  'm&m\'s': { category: 'long-life', subCategory: 'chocolate' },
  'mars': { category: 'long-life', subCategory: 'chocolate' },
  'snickers': { category: 'long-life', subCategory: 'chocolate' },
  'bounty': { category: 'long-life', subCategory: 'chocolate' },
  'maltesers': { category: 'long-life', subCategory: 'chocolate' },
  'oreo': { category: 'long-life', subCategory: 'snacks' },
  // Dairy brands
  'emmi': { category: 'fresh', subCategory: 'dairy' },
  'activia': { category: 'fresh', subCategory: 'dairy' },
  'danonino': { category: 'fresh', subCategory: 'dairy' },
  'danone': { category: 'fresh', subCategory: 'dairy' },
  'gazi': { category: 'fresh', subCategory: 'dairy' },
  // Meat/deli brands
  'micarna': { category: 'fresh', subCategory: 'meat' },
  'rapelli': { category: 'fresh', subCategory: 'deli' },
  'optigal': { category: 'fresh', subCategory: 'poultry' },
  // Drinks brands
  'coca-cola': { category: 'long-life', subCategory: 'drinks' },
  'rivella': { category: 'long-life', subCategory: 'drinks' },
  'aproz': { category: 'long-life', subCategory: 'drinks' },
  // Coffee/tea brands
  'nespresso': { category: 'long-life', subCategory: 'coffee-tea' },
  'nestea': { category: 'long-life', subCategory: 'drinks' },
  'lavazza': { category: 'long-life', subCategory: 'coffee-tea' },
  'tchibo': { category: 'long-life', subCategory: 'coffee-tea' },
  'la semeuse': { category: 'long-life', subCategory: 'coffee-tea' },
  // Pasta brands
  'barilla': { category: 'long-life', subCategory: 'pasta-rice' },
  'gala 3-eier': { category: 'long-life', subCategory: 'pasta-rice' },
  // Cleaning/household brands
  'persil': { category: 'non-food', subCategory: 'laundry' },
  'swiffer': { category: 'non-food', subCategory: 'cleaning' },
  'calgon': { category: 'non-food', subCategory: 'cleaning' },
  'plenty': { category: 'non-food', subCategory: 'paper-goods' },
  // Personal care brands
  'nivea': { category: 'non-food', subCategory: 'personal-care' },
  'elmex': { category: 'non-food', subCategory: 'personal-care' },
  'colgate': { category: 'non-food', subCategory: 'personal-care' },
  'dove': { category: 'non-food', subCategory: 'personal-care' },
}

// ============================================================
// Tier 2: Source category → category + sub-category (Migros API)
// ============================================================

/** Map Migros source category labels to our taxonomy. */
export const SOURCE_CATEGORY_MAP: Record<string, BrandCategory> = {
  // 'fleisch & fisch' intentionally omitted — too broad (covers meat, poultry, fish, deli).
  // Let keyword matching handle sub-category assignment for this source category.
  'früchte & gemüse': { category: 'fresh', subCategory: 'fruit' },
  'milchprodukte, eier & frische fertiggerichte': { category: 'fresh', subCategory: 'dairy' },
  'brot, backwaren & frühstück': { category: 'fresh', subCategory: 'bread' },
  'getränke, kaffee & tee': { category: 'long-life', subCategory: 'drinks' },
  'tiefkühlprodukte': { category: 'long-life', subCategory: 'frozen' },
  'waschen & putzen': { category: 'non-food', subCategory: 'cleaning' },
  'haushalt & wohnen': { category: 'non-food', subCategory: 'household' },
  'körperpflege & kosmetik': { category: 'non-food', subCategory: 'personal-care' },
  'süsswaren & snacks': { category: 'long-life', subCategory: 'snacks' },
  'teigwaren & fertiggerichte': { category: 'long-life', subCategory: 'pasta-rice' },
  'konserven & fertigprodukte': { category: 'long-life', subCategory: 'canned' },
  'öle, saucen & gewürze': { category: 'long-life', subCategory: 'condiments' },
  'baby': { category: 'non-food', subCategory: 'household' },
  'chips & snacks': { category: 'long-life', subCategory: 'snacks' },
  'butter & margarine': { category: 'fresh', subCategory: 'dairy' },
  'milchgetränke': { category: 'fresh', subCategory: 'dairy' },
  'softdrinks': { category: 'long-life', subCategory: 'drinks' },
  // Test/generic source categories
  'frische milchprodukte': { category: 'fresh', subCategory: 'dairy' },
  'haushalt & putzmittel': { category: 'non-food', subCategory: 'cleaning' },
}

export const CATEGORY_RULES: CategoryRule[] = [
  // ============================================================
  // Fresh > dairy
  // ============================================================
  {
    keywords: ['milch', 'milk', 'joghurt', 'yogurt', 'quark', 'rahm', 'sahne', 'cream'],
    category: 'fresh',
    subCategory: 'dairy',
  },
  {
    keywords: ['käse', 'kaese', 'cheese', 'mozzarella', 'gruyère', 'emmentaler', 'feta'],
    category: 'fresh',
    subCategory: 'dairy',
  },
  {
    keywords: ['butter', 'margarine'],
    category: 'fresh',
    subCategory: 'dairy',
  },

  // ============================================================
  // Fresh > eggs
  // ============================================================
  {
    keywords: ['eier', 'egg'],
    category: 'fresh',
    subCategory: 'eggs',
  },

  // ============================================================
  // Fresh > meat
  // ============================================================
  {
    keywords: ['fleisch', 'meat', 'rind', 'schwein', 'pork', 'hackfleisch', 'lamm', 'kalb', 'steak', 'entrecôte', 'geschnetzeltes', 'braten', 'ragout', 'gulasch', 'rindsfilet', 'schweinsfilet'],
    category: 'fresh',
    subCategory: 'meat',
  },

  // ============================================================
  // Fresh > poultry
  // ============================================================
  {
    keywords: ['poulet', 'chicken', 'truthahn', 'turkey', 'geflügel', 'pouletbrust', 'pouletfilet', 'pouletflügel'],
    category: 'fresh',
    subCategory: 'poultry',
  },

  // ============================================================
  // Fresh > deli
  // ============================================================
  {
    keywords: ['wurst', 'schinken', 'salami', 'aufschnitt', 'cervelat', 'landjäger', 'wienerli', 'bratwurst', 'kalbsbratwurst', 'speck', 'pancetta', 'coppa', 'bresaola', 'bündnerfleisch', 'mostbröckli', 'trockenfleisch', 'lyoner'],
    category: 'fresh',
    subCategory: 'deli',
  },

  // ============================================================
  // Fresh > fish
  // ============================================================
  {
    keywords: ['fisch', 'fish', 'lachs', 'salmon', 'crevetten', 'shrimp', 'thon', 'forelle', 'fischstäbchen', 'lachsfilet', 'lachsrücken', 'pangasius', 'kabeljau', 'dorsch', 'garnelen'],
    category: 'fresh',
    subCategory: 'fish',
  },

  // ============================================================
  // Fresh > bread
  // ============================================================
  {
    keywords: ['brot', 'bread', 'brötchen', 'zopf', 'toast', 'naan', 'ciabatta', 'focaccia'],
    category: 'fresh',
    subCategory: 'bread',
  },

  // ============================================================
  // Fresh > vegetables
  // ============================================================
  {
    keywords: [
      'gemüse', 'gemuese', 'vegetable',
      'tomaten', 'zwiebeln', 'kartoffeln', 'knoblauch', 'ingwer',
      'spinat', 'peperoni', 'zucchetti', 'aubergine', 'gurke', 'karotten', 'rüebli',
      'champignons', 'pilze', 'spargeln', 'spargel', 'erbsen',
      'fenchel', 'lauch', 'sellerie', 'blumenkohl', 'brokkoli', 'broccoli',
      'salat', 'salad', 'rucola',
    ],
    category: 'fresh',
    subCategory: 'vegetables',
  },

  // ============================================================
  // Fresh > fruit
  // ============================================================
  {
    keywords: [
      'frucht', 'früchte', 'obst', 'fruit', 'beeren', 'erdbeeren',
      'bananen', 'äpfel', 'apfel', 'himbeeren', 'heidelbeeren',
      'trauben', 'orangen', 'zitronen', 'mango', 'ananas', 'kiwi', 'birnen',
      'datteln', 'feigen', 'melone', 'nektarinen', 'pfirsich', 'aprikosen', 'zwetschgen', 'kirschen',
    ],
    category: 'fresh',
    subCategory: 'fruit',
  },

  // ============================================================
  // Fresh > ready-meals
  // ============================================================
  {
    keywords: ['tofu', 'hummus', 'fertiggericht', 'convenience'],
    category: 'fresh',
    subCategory: 'ready-meals',
  },

  // ============================================================
  // Long-life > frozen
  // ============================================================
  {
    keywords: ['tiefkühl', 'tiefkuehl', 'frozen', 'glacé', 'glace', 'tiefkühlpizza', 'eiscreme'],
    category: 'long-life',
    subCategory: 'frozen',
  },

  // ============================================================
  // Long-life > pasta-rice
  // ============================================================
  {
    keywords: ['pasta', 'spaghetti', 'penne', 'fusilli', 'nudeln', 'teigwaren', 'reis', 'risotto', 'müesli', 'müsli', 'cornflakes', 'haferflocken', 'mehl'],
    category: 'long-life',
    subCategory: 'pasta-rice',
  },

  // ============================================================
  // Long-life > drinks
  // ============================================================
  {
    keywords: ['wasser', 'mineralwasser', 'saft', 'juice', 'limonade', 'cola', 'bier', 'beer', 'wein', 'wine', 'prosecco', 'sirup', 'eistee', 'energy', 'rivella'],
    category: 'long-life',
    subCategory: 'drinks',
  },

  // ============================================================
  // Long-life > coffee-tea
  // ============================================================
  {
    keywords: ['kaffee', 'coffee', 'espresso', 'nespresso', 'tee', 'tea', 'kakao', 'ovomaltine'],
    category: 'long-life',
    subCategory: 'coffee-tea',
  },

  // ============================================================
  // Long-life > snacks
  // ============================================================
  {
    keywords: ['chips', 'snack', 'nüsse', 'nuss', 'erdnüsse', 'cashew', 'mandeln', 'zweifel', 'popcorn', 'cracker', 'guetzli', 'kekse', 'biscuit'],
    category: 'long-life',
    subCategory: 'snacks',
  },

  // ============================================================
  // Long-life > chocolate
  // ============================================================
  {
    keywords: ['schokolade', 'chocolate', 'praline', 'lindt', 'toblerone', 'branches', 'riegel', 'cailler'],
    category: 'long-life',
    subCategory: 'chocolate',
  },

  // ============================================================
  // Long-life > canned
  // ============================================================
  {
    keywords: ['dose', 'büchse', 'konserve', 'canned', 'thunfisch', 'tuna', 'pelati', 'tomatenmark', 'tomatenpüree', 'kokosmilch', 'kichererbsen', 'linsen', 'bohnen', 'mais', 'oliven'],
    category: 'long-life',
    subCategory: 'canned',
  },

  // ============================================================
  // Long-life > condiments
  // ============================================================
  {
    keywords: ['ketchup', 'senf', 'mustard', 'mayonnaise', 'mayo', 'essig', 'vinegar', 'öl', 'olivenöl', 'rapsöl', 'sauce', 'sojasauce', 'gewürz', 'spice', 'salz', 'pfeffer', 'zucker', 'honig', 'konfitüre', 'marmelade'],
    category: 'long-life',
    subCategory: 'condiments',
  },

  // ============================================================
  // Non-food > laundry
  // ============================================================
  {
    keywords: ['waschmittel', 'waschpulver', 'detergent', 'weichspüler', 'softener', 'persil'],
    category: 'non-food',
    subCategory: 'laundry',
  },

  // ============================================================
  // Non-food > cleaning
  // ============================================================
  {
    keywords: ['reinigung', 'reiniger', 'putzmittel', 'cleaning', 'geschirrspüler', 'abwaschmittel', 'dish', 'swiffer'],
    category: 'non-food',
    subCategory: 'cleaning',
  },

  // ============================================================
  // Non-food > personal-care
  // ============================================================
  {
    keywords: [
      'pflege', 'körperpflege', 'hygiene', 'hygieneprodukt',
      'shampoo', 'duschgel', 'shower', 'seife', 'soap',
      'zahnpasta', 'zahnbürste', 'toothpaste', 'mundwasser',
      'deodorant', 'deo', 'nivea', 'elmex',
    ],
    category: 'non-food',
    subCategory: 'personal-care',
  },

  // ============================================================
  // Non-food > paper-goods
  // ============================================================
  {
    keywords: ['papier', 'toilettenpapier', 'taschentücher', 'küchenpapier', 'tempo'],
    category: 'non-food',
    subCategory: 'paper-goods',
  },

  // ============================================================
  // Non-food > household
  // ============================================================
  {
    keywords: [
      'haushalt', 'household', 'windeln', 'diaper',
      'müllsack', 'abfallsack', 'garbage',
      'batterien', 'battery', 'glühbirne', 'lampe',
    ],
    category: 'non-food',
    subCategory: 'household',
  },

  // Everything that does not match falls through to DEFAULT_CATEGORY + null sub-category
]

export const DEFAULT_CATEGORY: Category = 'long-life'

/** Verdict formula weights: 40% deal count + 60% avg discount depth. */
export const VERDICT_WEIGHTS = {
  dealCount: 0.4,
  avgDiscount: 0.6,
} as const

/**
 * Extract brand from product name for category lookup.
 * Checks BRAND_CATEGORIES keys against lowercase product name.
 */
function matchBrand(productName: string): BrandCategory | null {
  const lower = productName.toLowerCase()
  // Check longest brand names first to avoid partial matches (e.g., "m&m's" before "m")
  const brands = Object.keys(BRAND_CATEGORIES).sort((a, b) => b.length - a.length)
  for (const brand of brands) {
    if (lower.includes(brand)) {
      return BRAND_CATEGORIES[brand]!
    }
  }
  return null
}

/**
 * Match a source category string against the explicit map only.
 * Does NOT fall back to keyword matching — source categories like "Fleisch & Fisch"
 * are too broad for keyword matching (would always hit the first keyword).
 */
function matchSourceCategory(sourceCategory: string | null): BrandCategory | null {
  if (!sourceCategory) return null
  const lower = sourceCategory.toLowerCase()
  return SOURCE_CATEGORY_MAP[lower] ?? null
}

/**
 * Match a product name against keyword rules (Tier 3 fallback).
 */
function matchKeywords(productName: string): { category: Category, subCategory: string | null } {
  const lower = productName.toLowerCase()

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return {
          category: rule.category,
          subCategory: rule.subCategory ?? null,
        }
      }
    }
  }

  return { category: DEFAULT_CATEGORY, subCategory: null }
}

/**
 * Three-tier product categorization:
 * 1. Brand match (highest confidence — definitive)
 * 2. Source category match (from Migros API — high confidence)
 * 3. Keyword match on product name (fallback — lowest confidence)
 */
export function matchCategory(
  productName: string,
  sourceCategory?: string | null,
): { category: Category, subCategory: string | null } {
  // Tier 1: Brand match
  const brandMatch = matchBrand(productName)
  if (brandMatch) return brandMatch

  // Tier 2: Source category match
  const sourceMatch = matchSourceCategory(sourceCategory ?? null)
  if (sourceMatch) return sourceMatch

  // Tier 3: Keyword fallback
  return matchKeywords(productName)
}
