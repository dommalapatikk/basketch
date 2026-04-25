// shared/types.ts — Single source of truth for all data types.
// Consumed by pipeline (TypeScript) and frontend (React).
// Python Coop scraper outputs JSON matching UnifiedDeal shape (camelCase).

// ============================================================
// Core union types
// ============================================================

export type Store = 'migros' | 'coop' | 'lidl' | 'aldi' | 'denner' | 'spar' | 'volg'

// ============================================================
// Store metadata — single source of truth for labels, colors, slugs
// ============================================================

export interface StoreMeta {
  slug: Store
  label: string
  aktionisSlug: string
  /** Hex color for backgrounds (buttons, badges) */
  hex: string
  /** Hex color for text on white (WCAG AA) */
  hexText: string
  /** Hex color for light tinted backgrounds */
  hexLight: string
}

/**
 * Store colours — v4 spec §5 row 15 official palette.
 * hex      = brand background (for solid fills)
 * hexText  = brand text (WCAG-AA on white)
 * hexLight = tinted background (for highlights)
 * LIDL uses yellow+red (bg=yellow, text=red per official badge).
 */
export const STORE_META: Record<Store, StoreMeta> = {
  migros:  { slug: 'migros',  label: 'Migros',  aktionisSlug: 'migros',       hex: '#FF6600', hexText: '#CC5200', hexLight: '#FFF0E6' },
  coop:    { slug: 'coop',    label: 'Coop',     aktionisSlug: 'coop',         hex: '#E30613', hexText: '#B3040F', hexLight: '#FCECEC' },
  lidl:    { slug: 'lidl',    label: 'LIDL',     aktionisSlug: 'lidl',         hex: '#FFF000', hexText: '#E10915', hexLight: '#FFFBCC' },
  aldi:    { slug: 'aldi',    label: 'ALDI',     aktionisSlug: 'aldi-suisse',  hex: '#00225E', hexText: '#001A4A', hexLight: '#E6E8F0' },
  denner:  { slug: 'denner',  label: 'Denner',   aktionisSlug: 'denner',       hex: '#E20613', hexText: '#B3040F', hexLight: '#FCECEC' },
  spar:    { slug: 'spar',    label: 'SPAR',     aktionisSlug: 'spar',         hex: '#E30613', hexText: '#009640', hexLight: '#FCECEC' },
  volg:    { slug: 'volg',    label: 'Volg',     aktionisSlug: 'volg',         hex: '#E30613', hexText: '#B3040F', hexLight: '#FFF9CC' },
}

export const ALL_STORES = Object.keys(STORE_META) as Store[]

/** Default stores shown before user customizes their filter */
export const DEFAULT_STORES: Store[] = ALL_STORES

/** Stores to scrape from aktionis.ch (includes coop-megastore which merges into coop) */
export const AKTIONIS_STORE_SLUGS = [
  'coop', 'coop-megastore', 'migros', 'lidl', 'aldi-suisse', 'denner', 'spar', 'volg',
] as const

/** Map aktionis.ch slug to our Store type (coop-megastore → coop, aldi-suisse → aldi) */
export function aktionisSlugToStore(slug: string): Store | null {
  if (slug === 'coop-megastore') return 'coop'
  if (slug === 'aldi-suisse') return 'aldi'
  const match = ALL_STORES.find((s) => STORE_META[s].aktionisSlug === slug)
  return match ?? null
}
export type Category = 'fresh' | 'long-life' | 'non-food'

// ============================================================
// v4 format / container / canonical unit types (spec §3)
// ============================================================

export type Format = 'still' | 'sparkling' | 'lightly-sparkling' | 'flavoured'
export type Container = 'pet' | 'glass' | 'can' | 'carton' | 'pouch'
export type CanonicalUnit = 'L' | 'kg' | '100g' | 'piece'

/** Format dimension for a sub-category schema (e.g. Type / Container / Pack). */
export interface FormatDimension {
  id: string
  label: string
  values: string[]
}

/**
 * Canonical schema for a sub-category, driving format-aware comparison.
 * Source of truth for: canonical unit, which format dimensions to chip on,
 * and the default format chip to select on band entry.
 */
export interface SubCategorySchema {
  id: string
  label: string
  icon: string
  canonicalUnit: CanonicalUnit
  formatDimensions: FormatDimension[]
  defaultFormat?: string
}

