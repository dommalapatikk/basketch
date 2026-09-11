/**
 * Turns the `attributes` jsonb bag into a short line of human-readable facts.
 *
 * The enrich step extracts the things that decide whether two products are even
 * comparable — milk fat %, whether butter is salted, how many wash loads are in
 * a detergent, a wine's vintage. All of it sat unread in the column until now.
 *
 * THE RULE THIS INHERITS from shared/attribute-schemas.ts: a missing field means
 * the retailer DID NOT STATE the value, never that it is unknown-but-guessable.
 * An absent attribute renders as nothing — never "unknown", never a default.
 * Measured on the 2026-09-10 Denner pull, not one of the twelve dairy product
 * names stated a fat percentage, so an empty line is the normal case.
 *
 * ⚠️ WHY THE LABELS ARE COPIED RATHER THAN IMPORTED. The shapes are defined in
 * shared/attribute-schemas.ts, but web-next cannot import across the project
 * boundary — Turbopack rejects it under cacheComponents, which is why
 * lib/v3-types.ts inlines its types too. This file therefore carries a
 * DISPLAY-ONLY projection: ids, labels and units, no validation.
 *
 * Drift is safe by construction. An attribute this file has never heard of
 * falls back to a humanised version of its id, so adding a field to the schema
 * shows something reasonable here without a matching edit.
 */

export type DealAttribute = { id: string; label: string; value: string }

/**
 * How many facts a card will show.
 *
 * A well-enriched wine carries colour, vintage, grape, appellation, sweetness,
 * origin and organic all at once. Seven of those beside a price is noise, and
 * the price is what the page is for.
 */
const MAX_SHOWN = 3

/** Shown first regardless of insertion order — these move the price tier most. */
const PRIORITY_IDS = [
  'organic',
  'label',
  'dairyType',
  'animal',
  'cut',
  'washLoads',
  'plyCount',
  'coffeeForm',
  'wineColour',
]

/**
 * Attributes never worth a slot on a card.
 *
 * `storage` has its own filter facet and its own column; repeating "Chilled" on
 * every chilled product earns no room.
 */
const HIDDEN_IDS = new Set(['storage'])

/** Fields stored as booleans. Only `true` is ever rendered — see renderBoolean. */
const BOOLEAN_LABELS: Record<string, { de: string; en: string }> = {
  organic: { de: 'Bio', en: 'Organic' },
  lactoseFree: { de: 'Laktosefrei', en: 'Lactose-free' },
  glutenFree: { de: 'Glutenfrei', en: 'Gluten-free' },
  vegan: { de: 'Vegan', en: 'Vegan' },
  salted: { de: 'Gesalzen', en: 'Salted' },
  alcoholFree: { de: 'Alkoholfrei', en: 'Alcohol-free' },
  sugarFree: { de: 'Zuckerfrei', en: 'Sugar-free' },
  caffeine: { de: 'Mit Koffein', en: 'Contains caffeine' },
  decaf: { de: 'Koffeinfrei', en: 'Decaf' },
  wildCaught: { de: 'Wildfang', en: 'Wild caught' },
  inSyrup: { de: 'In Sirup', en: 'In syrup' },
  inOil: { de: 'In Öl', en: 'In oil' },
}

/** Units appended to numeric values, mirroring the `unit` field in the schema. */
const UNITS: Record<string, string> = {
  fatPercent: '%',
  cocoaPercent: '%',
  abv: '%',
  washLoads: ' loads',
  count: '',
  spf: '',
  vintage: '',
  intensity: '',
  plyCount: '-ply',
  rollCount: '',
  sheetCount: '',
}

