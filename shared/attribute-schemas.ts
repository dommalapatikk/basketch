// Attribute schemas — what the enrich step may extract, per sub-category.
//
// THE RULE THAT GOVERNS EVERY FIELD HERE: extract only what is written. Never
// infer. Absent is null, not a good guess.
//
// This is not stylistic caution. `Emmi Milch 1L` does not state a fat
// percentage; asked for one, a model answers 3.5% because that is the most
// common milk. It would be right often enough to look fine and wrong often
// enough to matter — and under UWG Art. 3(1)(e) a price comparison must be
// objectively correct. Measured on the 2026-09-10 Denner pull: NOT ONE of the
// twelve dairy product names stated a fat percentage. `null` is the normal
// answer, not a failure.
//
// Deliberately incremental. Categories had to be complete on day one, because
// nothing may resolve to "Other" (D1). Attributes may be null, so a
// sub-category with no schema yet simply extracts nothing. Coverage grows as
// real data shows which fields are actually printed on Swiss packaging.

export type AttributeType = 'enum' | 'number' | 'boolean' | 'text'

export type AttributeSpec = {
  readonly id: string
  readonly label: string
  readonly type: AttributeType
  /** Allowed values for an enum. The model may return one of these or null. */
  readonly values?: readonly string[]
  /** Unit for a number, shown to the model so it does not convert silently. */
  readonly unit?: string
  /** Why this field matters for price comparison. Also read by the prompt. */
  readonly why: string
}

/** Applies to every product, whatever its category. */
export const CROSS_CUTTING_ATTRIBUTES: readonly AttributeSpec[] = [
  { id: 'organic', label: 'Organic', type: 'boolean', why: 'Bio products are a different price tier and not substitutes.' },
  {
    id: 'label',
    label: 'Quality label',
    type: 'enum',
    values: ['ip-suisse', 'suisse-garantie', 'aop', 'aoc', 'demeter', 'msc', 'asc', 'rainforest-alliance', 'v-label'],
    why: 'Denner publishes these directly in eco_labels; they justify price differences.',
  },
  { id: 'origin', label: 'Origin', type: 'text', why: 'Swiss origin commands a premium; comparing across origins is misleading.' },
  {
    id: 'storage',
    label: 'Storage',
    type: 'enum',
    values: ['fresh', 'chilled', 'frozen', 'ambient'],
    why: 'ADR-001: storage is an attribute, not a category, so frozen mango sits beside fresh mango.',
  },
  { id: 'lactoseFree', label: 'Lactose-free', type: 'boolean', why: 'A dietary requirement, and a different price tier.' },
  { id: 'glutenFree', label: 'Gluten-free', type: 'boolean', why: 'A dietary requirement, and a different price tier.' },
  { id: 'vegan', label: 'Vegan', type: 'boolean', why: 'A dietary requirement, and a different price tier.' },
]

/**
 * Per-sub-category attributes. A sub-category absent from this map extracts only
 * the cross-cutting fields — which is a valid state, not a gap.
 */