/**
 * Confidence score that a deal's (category, sub_category) assignment is correct.
 * Tier mapping: brand=0.95, source-category=0.85, keyword=0.7, fallback=0.3.
 * Deals below 0.4 are rejected at ingest; 0.4–0.7 bucket as "Other"; ≥0.7 render normally.
 */
export type TaxonomyConfidence = number

// ============================================================
// Constants
// ============================================================

/** Verdict tie threshold: scores within this % are declared a tie. */
export const TIE_THRESHOLD = 0.05

/** Minimum deals from a store to include a category in the verdict. */
export const MIN_DEALS_FOR_VERDICT = 3

// ============================================================
// Browse categories — 11 browse categories mapping 23 DB sub-categories
// ============================================================

export type BrowseCategory =
  | 'fruits-vegetables'
  | 'meat-fish'
  | 'dairy'
  | 'bakery'
  | 'snacks-sweets'
  | 'pasta-rice-cereals'
  | 'drinks'
  | 'ready-meals-frozen'
  | 'pantry-canned'
  | 'home'
  | 'beauty-hygiene'
  | 'all'

export interface BrowseCategoryInfo {
  id: BrowseCategory
  label: string
  emoji: string
  subCategories: string[]  // matches sub_category values in DB
  topCategory: Category    // parent top-level category
}

/**
 * Explicit mapping from 11 browse categories to 23 DB sub-categories.
 * Source: Technical Architecture v2.1, Section 4.10.
 * Deals with sub_category = null appear only in the "All" view.
 */
export const BROWSE_CATEGORIES: BrowseCategoryInfo[] = [
  // Fresh
  { id: 'fruits-vegetables', label: 'Fruits & Vegetables', emoji: '🥬', subCategories: ['fruit', 'vegetables'], topCategory: 'fresh' },
  { id: 'meat-fish', label: 'Meat & Fish', emoji: '🥩', subCategories: ['meat', 'poultry', 'fish', 'deli'], topCategory: 'fresh' },
  { id: 'dairy', label: 'Dairy & Eggs', emoji: '🧀', subCategories: ['dairy', 'eggs'], topCategory: 'fresh' },
  { id: 'bakery', label: 'Bakery', emoji: '🍞', subCategories: ['bread'], topCategory: 'fresh' },
  // Long-life
  { id: 'snacks-sweets', label: 'Snacks & Sweets', emoji: '🍫', subCategories: ['snacks', 'chocolate'], topCategory: 'long-life' },
  { id: 'pasta-rice-cereals', label: 'Pasta, Rice & More', emoji: '🍝', subCategories: ['pasta-rice'], topCategory: 'long-life' },
  { id: 'drinks', label: 'Drinks', emoji: '🥤', subCategories: ['water', 'juice', 'beer', 'wine', 'soft-drinks', 'coffee', 'tea', 'drinks', 'coffee-tea'], topCategory: 'long-life' },
  { id: 'ready-meals-frozen', label: 'Ready Meals & Frozen', emoji: '🍕', subCategories: ['ready-meals', 'frozen'], topCategory: 'long-life' },
  { id: 'pantry-canned', label: 'Pantry & Canned', emoji: '🥫', subCategories: ['canned', 'condiments'], topCategory: 'long-life' },
  // Non-food
  { id: 'home', label: 'Home & Cleaning', emoji: '🧹', subCategories: ['cleaning', 'laundry', 'paper-goods', 'household'], topCategory: 'non-food' },
  { id: 'beauty-hygiene', label: 'Beauty & Hygiene', emoji: '🧴', subCategories: ['personal-care'], topCategory: 'non-food' },
]

// ============================================================
// Starter packs — 5 pre-loaded product lists for onboarding
// ============================================================

export interface StarterPackItem {
  keyword: string           // search keyword: 'milch', 'poulet'
  label: string             // display name: 'Milk', 'Chicken'
  category: Category
  excludeTerms?: string[]   // products containing these terms are excluded from matching
  preferTerms?: string[]    // products containing these terms get a relevance boost
  productGroupId?: string   // links to product_groups.id for exact matching
}

export interface StarterPackDefinition {
  name: string        // machine name: 'swiss-basics'
  label: string       // display name: 'Swiss Basics'
  description: string
  items: StarterPackItem[]
}

