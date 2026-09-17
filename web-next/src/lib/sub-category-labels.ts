// Sub-category labels keyed off the strings the pipeline writes to
// `deals.sub_category`. Anything not in this map falls back to the raw key
// (Title-Cased), so a new pipeline label still renders something readable.
//
// Keep in sync with `BROWSE_CATEGORIES` in `shared/types.ts` — that is the
// single source of truth for the sub-category vocabulary. When a sub-category
// is added there, add its DE and EN label here in the same change.
//
// Guarded by `shared/sub-category-labels.test.ts`, which imports this file
// directly and asserts the label sets match `BROWSE_CATEGORIES` exactly, in
// both directions. That test goes red in the PR that edits either file — do
// not add a fallback that lets it stay silently green.
//
// ⚠️ THIS FILE MUST STAY IMPORT-FREE. That is a rule, not an observation.
// `ci.yml`'s `test-shared` job installs PIPELINE dependencies only, so
// `web-next/node_modules` does not exist there. The day this file imports
// anything — including the natural-looking `import { BROWSE_CATEGORIES }
// from '../../../shared/types'`, or anything `@/`-aliased — the shared suite
// breaks with a module-resolution error in a job named after something else,
// and the tempting "fix" is to delete the guard. Keep the maps literal.
//
// DE/EN only: `web-next/src/i18n/routing.ts` serves `['de', 'en']`. FR/IT are
// deferred (see ADR M3) and have no locale route to read this map, so they
// are intentionally not covered here.

export const SUB_CATEGORY_LABELS_DE: Record<string, string> = {
  'baby-accessories': 'Babyzubehör',
  'baby-care': 'Babypflege',
  'baby-food': 'Babynahrung',
  beer: 'Bier',
  'body-care': 'Körperpflege',
  'books-media': 'Bücher & Medien',
  bread: 'Brot',
  cake: 'Kuchen',
  canned: 'Konserven',
  'car-accessories': 'Autozubehör',
  // NOT 'Partyservice' — that names a caterer who delivers to your event, a
  // bookable service. This bucket is Coop's Food shelf: party platters and
  // trays, sold by the unit, with a price basketch compares. Naming a product
  // as a service is the wrong side of UWG Art. 3(1)(e).
  catering: 'Apéro & Platten',
  chocolate: 'Schokolade',
  cleaning: 'Reinigung',
  clothing: 'Kleidung',
  coffee: 'Kaffee',
  'coffee-tea': 'Kaffee & Tee',
  condiments: 'Saucen & Gewürze',
  cookware: 'Kochgeschirr',
  'cut-flowers': 'Schnittblumen',
  dairy: 'Milchprodukte',
  deli: 'Feinkost',
  'dental-care': 'Zahnpflege',
  'diy-hardware': 'Baubedarf',
  // 'Teig' alone reads as the substance; 'Fertigteige' is the shelf. NOT
  // 'Teigwaren' — in Swiss retail that means PASTA, and would collide with
  // pasta-rice two chips away.
  dough: 'Fertigteige',
  drinks: 'Getränke',
  eggs: 'Eier',
  'electronics-accessories': 'Elektronikzubehör',
  'facial-care': 'Gesichtspflege',
  'feminine-care': 'Damenhygiene',
  fish: 'Fisch',
  'food-storage': 'Aufbewahrung',
  formula: 'Säuglingsmilch',
  frozen: 'Tiefkühl',
  fruit: 'Obst',
  games: 'Spiele',
  'garden-care': 'Gartenpflege',
  'gift-cards': 'Geschenkkarten',
  'hair-care': 'Haarpflege',
  'health-wellbeing': 'Gesundheit & Wohlbefinden',
  'home-appliance': 'Haushaltsgeräte',
  'home-textiles': 'Heimtextilien',
  household: 'Haushalt',
  juice: 'Säfte',
  'kitchen-appliance': 'Küchengeräte',
  'kitchen-tools': 'Küchenhelfer',
  laundry: 'Waschmittel',
  'make-up': 'Make-up',
  meat: 'Fleisch',
  'mens-care': 'Herrenpflege',
  nappies: 'Windeln',
  'office-supplies': 'Bürobedarf',
  // NOT 'Outdoor-Wohnen' — a word-for-word calque no Swiss retailer uses, and
  // the one label here that read machine-translated. This sits in
  // garden-plants beside 'Pflanzen' and 'Gartenpflege'.
  'outdoor-living': 'Garten & Freizeit',
  'paper-goods': 'Papierwaren',
  'pasta-rice': 'Pasta & Reis',
  pastry: 'Gebäck',
  'personal-care': 'Körperpflege',
  'pet-care': 'Tierpflege',
  'pet-food': 'Tierfutter',
  plants: 'Pflanzen',
  poultry: 'Geflügel',
  'prepaid-credit': 'Prepaid-Karten',
  'ready-meals': 'Fertiggerichte',
  shoes: 'Schuhe',
  snacks: 'Snacks',
  'soft-drinks': 'Erfrischungsgetränke',
  spirits: 'Spirituosen',
  'sports-equipment': 'Sportartikel',
  stationery: 'Schreibwaren',
  tea: 'Tee',
  // Never rendered (NON_PUBLISHABLE_SUB_CATEGORIES) — labelled anyway so the
  // guard can assert set equality with no carve-out. A special case here would
  // mean a second reference to the blocklist inside the guard, and the guard's
  // whole value is being total.
  tobacco: 'Tabakwaren',
  tools: 'Werkzeug',
  toys: 'Spielzeug',
  vegetables: 'Gemüse',
  'waste-bags': 'Kehrichtsäcke',
  water: 'Wasser',
  wine: 'Wein',
}

