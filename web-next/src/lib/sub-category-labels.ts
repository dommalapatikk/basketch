// Sub-category labels keyed off the strings the pipeline writes to
// `deals.sub_category`. Anything not in this map falls back to the raw key
// (Title-Cased), so a new pipeline label still renders something readable.
//
// Keep in sync with basketch/pipeline/categorize.py — when you add a new
// sub_category there, mirror it here.

export const SUB_CATEGORY_LABELS_DE: Record<string, string> = {
  bread: 'Brot',
  beer: 'Bier',
  canned: 'Konserven',
  chocolate: 'Schokolade',
  cleaning: 'Reinigung',
  coffee: 'Kaffee',
  condiments: 'Saucen & Gewürze',
  dairy: 'Milchprodukte',
  deli: 'Feinkost',
  eggs: 'Eier',
  fish: 'Fisch',
  frozen: 'Tiefkühl',
  fruit: 'Obst',
  household: 'Haushalt',
  juice: 'Säfte',
  laundry: 'Waschmittel',
  meat: 'Fleisch',
  'paper-goods': 'Papierwaren',
  'pasta-rice': 'Pasta & Reis',
  'personal-care': 'Körperpflege',
  poultry: 'Geflügel',
  'ready-meals': 'Fertiggerichte',
  snacks: 'Snacks',
  'soft-drinks': 'Erfrischungsgetränke',
  tea: 'Tee',
  vegetables: 'Gemüse',
  water: 'Wasser',
  wine: 'Wein',
}

export const SUB_CATEGORY_LABELS_EN: Record<string, string> = {
  bread: 'Bread',
  beer: 'Beer',
  canned: 'Canned',
  chocolate: 'Chocolate',
  cleaning: 'Cleaning',
  coffee: 'Coffee',
  condiments: 'Condiments',
  dairy: 'Dairy',
  deli: 'Deli',
  eggs: 'Eggs',
  fish: 'Fish',
  frozen: 'Frozen',
  fruit: 'Fruit',
  household: 'Household',
  juice: 'Juice',
  laundry: 'Laundry',
  meat: 'Meat',
  'paper-goods': 'Paper goods',
  'pasta-rice': 'Pasta & rice',
  'personal-care': 'Personal care',
  poultry: 'Poultry',
  'ready-meals': 'Ready meals',
  snacks: 'Snacks',
  'soft-drinks': 'Soft drinks',
  tea: 'Tea',
  vegetables: 'Vegetables',
  water: 'Water',
  wine: 'Wine',
}

export function subCategoryLabel(key: string, locale: string): string {
  const map = locale === 'de' ? SUB_CATEGORY_LABELS_DE : SUB_CATEGORY_LABELS_EN
  if (map[key]) return map[key]
  // Fallback — title-case the raw key so an un-mapped value is still readable.
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