export const STARTER_PACKS: StarterPackDefinition[] = [
  {
    name: 'swiss-basics',
    label: 'Swiss Basics',
    description: 'Everyday essentials for a Swiss household',
    items: [
      { keyword: 'milch', label: 'Milk', category: 'fresh', excludeTerms: ['schokolade', 'branche', 'kokos', 'glace', 'shake', 'dessert', 'pudding', 'caramel'], preferTerms: ['vollmilch', 'halbfettmilch', 'milch 1l', 'drink milch'] },
      { keyword: 'brot', label: 'Bread', category: 'fresh', excludeTerms: ['aufstrich', 'brotaufstrich', 'chips', 'stängel'], preferTerms: ['ruchbrot', 'toast', 'zopf', 'weggli'] },
      { keyword: 'butter', label: 'Butter', category: 'fresh', excludeTerms: ['guezli', 'gipfel', 'erdnuss', 'cookie', 'schokolade', 'croissant', 'cordon'], preferTerms: ['bratbutter', 'butter 250', 'butter 200', 'vorzugsbutter'] },
      { keyword: 'eier', label: 'Eggs', category: 'fresh', excludeTerms: ['nudeln', 'hörnli', 'penne', 'magronen', 'müscheli', 'spaghetti', 'teigwaren', 'pasta'], preferTerms: ['freiland', 'eier 6', 'eier 10', 'bio eier'] },
      { keyword: 'käse', label: 'Cheese', category: 'fresh', excludeTerms: ['schnitzel', 'cordon'], preferTerms: ['reibkäse', 'gruyère', 'emmentaler', 'appenzeller'] },
      { keyword: 'joghurt', label: 'Yogurt', category: 'fresh', excludeTerms: ['twix', 'mars', 'snickers', 'schokolade', 'riegel'], preferTerms: ['naturjoghurt', 'joghurt nature', 'jogurt'] },
      { keyword: 'poulet', label: 'Chicken', category: 'fresh', excludeTerms: ['chips', 'bouillon', 'geschmack', 'aroma', 'gewürz', 'zweifel', 'chörbli'], preferTerms: ['pouletbrust', 'pouletflügeli', 'pouletschnitzel'] },
      { keyword: 'tomaten', label: 'Tomatoes', category: 'fresh', excludeTerms: ['erde', 'hauert', 'gnocchi', 'gewürz'], preferTerms: ['tomaten ', 'cherry', 'rispentomaten', 'pelati', 'tomatenpüree'] },
      { keyword: 'zwiebeln', label: 'Onions', category: 'fresh' },
      { keyword: 'kartoffeln', label: 'Potatoes', category: 'fresh', excludeTerms: ['süsskartoffel', 'cubes', 'chips', 'gratin', 'rösti', 'stock'], preferTerms: ['kartoffeln', 'festkochend', 'mehligkochend'] },
      { keyword: 'pasta', label: 'Pasta', category: 'long-life' },
      { keyword: 'reis', label: 'Rice', category: 'long-life' },
      { keyword: 'kaffee', label: 'Coffee', category: 'long-life', excludeTerms: ['rahm', 'glace'] },
      { keyword: 'schokolade', label: 'Chocolate', category: 'long-life' },
      { keyword: 'waschmittel', label: 'Laundry Detergent', category: 'non-food' },
      { keyword: 'toilettenpapier', label: 'Toilet Paper', category: 'non-food' },
      { keyword: 'shampoo', label: 'Shampoo', category: 'non-food' },
    ],
  },
  {
    name: 'indian-kitchen',
    label: 'Indian Kitchen',
    description: 'Essentials for Indian home cooking in Switzerland',
    items: [
      { keyword: 'reis', label: 'Rice', category: 'long-life' },
      { keyword: 'zwiebeln', label: 'Onions', category: 'fresh' },
      { keyword: 'tomaten', label: 'Tomatoes', category: 'fresh', excludeTerms: ['erde', 'hauert', 'gnocchi', 'gewürz'], preferTerms: ['tomaten ', 'cherry', 'pelati', 'tomatenpüree'] },
      { keyword: 'knoblauch', label: 'Garlic', category: 'fresh', excludeTerms: ['spiess', 'crevette', 'fleisch', 'poulet', 'wurst', 'pizza', 'brot'], preferTerms: ['knoblauch ', 'knoblauchzehen'] },
      { keyword: 'ingwer', label: 'Ginger', category: 'fresh' },
      { keyword: 'poulet', label: 'Chicken', category: 'fresh', excludeTerms: ['chips', 'bouillon', 'geschmack', 'aroma', 'gewürz', 'zweifel', 'chörbli'], preferTerms: ['pouletbrust', 'pouletflügeli', 'pouletschnitzel'] },
      { keyword: 'joghurt', label: 'Yogurt', category: 'fresh', excludeTerms: ['twix', 'mars', 'snickers', 'schokolade', 'riegel'], preferTerms: ['naturjoghurt', 'joghurt nature'] },
      { keyword: 'kokosmilch', label: 'Coconut Milk', category: 'long-life' },
      { keyword: 'linsen', label: 'Lentils', category: 'long-life' },
      { keyword: 'kichererbsen', label: 'Chickpeas', category: 'long-life' },
      { keyword: 'spinat', label: 'Spinach', category: 'fresh', excludeTerms: ['tortelloni', 'ravioli', 'pizza', 'quiche', 'lasagne', 'plätzli'], preferTerms: ['blattspinat', 'spinat '] },
      { keyword: 'peperoni', label: 'Bell Peppers', category: 'fresh' },
      { keyword: 'kartoffeln', label: 'Potatoes', category: 'fresh', excludeTerms: ['süsskartoffel', 'cubes', 'chips', 'gratin', 'rösti', 'stock'], preferTerms: ['kartoffeln', 'festkochend', 'mehligkochend'] },
      { keyword: 'naan', label: 'Naan Bread', category: 'fresh' },
      { keyword: 'öl', label: 'Cooking Oil', category: 'long-life', excludeTerms: ['flecken', 'beckmann', 'reinig', 'pflege', 'piadina', 'brot'], preferTerms: ['sonnenblumenöl', 'rapsöl', 'frittieröl', 'olivenöl'] },
    ],
  },
  {
    name: 'mediterranean',
    label: 'Mediterranean',
    description: 'Fresh ingredients for Mediterranean-style cooking',
    items: [
      { keyword: 'olivenöl', label: 'Olive Oil', category: 'long-life', excludeTerms: ['piadina', 'brot', 'pizza', 'bruschetta'], preferTerms: ['olivenöl extra', 'olivenöl 5', 'olivenöl 1l'] },
      { keyword: 'tomaten', label: 'Tomatoes', category: 'fresh', excludeTerms: ['erde', 'hauert', 'gnocchi', 'gewürz'], preferTerms: ['tomaten ', 'cherry', 'pelati', 'tomatenpüree'] },
      { keyword: 'mozzarella', label: 'Mozzarella', category: 'fresh', excludeTerms: ['schnitzel', 'pizza', 'panini'], preferTerms: ['mozzarella ', 'mini mozzarella', 'burrata'] },
      { keyword: 'pasta', label: 'Pasta', category: 'long-life' },
      { keyword: 'knoblauch', label: 'Garlic', category: 'fresh', excludeTerms: ['spiess', 'crevette', 'fleisch', 'poulet', 'wurst', 'pizza', 'brot'], preferTerms: ['knoblauch ', 'knoblauchzehen'] },
      { keyword: 'zucchetti', label: 'Zucchini', category: 'fresh' },
      { keyword: 'aubergine', label: 'Eggplant', category: 'fresh' },
      { keyword: 'peperoni', label: 'Bell Peppers', category: 'fresh' },
      { keyword: 'feta', label: 'Feta Cheese', category: 'fresh' },
      { keyword: 'oliven', label: 'Olives', category: 'long-life', excludeTerms: ['piadina', 'brot', 'pizza'], preferTerms: ['oliven ', 'kalamata'] },
      { keyword: 'poulet', label: 'Chicken', category: 'fresh', excludeTerms: ['chips', 'bouillon', 'geschmack', 'aroma', 'gewürz'], preferTerms: ['pouletbrust', 'pouletflügeli'] },
      { keyword: 'brot', label: 'Bread', category: 'fresh', excludeTerms: ['aufstrich', 'brotaufstrich', 'chips', 'stängel'], preferTerms: ['ciabatta', 'focaccia', 'brot '] },
      { keyword: 'wein', label: 'Wine', category: 'long-life', excludeTerms: ['schwein', 'essig'], preferTerms: ['rotwein', 'weisswein', 'rosé', 'prosecco'] },
      { keyword: 'salat', label: 'Salad', category: 'fresh', excludeTerms: ['schleuder', 'schüssel', 'besteck', 'sauce'], preferTerms: ['eisberg', 'kopfsalat', 'rucola', 'nüsslisalat'] },
      { keyword: 'thunfisch', label: 'Tuna', category: 'long-life' },
    ],
  },
  {
    name: 'studentenkueche',
    label: 'Studentenküche',
    description: 'Budget basics for students',
    items: [
      { keyword: 'pasta', label: 'Pasta', category: 'long-life' },
      { keyword: 'reis', label: 'Rice', category: 'long-life' },
      { keyword: 'eier', label: 'Eggs', category: 'fresh', excludeTerms: ['nudeln', 'hörnli', 'penne', 'magronen', 'müscheli', 'spaghetti', 'teigwaren', 'pasta'], preferTerms: ['freiland', 'eier 6', 'eier 10', 'bio eier'] },
      { keyword: 'brot', label: 'Bread', category: 'fresh', excludeTerms: ['aufstrich', 'brotaufstrich', 'chips', 'stängel'], preferTerms: ['ruchbrot', 'toast', 'zopf'] },
      { keyword: 'tomaten', label: 'Tomatoes', category: 'fresh', excludeTerms: ['erde', 'hauert', 'gnocchi', 'gewürz'], preferTerms: ['tomaten ', 'cherry', 'pelati'] },
      { keyword: 'zwiebeln', label: 'Onions', category: 'fresh' },
      { keyword: 'kartoffeln', label: 'Potatoes', category: 'fresh', excludeTerms: ['süsskartoffel', 'cubes', 'chips', 'gratin', 'rösti', 'stock'], preferTerms: ['kartoffeln', 'festkochend', 'mehligkochend'] },
      { keyword: 'poulet', label: 'Chicken', category: 'fresh', excludeTerms: ['chips', 'bouillon', 'geschmack', 'aroma', 'gewürz', 'zweifel', 'chörbli'], preferTerms: ['pouletbrust', 'pouletflügeli', 'pouletschnitzel'] },
      { keyword: 'milch', label: 'Milk', category: 'fresh', excludeTerms: ['schokolade', 'branche', 'kokos', 'glace', 'shake', 'dessert', 'pudding', 'caramel'], preferTerms: ['vollmilch', 'halbfettmilch', 'milch 1l'] },
      { keyword: 'käse', label: 'Cheese', category: 'fresh', excludeTerms: ['schnitzel', 'cordon'], preferTerms: ['reibkäse', 'gruyère', 'emmentaler'] },
      { keyword: 'chips', label: 'Chips', category: 'long-life' },
      { keyword: 'bier', label: 'Beer', category: 'long-life' },
      { keyword: 'tiefkühlpizza', label: 'Frozen Pizza', category: 'long-life' },
      { keyword: 'müesli', label: 'Muesli', category: 'long-life' },
      { keyword: 'toilettenpapier', label: 'Toilet Paper', category: 'non-food' },
    ],
  },
  {
    name: 'familientisch',
    label: 'Familientisch',
    description: 'Family meals, snacks, and bulk items',
    items: [
      { keyword: 'milch', label: 'Milk', category: 'fresh', excludeTerms: ['schokolade', 'branche', 'kokos', 'glace', 'shake', 'dessert', 'pudding', 'caramel'], preferTerms: ['vollmilch', 'halbfettmilch', 'milch 1l'] },
      { keyword: 'joghurt', label: 'Yogurt', category: 'fresh', excludeTerms: ['twix', 'mars', 'snickers', 'schokolade', 'riegel'], preferTerms: ['naturjoghurt', 'joghurt nature'] },
      { keyword: 'brot', label: 'Bread', category: 'fresh', excludeTerms: ['aufstrich', 'brotaufstrich', 'chips', 'stängel'], preferTerms: ['ruchbrot', 'toast', 'zopf'] },
      { keyword: 'eier', label: 'Eggs', category: 'fresh', excludeTerms: ['nudeln', 'hörnli', 'penne', 'magronen', 'müscheli', 'spaghetti', 'teigwaren', 'pasta'], preferTerms: ['freiland', 'eier 6', 'eier 10', 'bio eier'] },
      { keyword: 'poulet', label: 'Chicken', category: 'fresh', excludeTerms: ['chips', 'bouillon', 'geschmack', 'aroma', 'gewürz', 'zweifel', 'chörbli'], preferTerms: ['pouletbrust', 'pouletflügeli', 'pouletschnitzel'] },
      { keyword: 'rüebli', label: 'Carrots', category: 'fresh' },
      { keyword: 'äpfel', label: 'Apples', category: 'fresh' },
      { keyword: 'bananen', label: 'Bananas', category: 'fresh' },
      { keyword: 'müesli', label: 'Muesli', category: 'long-life' },
      { keyword: 'pasta', label: 'Pasta', category: 'long-life' },
      { keyword: 'reis', label: 'Rice', category: 'long-life' },
      { keyword: 'fischstäbchen', label: 'Fish Fingers', category: 'fresh' },
      { keyword: 'cervelat', label: 'Cervelat', category: 'fresh' },
      { keyword: 'ketchup', label: 'Ketchup', category: 'long-life' },
      { keyword: 'waschmittel', label: 'Laundry Detergent', category: 'non-food' },
      { keyword: 'windeln', label: 'Diapers', category: 'non-food' },
    ],
  },
]

