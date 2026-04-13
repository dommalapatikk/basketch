import { describe, it, expect } from 'vitest'

import { CATEGORY_RULES, DEFAULT_CATEGORY, matchCategory } from './category-rules'
import { BROWSE_CATEGORIES } from './types'

describe('CATEGORY_RULES', () => {
  it('default category is long-life', () => {
    expect(DEFAULT_CATEGORY).toBe('long-life')
  })

  it('every rule has at least one keyword', () => {
    for (const rule of CATEGORY_RULES) {
      expect(rule.keywords.length).toBeGreaterThan(0)
    }
  })

  it('every rule has a valid category', () => {
    const validCategories = ['fresh', 'long-life', 'non-food']
    for (const rule of CATEGORY_RULES) {
      expect(validCategories).toContain(rule.category)
    }
  })

  it('covers all 23 sub-categories used in BROWSE_CATEGORIES', () => {
    const allDbSubCategories = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    const ruleSubCategories = new Set(
      CATEGORY_RULES
        .map(r => r.subCategory)
        .filter((s): s is string => s !== undefined),
    )

    for (const sub of allDbSubCategories) {
      expect(ruleSubCategories.has(sub)).toBe(true)
    }
  })
})

describe('matchCategory', () => {
  // Fresh products
  it('categorises "Vollmilch 1L" as fresh > dairy', () => {
    const result = matchCategory('Vollmilch 1L')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('dairy')
  })

  it('categorises "Bio Joghurt Nature" as fresh > dairy', () => {
    const result = matchCategory('Bio Joghurt Nature')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('dairy')
  })

  it('categorises "Schweizer Eier 10er" as fresh > eggs', () => {
    const result = matchCategory('Schweizer Eier 10er')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('eggs')
  })

  it('categorises "Rindfleisch Hackfleisch" as fresh > meat', () => {
    const result = matchCategory('Rindfleisch Hackfleisch')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('meat')
  })

  it('categorises "Pouletbrust" as fresh > poultry', () => {
    const result = matchCategory('Pouletbrust')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('poultry')
  })

  it('categorises "Cervelat 2er" as fresh > deli', () => {
    const result = matchCategory('Cervelat 2er')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('deli')
  })

  it('categorises "Lachs Filet" as fresh > fish', () => {
    const result = matchCategory('Lachs Filet')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('fish')
  })

  it('categorises "Ruchbrot 500g" as fresh > bread', () => {
    const result = matchCategory('Ruchbrot 500g')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('bread')
  })

  it('categorises "Rispentomaten" as fresh > vegetables', () => {
    const result = matchCategory('Rispentomaten')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('vegetables')
  })

  it('categorises "Erdbeeren 500g" as fresh > fruit', () => {
    const result = matchCategory('Erdbeeren 500g')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('fruit')
  })

  // Long-life products
  it('categorises "Tiefkühlpizza Margherita" as long-life > frozen', () => {
    const result = matchCategory('Tiefkühlpizza Margherita')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('frozen')
  })

  it('categorises "Barilla Spaghetti No.5" as long-life > pasta-rice', () => {
    const result = matchCategory('Barilla Spaghetti No.5')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('pasta-rice')
  })

  it('categorises "Nespresso Kapseln" as long-life > coffee-tea', () => {
    const result = matchCategory('Nespresso Kapseln')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('coffee-tea')
  })

  it('categorises "Rivella Rot 6x1.5L" as long-life > drinks', () => {
    const result = matchCategory('Rivella Rot 6x1.5L')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('drinks')
  })

  it('categorises "Zweifel Paprika Chips" as long-life > snacks', () => {
    const result = matchCategory('Zweifel Paprika Chips')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('snacks')
  })

  it('categorises "Lindt Schokolade 100g" as long-life > chocolate', () => {
    const result = matchCategory('Lindt Schokolade 100g')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('chocolate')
  })

  it('categorises "Rote Bohnen Konserve 400g" as long-life > canned', () => {
    const result = matchCategory('Rote Bohnen Konserve 400g')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('canned')
  })

  it('categorises "Heinz Ketchup 500ml" as long-life > condiments', () => {
    const result = matchCategory('Heinz Ketchup 500ml')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBe('condiments')
  })

  // Non-food products
  it('categorises "Persil Waschmittel" as non-food > laundry', () => {
    const result = matchCategory('Persil Waschmittel')
    expect(result.category).toBe('non-food')
    expect(result.subCategory).toBe('laundry')
  })

  it('categorises "Swiffer Bodenwischer" as non-food > cleaning', () => {
    const result = matchCategory('Swiffer Bodenwischer')
    expect(result.category).toBe('non-food')
    expect(result.subCategory).toBe('cleaning')
  })

  it('categorises "Nivea Duschgel" as non-food > personal-care', () => {
    const result = matchCategory('Nivea Duschgel')
    expect(result.category).toBe('non-food')
    expect(result.subCategory).toBe('personal-care')
  })

  it('categorises "Tempo Taschentücher" as non-food > paper-goods', () => {
    const result = matchCategory('Tempo Taschentücher')
    expect(result.category).toBe('non-food')
    expect(result.subCategory).toBe('paper-goods')
  })

  it('categorises "Pampers Windeln Grösse 4" as non-food > household', () => {
    const result = matchCategory('Pampers Windeln Grösse 4')
    expect(result.category).toBe('non-food')
    expect(result.subCategory).toBe('household')
  })

  // Default fallback
  it('falls back to long-life with null sub-category for unknown products', () => {
    const result = matchCategory('XYZ Unbekanntes Produkt')
    expect(result.category).toBe('long-life')
    expect(result.subCategory).toBeNull()
  })

  // Case insensitive
  it('matches case-insensitively', () => {
    const result = matchCategory('MILCH VOLLMILCH')
    expect(result.category).toBe('fresh')
    expect(result.subCategory).toBe('dairy')
  })
})
