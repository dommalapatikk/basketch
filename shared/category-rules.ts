// shared/category-rules.ts — Keyword-to-category mapping rules.
// Checked in order: first match wins. Default: 'long-life' (safest bucket).
// Keywords are matched against lowercase product name AND source category.

import type { Category, CategoryRule } from './types'

export const CATEGORY_RULES: CategoryRule[] = [
  // Fresh / short expiry — buy weekly, go where it's cheapest
  {
    keywords: [
      'gemüse', 'gemuese', 'vegetable',
      'frucht', 'früchte', 'obst', 'fruit', 'beeren', 'erdbeeren',
      'milch', 'milk', 'joghurt', 'yogurt', 'quark', 'rahm', 'sahne', 'cream',
      'käse', 'kaese', 'cheese', 'mozzarella', 'gruyère', 'emmentaler',
      'butter', 'margarine',
      'eier', 'ei', 'egg',
      'fleisch', 'meat', 'poulet', 'chicken', 'rind', 'schwein', 'pork', 'hackfleisch',
      'wurst', 'schinken', 'salami', 'aufschnitt',
      'fisch', 'fish', 'lachs', 'salmon', 'crevetten', 'shrimp',
      'brot', 'bread', 'brötchen', 'zopf', 'toast',
      'salat', 'salad', 'rucola', 'spinat',
      'tofu', 'hummus',
      'frisch', 'fresh',
    ],
    category: 'fresh',
  },

  // Non-food / household — stock up for months when discounted
  {
    keywords: [
      'waschmittel', 'waschpulver', 'detergent',
      'reinigung', 'reiniger', 'putzmittel', 'cleaning',
      'pflege', 'körperpflege',
      'hygiene', 'hygieneprodukt',
      'haushalt', 'household',
      'papier', 'toilettenpapier', 'taschentücher', 'küchenpapier', 'tempo',
      'shampoo', 'duschgel', 'shower', 'seife', 'soap',
      'zahnpasta', 'zahnbürste', 'toothpaste', 'mundwasser',
      'deodorant', 'deo',
      'windeln', 'diaper',
      'müllsack', 'abfallsack', 'garbage',
      'geschirrspüler', 'abwaschmittel', 'dish',
      'weichspüler', 'softener',
      'batterien', 'battery',
      'glühbirne', 'lampe',
      'persil', 'swiffer', 'nivea', 'elmex',
    ],
    category: 'non-food',
  },

  // Everything else falls through to 'long-life' default
  // Long shelf-life food: nuts, chocolate, pasta, rice, coffee, canned goods, drinks, snacks
  // No explicit rules needed — this is the catch-all
]

export const DEFAULT_CATEGORY: Category = 'long-life'

/**
 * Threshold for verdict tie: if scores are within this percentage, declare a tie.
 */
export const TIE_THRESHOLD = 5

/**
 * Weights for verdict calculation.
 */
export const VERDICT_WEIGHTS = {
  dealCount: 0.4,
  avgDiscount: 0.6,
} as const