// ============================================================
// Pipeline types
// ============================================================

/**
 * Raw deal from a source, before categorization.
 * Both Migros (TS) and Coop (Python) normalize to this shape.
 */
export interface UnifiedDeal {
  store: Store
  productName: string
  originalPrice: number | null
  salePrice: number
  discountPercent: number | null // null only when originalPrice is null
  validFrom: string             // ISO date: '2026-04-09'
  validTo: string | null
  imageUrl: string | null
  sourceCategory: string | null // original category from source
  sourceUrl: string | null      // link to deal on source site

  // Optional fields emitted by aktionis Python scraper (see aktionis/normalize.py).
  // format-extract consumes these as authoritative when present and falls back to
  // regex on productName/description only when they are absent.
  quantity?: number             // e.g. 9 (total litres for 6x1.5L)
  quantityUnit?: string         // 'ml' | 'cl' | 'dl' | 'l' | 'g' | 'kg' | 'pcs'
  quantityDisplay?: string      // raw human string, e.g. '6 x 1.5 L'
  unitPriceAmount?: number      // e.g. 0.29 (CHF per unit)
  unitPricePerQty?: number      // e.g. 1 (per 1 L) or 100 (per 100 g)
  unitPriceUnit?: string        // 'l' | 'kg' | 'g' | 'ml' | 'cl'
  description?: string          // raw card description
}

