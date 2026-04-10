// shared/category-rules.ts — Keyword-to-category mapping rules.
// Checked in order: first match wins. Default: 'long-life' (safest bucket).
// Keywords are matched against lowercase product name AND source category.

import type { Category, CategoryRule } from './types'

export const CATEGORY_RULES: CategoryRule[] = [
  // Fresh > dairy
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
  // Fresh > eggs
  {
    keywords: ['eier', 'egg'],
    category: 'fresh',
    subCategory: 'eggs',
  },
  // Fresh > meat
  {
    keywords: ['fleisch', 'meat', 'rind', 'schwein', 'pork', 'hackfleisch'],
    category: 'fresh',
    subCategory: 'meat',
  },
  // Fresh > poultry
  {
    keywords: ['poulet', 'chicken'],
    category: 'fresh',
    subCategory: 'poultry',
  },
  // Fresh > deli
  {
    keywords: ['wurst', 'schinken', 'salami', 'aufschnitt'],
    category: 'fresh',
    subCategory: 'deli',
  },
  // Fresh > fish
  {
    keywords: ['fisch', 'fish', 'lachs', 'salmon', 'crevetten', 'shrimp'],
    category: 'fresh',
    subCategory: 'fish',
  },
  // Fresh > bread
  {
    keywords: ['brot', 'bread', 'brötchen', 'zopf', 'toast', 'naan'],
    category: 'fresh',
    subCategory: 'bread',
  },
  // Fresh > vegetables
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
  // Fresh > fruit
  {
    keywords: [
      'frucht', 'früchte', 'obst', 'fruit', 'beeren', 'erdbeeren',
      'bananen', 'äpfel', 'apfel', 'himbeeren', 'heidelbeeren',
    ],
    category: 'fresh',
    subCategory: 'fruit',
  },
  // Fresh > ready meals
  {
    keywords: ['tofu', 'hummus', 'frisch', 'fresh'],
    category: 'fresh',
    subCategory: 'ready-meals',
  },

  // Non-food > laundry
  {
    keywords: ['waschmittel', 'waschpulver', 'detergent', 'weichspüler', 'softener', 'persil'],
    category: 'non-food',
    subCategory: 'laundry',
  },
  // Non-food > cleaning
  {
    keywords: ['reinigung', 'reiniger', 'putzmittel', 'cleaning', 'geschirrspüler', 'abwaschmittel', 'dish', 'swiffer'],
    category: 'non-food',
    subCategory: 'cleaning',
  },
  // Non-food > personal care
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
  // Non-food > paper goods
  {
    keywords: ['papier', 'toilettenpapier', 'taschentücher', 'küchenpapier', 'tempo'],
    category: 'non-food',
    subCategory: 'paper-goods',
  },
  // Non-food > household
  {
    keywords: [
      'haushalt', 'household', 'windeln', 'diaper',
      'müllsack', 'abfallsack', 'garbage',
      'batterien', 'battery', 'glühbirne', 'lampe',
    ],
    category: 'non-food',
    subCategory: 'household',
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