export const ATTRIBUTE_SCHEMAS: Record<string, readonly AttributeSpec[]> = {
  // ── dairy ─────────────────────────────────────────────────────────────────
  dairy: [
    {
      id: 'dairyType', label: 'Type', type: 'enum',
      values: ['milk', 'yoghurt', 'cheese', 'butter', 'cream', 'quark', 'dessert', 'milk-drink'],
      why: 'Butter and yoghurt are not substitutes; comparing them by weight is meaningless.',
    },
    {
      id: 'fatPercent', label: 'Fat %', type: 'number', unit: '%',
      why: 'Whole and skimmed milk are different products. NOT ONE of Denner’s 12 dairy names stated this — expect null.',
    },
    { id: 'treatment', label: 'Treatment', type: 'enum', values: ['uht', 'pasteurised', 'raw'], why: 'UHT and fresh milk have different shelf lives and prices.' },
    { id: 'cheeseFirmness', label: 'Firmness', type: 'enum', values: ['hart', 'halbhart', 'weich', 'frisch'], why: 'Hard cheese is priced per kg far above fresh cheese.' },
    { id: 'milkSource', label: 'Milk from', type: 'enum', values: ['cow', 'goat', 'sheep', 'buffalo'], why: 'Goat and sheep milk carry a large premium.' },
    { id: 'salted', label: 'Salted', type: 'boolean', why: 'Butter only. Gesalzen and ungesalzen are different products at different prices.' },
    { id: 'flavour', label: 'Flavour', type: 'text', why: 'Distinguishes variants within one product line.' },
  ],
  eggs: [
    { id: 'count', label: 'Count', type: 'number', unit: 'pieces', why: 'Eggs are priced per piece; pack size is the comparison unit.' },
    { id: 'size', label: 'Size', type: 'enum', values: ['S', 'M', 'L', 'XL'], why: 'Size changes price per egg substantially.' },
    { id: 'farming', label: 'Farming', type: 'enum', values: ['freiland', 'boden', 'bio', 'weide'], why: 'The single largest price driver for eggs in Switzerland.' },
  ],

  // ── meat & fish ───────────────────────────────────────────────────────────
  meat: [
    { id: 'animal', label: 'Animal', type: 'enum', values: ['pork', 'beef', 'veal', 'lamb', 'game', 'horse'], why: 'Veal and pork differ several-fold in price per kg.' },
    { id: 'cut', label: 'Cut', type: 'text', why: 'Nierstück and Voressen are wholly different price tiers.' },
    { id: 'preparation', label: 'Preparation', type: 'enum', values: ['raw', 'marinated', 'breaded', 'cooked', 'cured', 'smoked'], why: 'Preparation adds cost per kg.' },
    { id: 'priceBasis', label: 'Price basis', type: 'enum', values: ['per-100g', 'per-kg', 'per-piece'], why: 'CRITICAL: comparing a per-100g price with a per-kg price is wrong by 10×.' },
    { id: 'leanness', label: 'Leanness', type: 'enum', values: ['mager', 'normal'], why: 'Printed in Denner sublines; affects grade and price.' },
  ],
  poultry: [
    { id: 'animal', label: 'Animal', type: 'enum', values: ['chicken', 'turkey', 'duck', 'goose'], why: 'Different species, different price tiers.' },
    { id: 'cut', label: 'Cut', type: 'text', why: 'Breast and whole bird differ several-fold per kg.' },
    { id: 'preparation', label: 'Preparation', type: 'enum', values: ['raw', 'marinated', 'breaded', 'cooked'], why: 'Preparation adds cost per kg.' },
    { id: 'priceBasis', label: 'Price basis', type: 'enum', values: ['per-100g', 'per-kg', 'per-piece'], why: 'Comparing across price bases is wrong by 10×.' },
  ],
  fish: [
    { id: 'species', label: 'Species', type: 'text', why: 'Salmon and pollock are not substitutes.' },
    { id: 'wildCaught', label: 'Wild caught', type: 'boolean', why: 'Wild fish carries a substantial premium over farmed.' },
    { id: 'preparation', label: 'Preparation', type: 'enum', values: ['raw', 'smoked', 'breaded', 'cooked', 'marinated'], why: 'Smoked salmon is a different product from a fresh fillet.' },
    { id: 'priceBasis', label: 'Price basis', type: 'enum', values: ['per-100g', 'per-kg', 'per-piece'], why: 'Comparing across price bases is wrong by 10×.' },
  ],

  // ── drinks & alcohol ──────────────────────────────────────────────────────
  wine: [
    { id: 'wineColour', label: 'Colour', type: 'enum', values: ['rot', 'weiss', 'rosé', 'schaumwein'], why: 'Denner publishes this as wine_type — tier 1, never guessed.' },
    { id: 'vintage', label: 'Vintage', type: 'number', why: 'Published as `year`. Verified 2026-09-10 to be more reliable than the subline, which disagrees 27% of the time.' },
    { id: 'grape', label: 'Grape', type: 'text', why: 'Published as `grapes`. The main driver of comparability between wines.' },
    { id: 'appellation', label: 'Appellation', type: 'enum', values: ['DOC', 'DOCG', 'AOC', 'AOP', 'DO', 'DOP', 'IGT', 'IGP'], why: 'A protected designation is a quality and price tier.' },
    { id: 'sweetness', label: 'Sweetness', type: 'enum', values: ['brut', 'extra-dry', 'medium-dry', 'demi-sec', 'trocken', 'süss'], why: 'Sparkling wines are not substitutes across sweetness levels.' },
  ],
  beer: [
    { id: 'beerStyle', label: 'Style', type: 'enum', values: ['lager', 'hell', 'blonde', 'panaché', 'weizen', 'ipa', 'stark', 'dunkel'], why: 'Style determines substitutability.' },
    { id: 'abv', label: 'Alcohol %', type: 'number', unit: '%', why: 'Printed on Swiss labels; 0.0% is a different product entirely.' },
    { id: 'alcoholFree', label: 'Alcohol-free', type: 'boolean', why: '"Cero" and "0.0%" appear in real Denner names.' },
  ],
  water: [
    { id: 'carbonation', label: 'Carbonation', type: 'enum', values: ['still', 'sparkling', 'medium'], why: 'Still and sparkling are not substitutes.' },
    { id: 'container', label: 'Container', type: 'enum', values: ['pet', 'glass', 'can', 'carton'], why: 'Glass carries a deposit and a different price.' },
  ],
  'soft-drinks': [
    { id: 'sugarFree', label: 'Sugar-free', type: 'boolean', why: '"Zero" and "Sugarfree" are distinct SKUs at the same price point.' },
    { id: 'caffeine', label: 'Contains caffeine', type: 'boolean', why: 'Energy drinks and colas are distinguished by it.' },
    { id: 'container', label: 'Container', type: 'enum', values: ['pet', 'glass', 'can', 'carton'], why: 'Container changes unit price materially.' },
  ],
  'coffee-tea': [
    { id: 'coffeeForm', label: 'Form', type: 'enum', values: ['beans', 'ground', 'capsule', 'instant', 'pods'], why: 'Capsules cost several times more per cup than beans — the key comparison.' },
    { id: 'capsuleSystem', label: 'Capsule system', type: 'enum', values: ['nespresso', 'tassimo', 'dolce-gusto', 'proprietary'], why: 'Capsules are useless in the wrong machine, so they are not substitutes.' },
    { id: 'intensity', label: 'Intensity', type: 'number', why: 'Printed as a number on Swiss capsule packaging ("Lungo 6").' },
    { id: 'decaf', label: 'Decaffeinated', type: 'boolean', why: 'A distinct product line.' },
  ],

  // ── everything else with a real comparison impact ─────────────────────────
  chocolate: [
    { id: 'sweetForm', label: 'Form', type: 'enum', values: ['bar', 'pralines', 'balls', 'biscuit', 'sweets', 'wafer'], why: 'A bar and a box of pralines are priced differently per 100 g.' },
    { id: 'chocolateType', label: 'Type', type: 'enum', values: ['milch', 'dunkel', 'weiss', 'assortiert'], why: 'Distinguishes variants within one line.' },
    { id: 'cocoaPercent', label: 'Cocoa %', type: 'number', unit: '%', why: 'Printed on dark chocolate; a quality tier.' },
  ],
  laundry: [
    { id: 'washLoads', label: 'Wash loads', type: 'number', unit: 'loads', why: 'CRITICAL: detergent is only comparable per wash, never per kilo.' },
    { id: 'detergentForm', label: 'Form', type: 'enum', values: ['pulver', 'flüssig', 'caps', 'gel', 'sheets'], why: 'Form changes dose and therefore cost per wash.' },
    { id: 'laundryVariant', label: 'Variant', type: 'enum', values: ['color', 'voll', 'fein', 'black', 'wolle'], why: 'Not substitutes for one another.' },
  ],
  'paper-goods': [
    { id: 'plyCount', label: 'Ply', type: 'number', why: 'CRITICAL: toilet paper is comparable per sheet-ply, not per roll.' },
    { id: 'rollCount', label: 'Rolls', type: 'number', why: 'Pack size is the headline number but not the comparison unit.' },
    { id: 'sheetCount', label: 'Sheets per roll', type: 'number', why: 'Rolls vary hugely in length; this is what makes them comparable.' },
  ],
  'pet-food': [
    { id: 'petAnimal', label: 'For', type: 'enum', values: ['cat', 'dog', 'bird', 'fish', 'rodent'], why: 'Cat and dog food are not substitutes.' },
    { id: 'petFoodForm', label: 'Form', type: 'enum', values: ['dry', 'wet', 'treat'], why: 'Wet and dry food differ by an order of magnitude per kg.' },
    { id: 'lifeStage', label: 'Life stage', type: 'enum', values: ['kitten', 'puppy', 'adult', 'senior'], why: 'Printed on Swiss packaging; a distinct product line.' },
  ],
  canned: [
    { id: 'preservation', label: 'Preservation', type: 'enum', values: ['tinned', 'jarred', 'dried', 'powder', 'paste'], why: 'Drained weight differs from net weight; the comparison depends on it.' },
    { id: 'inSyrup', label: 'In syrup', type: 'boolean', why: 'Fruit in syrup and in juice are different products.' },
    { id: 'inOil', label: 'In oil', type: 'boolean', why: 'Tuna in oil and in brine differ in price and drained weight.' },
  ],
  condiments: [
    { id: 'pantryType', label: 'Type', type: 'enum', values: ['oil', 'vinegar', 'sauce', 'stock', 'spice', 'spread', 'baking', 'dessert-mix', 'honey'], why: 'Oil and spice mix are not comparable by weight.' },
    { id: 'oilType', label: 'Oil', type: 'enum', values: ['raps', 'oliven', 'sonnenblumen', 'erdnuss', 'kokos'], why: 'Olive and rapeseed oil differ several-fold in price.' },
    { id: 'heatLevel', label: 'Heat', type: 'enum', values: ['mild', 'medium', 'scharf'], why: 'Printed on Swiss packaging; not substitutes.' },
  ],
  'personal-care': [
    { id: 'careType', label: 'Type', type: 'enum', values: ['shampoo', 'conditioner', 'shower-gel', 'soap', 'body-lotion', 'face-cream', 'serum', 'deodorant', 'bodyspray', 'toothpaste', 'razor', 'hair-colour', 'sun'], why: 'The primary comparison axis; per-ml prices vary hugely across types.' },
    { id: 'targetGroup', label: 'For', type: 'enum', values: ['men', 'women', 'baby', 'unisex'], why: "Men's and baby lines are priced separately." },
    { id: 'spf', label: 'SPF', type: 'number', why: 'Printed on sun care; a distinct product tier.' },
  ],
}

/** Everything the enrich step may ask about for a sub-category. */
export function attributesFor(subCategory: string): readonly AttributeSpec[] {
  return [...CROSS_CUTTING_ATTRIBUTES, ...(ATTRIBUTE_SCHEMAS[subCategory] ?? [])]
}

export function hasAttributeSchema(subCategory: string): boolean {
  return subCategory in ATTRIBUTE_SCHEMAS
}