/**
 * Categorized deal, ready for storage.
 * Phase 1 (v4): adds format dimensions + canonical unit pricing + confidence.
 */
export interface Deal extends UnifiedDeal {
  category: Category
  subCategory?: string | null

  // Patch F (4-level taxonomy): mid-level Category slug from taxonomy_alias.
  // Populated by pipeline/resolve-taxonomy.ts AFTER categorize.ts; null when
  // the categoriser's subCategory has no alias mapping (will be backfilled).
  categorySlug?: string | null

  // v4 format dimensions — undefined when not derivable
  format?: Format
  container?: Container
  packSize?: number             // e.g. 6 for a 6-pack; 1 for single
  unitVolumeMl?: number         // volume of one unit, for liquids
  unitWeightG?: number          // weight of one unit, for solids
  unitCount?: number            // count per pack, for piece items

  // v4 canonical unit pricing
  canonicalUnit?: CanonicalUnit
  canonicalUnitValue?: number   // total (e.g. 9 litres for 6×1.5L)
  pricePerUnit?: number         // salePrice / canonicalUnitValue

  // v4 taxonomy confidence (0..1) — see TaxonomyConfidence
  taxonomyConfidence: TaxonomyConfidence
}

// ============================================================
// Database row types (snake_case to match Supabase columns)
// ============================================================