/** Display labels for non-boolean fields. Unknown ids humanise their own key. */
const LABELS: Record<string, { de: string; en: string }> = {
  label: { de: 'Label', en: 'Quality label' },
  origin: { de: 'Herkunft', en: 'Origin' },
  dairyType: { de: 'Art', en: 'Type' },
  fatPercent: { de: 'Fett', en: 'Fat' },
  treatment: { de: 'Behandlung', en: 'Treatment' },
  cheeseFirmness: { de: 'Festigkeit', en: 'Firmness' },
  milkSource: { de: 'Milch von', en: 'Milk from' },
  flavour: { de: 'Geschmack', en: 'Flavour' },
  count: { de: 'Stück', en: 'Count' },
  size: { de: 'Grösse', en: 'Size' },
  farming: { de: 'Haltung', en: 'Farming' },
  animal: { de: 'Tier', en: 'Animal' },
  cut: { de: 'Stück', en: 'Cut' },
  preparation: { de: 'Zubereitung', en: 'Preparation' },
  priceBasis: { de: 'Preisbasis', en: 'Price basis' },
  leanness: { de: 'Magerkeit', en: 'Leanness' },
  species: { de: 'Art', en: 'Species' },
  wineColour: { de: 'Farbe', en: 'Colour' },
  vintage: { de: 'Jahrgang', en: 'Vintage' },
  grape: { de: 'Traube', en: 'Grape' },
  appellation: { de: 'Appellation', en: 'Appellation' },
  sweetness: { de: 'Süsse', en: 'Sweetness' },
  beerStyle: { de: 'Stil', en: 'Style' },
  abv: { de: 'Alkohol', en: 'Alcohol' },
  carbonation: { de: 'Kohlensäure', en: 'Carbonation' },
  container: { de: 'Gebinde', en: 'Container' },
  coffeeForm: { de: 'Form', en: 'Form' },
  capsuleSystem: { de: 'System', en: 'Capsule system' },
  intensity: { de: 'Intensität', en: 'Intensity' },
  sweetForm: { de: 'Form', en: 'Form' },
  chocolateType: { de: 'Sorte', en: 'Type' },
  cocoaPercent: { de: 'Kakao', en: 'Cocoa' },
  washLoads: { de: 'Waschgänge', en: 'Wash loads' },
  detergentForm: { de: 'Form', en: 'Form' },
  laundryVariant: { de: 'Variante', en: 'Variant' },
  plyCount: { de: 'Lagen', en: 'Ply' },
  rollCount: { de: 'Rollen', en: 'Rolls' },
  sheetCount: { de: 'Blatt pro Rolle', en: 'Sheets per roll' },
  petAnimal: { de: 'Für', en: 'For' },
  petFoodForm: { de: 'Form', en: 'Form' },
  lifeStage: { de: 'Alter', en: 'Life stage' },
  preservation: { de: 'Konservierung', en: 'Preservation' },
  pantryType: { de: 'Art', en: 'Type' },
  oilType: { de: 'Öl', en: 'Oil' },
  heatLevel: { de: 'Schärfe', en: 'Heat' },
  careType: { de: 'Art', en: 'Type' },
  targetGroup: { de: 'Für', en: 'For' },
  spf: { de: 'LSF', en: 'SPF' },
}

/** Picks the attributes worth showing for one deal, in display order. */
export function visibleAttributes(
  attributes: Record<string, unknown> | undefined | null,
  locale: string,
): DealAttribute[] {
  if (!attributes) return []

  const out: DealAttribute[] = []
  for (const [id, raw] of Object.entries(attributes)) {
    if (HIDDEN_IDS.has(id)) continue
    const value = formatValue(id, raw, locale)
    if (value === null) continue
    out.push({ id, label: labelFor(id, locale), value })
  }

  return out.sort((a, b) => rank(a.id) - rank(b.id)).slice(0, MAX_SHOWN)
}

function rank(id: string): number {
  const i = PRIORITY_IDS.indexOf(id)
  return i === -1 ? PRIORITY_IDS.length : i
}

function labelFor(id: string, locale: string): string {
  const entry = LABELS[id]
  if (entry) return locale === 'de' ? entry.de : entry.en
  // Unknown id — humanise the key rather than dropping the fact on the floor.
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/**
 * Renders one attribute, or null when there is nothing honest to show.
 *
 * `false` is treated as absent deliberately: "Not organic" is noise on a card,
 * and retailers state the positive case only.
 */
function formatValue(id: string, raw: unknown, locale: string): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (typeof raw === 'boolean') {
    if (!raw) return null
    const entry = BOOLEAN_LABELS[id]
    return entry ? (locale === 'de' ? entry.de : entry.en) : labelFor(id, locale)
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return `${raw}${UNITS[id] ?? ''}`
  }

  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Enum values are stored as slugs ('per-100g', 'rot'). Title-case them rather
  // than pretending we hold a translation we do not.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Whether a boolean-labelled attribute renders as a standalone word.
 *
 * "Bio" reads on its own; "Fett 3.5%" needs its label. Used by the card to
 * decide between `Label value` and a bare chip.
 */
export function isStandaloneAttribute(id: string): boolean {
  return id in BOOLEAN_LABELS
}