export const SUB_CATEGORY_LABELS_EN: Record<string, string> = {
  'baby-accessories': 'Baby Accessories',
  'baby-care': 'Baby Care',
  'baby-food': 'Baby Food',
  beer: 'Beer',
  'body-care': 'Body Care',
  'books-media': 'Books & Media',
  bread: 'Bread',
  cake: 'Cake',
  canned: 'Canned',
  'car-accessories': 'Car Accessories',
  catering: 'Party Platters',
  chocolate: 'Chocolate',
  cleaning: 'Cleaning',
  clothing: 'Clothing',
  coffee: 'Coffee',
  'coffee-tea': 'Coffee & Tea',
  condiments: 'Condiments',
  cookware: 'Cookware',
  'cut-flowers': 'Cut Flowers',
  dairy: 'Dairy',
  deli: 'Deli',
  'dental-care': 'Dental Care',
  'diy-hardware': 'DIY Hardware',
  dough: 'Dough',
  drinks: 'Drinks',
  eggs: 'Eggs',
  'electronics-accessories': 'Electronics Accessories',
  'facial-care': 'Facial Care',
  'feminine-care': 'Feminine Care',
  fish: 'Fish',
  'food-storage': 'Food Storage',
  formula: 'Formula',
  frozen: 'Frozen',
  fruit: 'Fruit',
  games: 'Games',
  'garden-care': 'Garden Care',
  'gift-cards': 'Gift Cards',
  'hair-care': 'Hair Care',
  'health-wellbeing': 'Health & Wellbeing',
  'home-appliance': 'Home Appliances',
  'home-textiles': 'Home Textiles',
  household: 'Household',
  juice: 'Juice',
  'kitchen-appliance': 'Kitchen Appliances',
  'kitchen-tools': 'Kitchen Tools',
  laundry: 'Laundry',
  'make-up': 'Make-up',
  meat: 'Meat',
  'mens-care': "Men's Care",
  nappies: 'Nappies',
  'office-supplies': 'Office Supplies',
  'outdoor-living': 'Outdoor Living',
  'paper-goods': 'Paper Goods',
  'pasta-rice': 'Pasta & Rice',
  pastry: 'Pastry',
  'personal-care': 'Personal Care',
  'pet-care': 'Pet Care',
  'pet-food': 'Pet Food',
  plants: 'Plants',
  poultry: 'Poultry',
  'prepaid-credit': 'Prepaid Credit',
  'ready-meals': 'Ready Meals',
  shoes: 'Shoes',
  snacks: 'Snacks',
  'soft-drinks': 'Soft Drinks',
  spirits: 'Spirits',
  'sports-equipment': 'Sports Equipment',
  stationery: 'Stationery',
  tea: 'Tea',
  tobacco: 'Tobacco',
  tools: 'Tools',
  toys: 'Toys',
  vegetables: 'Vegetables',
  'waste-bags': 'Waste Bags',
  water: 'Water',
  wine: 'Wine',
}

export function subCategoryLabel(key: string, locale: string): string {
  const map = locale === 'de' ? SUB_CATEGORY_LABELS_DE : SUB_CATEGORY_LABELS_EN
  if (map[key]) return map[key]
  // Fallback — title-case the raw key so an un-mapped value is still readable.
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