/**
 * Deal as stored in Supabase (snake_case column names).
 * discount_percent is NOT NULL in the database.
 */
export interface DealRow {
  id: string
  store: Store
  product_name: string
  category: Category
  sub_category: string | null
  // Patch F: mid-level Category slug. Nullable until backfill completes;
  // FK to taxonomy_category(slug) enforced by the database.
  category_slug: string | null
  original_price: number | null
  sale_price: number
  discount_percent: number      // NOT NULL — pipeline calculates from prices if source omits
  valid_from: string
  valid_to: string | null
  image_url: string | null
  source_category: string | null
  source_url: string | null
  product_id: string | null
  is_active: boolean
  // v4 format + canonical unit fields (nullable — not all deals are format-aware)
  format: Format | null
  container: Container | null
  pack_size: number | null
  unit_volume_ml: number | null
  unit_weight_g: number | null
  unit_count: number | null
  canonical_unit: CanonicalUnit | null
  canonical_unit_value: number | null
  price_per_unit: number | null
  taxonomy_confidence: number   // NOT NULL — default 0.3 if unknown
  fetched_at: string
  created_at: string
  updated_at: string
}

/**
 * Pipeline run log entry.
 */
export type PipelineStoreStatus = 'success' | 'failed' | 'skipped'

export interface PipelineStoreResult {
  status: PipelineStoreStatus
  count: number
}

