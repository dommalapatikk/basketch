// Retrieval few-shot — the agent's memory, used.
//
// The cache already holds every product we have ever classified. Today it is a
// lookup table: exact hit or nothing. But a NEW product is rarely unlike
// everything seen before — "Cailler Tafelschokolade Pistazie" arrives in a cache
// already holding nine other Cailler Tafelschokolade bars.
//
// So instead of asking the model cold, we show it what we decided for the
// nearest neighbours. That is retrieval-augmented classification, and it turns
// the cache from a cost saver into a source of accuracy.
//
// NO EMBEDDINGS ON PURPOSE. An embedding model is another dependency, another
// ~470 MB download in CI, and another thing to version. Swiss product names are
// short, brand-led and highly repetitive, so lexical overlap captures most of
// the signal — and unlike a vector score, a reviewer can see exactly why a
// neighbour was chosen.

export type LabelledProduct = {
  readonly productName: string
  readonly category: string
  readonly subCategory: string
}

export type Neighbour = LabelledProduct & { readonly score: number }

/**
 * Words that carry no signal about what a product IS. Dropping them stops
 * "Denner Schweinsnierstück" matching "Denner Rapsöl" on the retailer's own
 * house brand, which would be an actively misleading example.
 */
const STOPWORDS = new Set([
  'denner', 'coop', 'migros', 'aldi', 'lidl', 'spar', 'volg',
  'bio', 'original', 'classic', 'mit', 'und', 'der', 'die', 'das',
  'de', 'la', 'le', 'el', 'di', 'al', 'per', 'von', 'aus', 'für',
  'xxl', 'mini', 'maxi', 'pack', 'stück', 'stuck',
])

/** Tokens: lowercase words of 3+ chars, minus stopwords and bare numbers. */
export function tokenise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

/**
 * The first meaningful token, used as a brand proxy.
 *
 * Swiss product names are overwhelmingly "Brand Product Variant", so the leading
 * token is a strong categorical signal: every Cailler is chocolate, every Zweifel
 * is crisps, every Knorr is a cooking product.
 */
export function brandToken(name: string): string | null {
  return tokenise(name)[0] ?? null
}

/**
 * Similarity in [0, 1].
 *
 * Jaccard overlap on tokens, plus a bonus when the leading (brand) token matches.
 * Deliberately simple and inspectable — a reviewer can read a name and see why
 * two products scored as they did.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokenise(a))
  const tb = new Set(tokenise(b))
  if (ta.size === 0 || tb.size === 0) return 0

  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  const union = ta.size + tb.size - shared
  const jaccard = union === 0 ? 0 : shared / union

  const brandA = brandToken(a)
  const brandMatch = brandA !== null && brandA === brandToken(b) ? 0.3 : 0

  return Math.min(1, jaccard + brandMatch)
}

/** Inverted index so a lookup does not scan the whole cache per product. */
export type SimilarityIndex = {
  readonly byToken: Map<string, LabelledProduct[]>
  readonly size: number
}

export function buildIndex(products: readonly LabelledProduct[]): SimilarityIndex {
  const byToken = new Map<string, LabelledProduct[]>()
  for (const p of products) {
    for (const t of new Set(tokenise(p.productName))) {
      const bucket = byToken.get(t)
      if (bucket) bucket.push(p)
      else byToken.set(t, [p])
    }
  }
  return { byToken, size: products.length }
}

/** Below this, a "neighbour" is noise and a misleading example. */
export const MIN_SIMILARITY = 0.25

/**
 * The nearest already-classified products.
 *
 * Returns at most one example per category. Five neighbours that all say
 * "chocolate" tell the model nothing it could not infer from one, and crowd out
 * the alternative it most needs to consider.
 */
export function findSimilar(
  productName: string,
  index: SimilarityIndex,
  limit = 3,
): Neighbour[] {
  const candidates = new Map<string, LabelledProduct>()
  for (const t of new Set(tokenise(productName))) {
    for (const p of index.byToken.get(t) ?? []) {
      if (p.productName !== productName) candidates.set(p.productName, p)
    }
  }

  const scored: Neighbour[] = []
  for (const c of candidates.values()) {
    const score = similarity(productName, c.productName)
    if (score >= MIN_SIMILARITY) scored.push({ ...c, score })
  }

  scored.sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName, 'de-CH'))

  const seenCategories = new Set<string>()
  const out: Neighbour[] = []
  for (const n of scored) {
    if (seenCategories.has(n.category)) continue
    seenCategories.add(n.category)
    out.push(n)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Renders neighbours as prompt examples.
 *
 * Labelled as PREVIOUS DECISIONS, not as ground truth: some of them will be
 * wrong, and a model told "these are correct" would inherit our mistakes and
 * entrench them. This is context, not instruction.
 */
export function renderExamples(neighbours: readonly Neighbour[]): string {
  if (neighbours.length === 0) return ''
  const lines = neighbours.map((n) => `- "${n.productName}" → ${n.category} / ${n.subCategory}`).join('\n')
  return `PREVIOUS DECISIONS on similar products (context, not ground truth — judge this product on its own text):\n${lines}\n`
}
