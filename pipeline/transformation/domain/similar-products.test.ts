import { describe, expect, it } from 'vitest'
import {
  MIN_SIMILARITY,
  brandToken,
  buildIndex,
  findSimilar,
  renderExamples,
  similarity,
  tokenise,
} from './similar-products'

const p = (productName: string, category: string, subCategory: string) => ({ productName, category, subCategory })

/** Real names from the 2026-09-10 Denner pull. */
const CACHE = [
  p('Cailler Tafelschokolade Milch', 'snacks-sweets', 'chocolate'),
  p('Cailler Tafelschokolade Crémant', 'snacks-sweets', 'chocolate'),
  p('Cailler Frigor Tafelschokolade Milch', 'snacks-sweets', 'chocolate'),
  p('Zweifel Original Chips Chnoblibrot', 'snacks-sweets', 'snacks'),
  p('Zweifel Wave Chips Inferno', 'snacks-sweets', 'snacks'),
  p('Denner Schweinsnierstück', 'meat-fish', 'meat'),
  p('Denner Schweinshuft', 'meat-fish', 'meat'),
  p('Denner Rapsöl', 'pantry-canned', 'condiments'),
  p('Barilla Penne Rigate N° 73', 'pasta-rice-cereals', 'pasta-rice'),
  p('Barilla Pesto alla Genovese', 'pantry-canned', 'condiments'),
  p('Emmi Caffè Latte Macchiato', 'dairy', 'dairy'),
  p('Knorr Gemüsebouillon', 'pantry-canned', 'condiments'),
]

describe('tokenise', () => {
  it('drops retailer house brands so they cannot become the match', () => {
    // Without this, "Denner Schweinsnierstück" and "Denner Rapsöl" match on the
    // retailer name — an actively misleading example.
    expect(tokenise('Denner Rapsöl')).toEqual(['rapsöl'])
  })

  it('drops bare numbers and short tokens', () => {
    expect(tokenise('Barilla Penne Rigate N° 73')).toEqual(['barilla', 'penne', 'rigate'])
  })

  it('handles umlauts and accents as letters', () => {
    expect(tokenise('Emmi Caffè Latte')).toEqual(['emmi', 'caffè', 'latte'])
  })
})

describe('brandToken', () => {
  it('takes the leading meaningful token as a brand proxy', () => {
    expect(brandToken('Cailler Tafelschokolade Milch')).toBe('cailler')
  })

  it('skips the retailer name', () => {
    expect(brandToken('Denner Schweinshuft')).toBe('schweinshuft')
  })

  it('returns null when nothing survives tokenising', () => {
    expect(brandToken('XXL 500')).toBeNull()
  })
})

describe('similarity', () => {
  it('scores same-brand same-form products highly', () => {
    expect(similarity('Cailler Tafelschokolade Milch', 'Cailler Tafelschokolade Crémant')).toBeGreaterThan(0.6)
  })

  it('scores unrelated products near zero', () => {
    expect(similarity('Cailler Tafelschokolade Milch', 'Knorr Gemüsebouillon')).toBe(0)
  })

  it('is symmetric', () => {
    const a = 'Zweifel Wave Chips Inferno'
    const b = 'Zweifel Original Chips Chnoblibrot'
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 10)
  })

  it('does not match two products merely because the retailer matches', () => {
    expect(similarity('Denner Rapsöl', 'Denner Schweinshuft')).toBe(0)
  })
})

describe('findSimilar', () => {
  const index = buildIndex(CACHE)

  it('finds the right neighbours for a new product of a known family', () => {
    const n = findSimilar('Cailler Tafelschokolade Pistazie', index)
    expect(n.length).toBeGreaterThan(0)
    expect(n[0]?.category).toBe('snacks-sweets')
    expect(n[0]?.subCategory).toBe('chocolate')
  })

  it('returns at most one example per category', () => {
    // Five neighbours all saying "chocolate" teach nothing and crowd out the
    // alternative the model most needs to weigh.
    const n = findSimilar('Cailler Tafelschokolade Pistazie', index, 3)
    expect(new Set(n.map((x) => x.category)).size).toBe(n.length)
  })

  it('distinguishes two products from the SAME brand in different categories', () => {
    // Barilla makes both pasta and pesto. A brand-only heuristic would get this
    // wrong; token overlap keeps them apart.
    const pasta = findSimilar('Barilla Spaghetti n.5', index)
    expect(pasta[0]?.category).toBe('pasta-rice-cereals')

    const pesto = findSimilar('Barilla Pesto Rosso', index)
    expect(pesto[0]?.category).toBe('pantry-canned')
  })

  it('returns nothing for a product unlike anything seen', () => {
    expect(findSimilar('Bosch Tassimo Kaffeemaschine', index)).toEqual([])
  })

  it('never returns the product itself', () => {
    const n = findSimilar('Denner Rapsöl', index)
    expect(n.every((x) => x.productName !== 'Denner Rapsöl')).toBe(true)
  })

  it('is deterministic — the same query gives the same neighbours', () => {
    expect(findSimilar('Zweifel Chips Paprika', index)).toEqual(findSimilar('Zweifel Chips Paprika', index))
  })

  it('respects the similarity floor', () => {
    for (const n of findSimilar('Cailler Tafelschokolade Pistazie', index)) {
      expect(n.score).toBeGreaterThanOrEqual(MIN_SIMILARITY)
    }
  })

  it('handles an empty cache — the very first run', () => {
    expect(findSimilar('Emmi Milch', buildIndex([]))).toEqual([])
  })
})

describe('renderExamples', () => {
  it('renders nothing when there are no neighbours', () => {
    expect(renderExamples([])).toBe('')
  })

  it('labels examples as previous decisions, NOT as ground truth', () => {
    // Some cached labels are wrong. A model told "these are correct" would
    // inherit our mistakes and entrench them.
    const out = renderExamples(findSimilar('Cailler Tafelschokolade Pistazie', buildIndex(CACHE)))
    expect(out).toContain('PREVIOUS DECISIONS')
    expect(out).toContain('not ground truth')
    expect(out).toContain('judge this product on its own text')
  })
})