export interface PipelineRun {
  id: string
  run_at: string
  store_results: Partial<Record<Store, PipelineStoreResult>>
  total_stored: number
  duration_ms: number
  error_log: string | null
}

// ============================================================
// Verdict types
// ============================================================

/**
 * Verdict per category.
 */
export interface CategoryVerdict {
  category: Category
  winner: Store | 'tie'
  scores: Partial<Record<Store, number>>         // 0-100 per store
  dealCounts: Partial<Record<Store, number>>
  avgDiscounts: Partial<Record<Store, number>>
}

/**
 * Full weekly verdict.
 */
export interface WeeklyVerdict {
  weekOf: string           // ISO date of the Thursday
  categories: CategoryVerdict[]
  dataFreshness: 'current' | 'stale' | 'partial'
  lastUpdated: string
}

// ============================================================
// Category rule type (used by shared/category-rules.ts)
// ============================================================

/**
 * Category rule for keyword matching.
 */
export interface CategoryRule {
  keywords: string[]
  category: Category
  subCategory?: string
}

// ============================================================
// Product identity types (product data architecture)
// ============================================================

/**
 * Product group — links equivalent products across stores.
 * E.g., 'milk-whole-1l' groups Migros Vollmilch and Coop Milch.
 */
export interface ProductGroup {
  id: string              // slug: 'milk-whole-1l'
  label: string           // 'Whole Milk (1L)'
  category: Category
  subCategory: string | null
  searchKeywords: string[]
  excludeKeywords: string[]
  productForm: string | null
}

/**
 * ProductGroup as stored in Supabase (snake_case).
 */
export interface ProductGroupRow {
  id: string
  label: string
  category: Category
  sub_category: string | null
  search_keywords: string[]
  exclude_keywords: string[]
  product_form: string | null
  created_at: string
}

/**
 * Product — one real-world product at a specific store.
 * Has stable identity across weeks (unlike deals which are per-week).
 */
export interface Product {
  id: string
  canonicalName: string
  brand: string | null
  store: Store
  category: Category
  subCategory: string | null
  quantity: number | null
  unit: string | null
  isOrganic: boolean
  productGroup: string | null
  sourceName: string
  regularPrice: number | null
  priceUpdatedAt: string | null
  offerValidFrom: string | null
  offerValidTo: string | null
  firstSeenAt: string
  updatedAt: string
}

/**
 * Product as stored in Supabase (snake_case).
 */
export interface ProductRow {
  id: string
  canonical_name: string
  brand: string | null
  store: Store
  category: Category
  sub_category: string | null
  quantity: number | null
  unit: string | null
  is_organic: boolean
  product_group: string | null
  source_name: string
  regular_price: number | null
  price_updated_at: string | null
  offer_valid_from: string | null
  offer_valid_to: string | null
  first_seen_at: string
  updated_at: string
}

/**
 * Metadata extracted from a product name during pipeline processing.
 */
export type ProductForm = 'raw' | 'processed' | 'ready-meal' | 'canned' | 'frozen' | 'dried'

export interface ProductMetadata {
  brand: string | null
  quantity: number | null
  unit: string | null
  isOrganic: boolean
  subCategory: string | null
  productForm: ProductForm
}

// ============================================================
// Favorites types
// ============================================================

/**
 * User's saved favorites list (camelCase for frontend use).
 */
