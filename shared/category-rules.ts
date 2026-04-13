// shared/category-rules.ts — Keyword-to-category mapping rules.
// Checked in order: first match wins. Default: 'long-life' (safest bucket).
// Keywords are matched against lowercase product name.
// Covers all 23 DB sub-categories used in BROWSE_CATEGORIES.

import type { Category, CategoryRule } from './types'

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
    keywords: ['fleisch', 'meat', 'rind', 'schwein', 'pork', 'hackfleisch', 'lamm', 'kalb'],
    category: 'fresh',
    subCategory: 'meat',
  },

  // ============================================================
  // Fresh > poultry
  // ============================================================
  {
    keywords: ['poulet', 'chicken', 'truthahn', 'turkey', 'geflügel'],
    category: 'fresh',
    subCategory: 'poultry',
  },

  // ============================================================
  // Fresh > deli
  // ============================================================
  {
    keywords: ['wurst', 'schinken', 'salami', 'aufschnitt', 'cervelat', 'landjäger'],
    category: 'fresh',
    subCategory: 'deli',
  },

  // ============================================================
  // Fresh > fish
  // ============================================================
  {
    keywords: ['fisch', 'fish', 'lachs', 'salmon', 'crevetten', 'shrimp', 'thon', 'forelle', 'fischstäbchen'],
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
      'champignons', 'pilze',
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
 * Match a product name against CATEGORY_RULES.
 * Returns the first matching rule's category + subCategory.
 * Falls back to { category: 'long-life', subCategory: null }.
 */
export function matchCategory(productName: string): { category: Category, subCategory: string | null } {
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