export interface Basket {
  id: string
  email: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Single item in a user's favorites list (camelCase for frontend use).
 */
export interface BasketItem {
  id: string
  basketId: string
  keyword: string
  label: string
  category: Category
  excludeTerms: string[] | null
  preferTerms: string[] | null
  productGroupId: string | null
  createdAt: string
}

/**
 * Supabase row shape for favorites (snake_case).
 */
export interface BasketRow {
  id: string
  email: string | null
  created_at: string
  updated_at: string
}

/**
 * Supabase row shape for favorite_items (snake_case).
 */
export interface BasketItemRow {
  id: string
  favorite_id: string
  keyword: string
  label: string
  category: Category
  exclude_terms: string[] | null
  prefer_terms: string[] | null
  product_group_id: string | null
  created_at: string
}

/**
 * Starter pack as stored in Supabase (snake_case).
 */
export interface StarterPackRow {
  id: string
  name: string
  label: string
  description: string | null
  items: StarterPackItem[]  // JSONB column
  sort_order: number
  is_active: boolean
  created_at: string
}

/**
 * Starter pack for frontend use (camelCase).
 */
export interface StarterPack {
  id: string
  name: string
  label: string
  description: string | null
  items: StarterPackItem[]
  sortOrder: number
  isActive: boolean
}

// ============================================================
// Comparison types
// ============================================================

/**
 * Favorite item as stored in Supabase (snake_case).
 * Alias matching the `favorite_items` table row shape.
 */
export interface FavoriteItemRow {
  id: string
  favorite_id: string
  keyword: string
  label: string
  category: Category
  exclude_terms: string[] | null
  prefer_terms: string[] | null
  product_group_id: string | null
  created_at: string
}

/**
 * Regular (shelf) price for a product at a store.
 */
export interface RegularPrice {
  price: number
  productId: string
  productName: string
  store: Store
}

/**
 * Result of matching a favorite item against active deals.
 * Used by the comparison view to build the split shopping list.
 */
export interface StoreMatch {
  deal: DealRow | null
  regularPrice: RegularPrice | null
  productKnown: boolean
}

export interface FavoriteComparison {
  favorite: BasketItem
  stores: Partial<Record<Store, StoreMatch>>
  bestStore: Store | 'none'
  bestDeal: DealRow | null
}

/**
 * Side-by-side deal comparison for the deals browsing page.
 */
export interface DealComparison {
  id: string
  label: string
  matchType: 'product-group' | 'name-similarity'
  category: Category | null
  storeDeals: Partial<Record<Store, DealRow>>
  bestStore: Store | 'tie'
}

/**
 * Full result of building deal comparisons.
 */
export interface DealComparisonResult {
  matched: DealComparison[]
  unmatched: DealRow[]
}

/**
 * A user's list items resolved to one BROWSE_CATEGORY, with all deals in that category.
 */
export interface CategoryMatch {
  browseCategory: BrowseCategory
  browseCategoryLabel: string
  browseCategoryEmoji: string
  sourceItems: BasketItem[]
  dealsByStore: Partial<Record<Store, DealRow[]>>
  totalDealCount: number
}

/**
 * Result of category-based matching for all user items.
 */
export interface CategoryMatchResult {
  categories: CategoryMatch[]
  unmappedItems: BasketItem[]
}

/**
 * Search result from product search.
 */
export interface SearchResult {
  productGroup: ProductGroupRow | null
  storeDeals: Partial<Record<Store, DealRow>>
  regularPrices: Partial<Record<Store, number>>
  label: string
  category: Category
  relevance: number
}

// ============================================================
// Conversion helpers
// ============================================================

/**
 * Converts a Deal (camelCase) to a DealRow-compatible object (snake_case) for Supabase upsert.
 */
export function dealToRow(
  deal: Deal,
  productId?: string | null,
): Omit<DealRow, 'id' | 'fetched_at' | 'created_at' | 'updated_at'> {
  return {
    store: deal.store,
    product_name: deal.productName,
    category: deal.category,
    sub_category: deal.subCategory ?? null,
    category_slug: deal.categorySlug ?? null,
    original_price: deal.originalPrice,
    sale_price: deal.salePrice,
    discount_percent: deal.discountPercent ?? 0,
    valid_from: deal.validFrom,
    valid_to: deal.validTo,
    image_url: deal.imageUrl,
    source_category: deal.sourceCategory,
    source_url: deal.sourceUrl,
    product_id: productId ?? null,
    is_active: true,
    format: deal.format ?? null,
    container: deal.container ?? null,
    pack_size: deal.packSize ?? null,
    unit_volume_ml: deal.unitVolumeMl ?? null,
    unit_weight_g: deal.unitWeightG ?? null,
    unit_count: deal.unitCount ?? null,
    canonical_unit: deal.canonicalUnit ?? null,
    canonical_unit_value: deal.canonicalUnitValue ?? null,
    price_per_unit: deal.pricePerUnit ?? null,
    taxonomy_confidence: deal.taxonomyConfidence,
  }
}
