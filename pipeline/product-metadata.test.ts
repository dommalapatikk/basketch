// Tests for product metadata extraction: brand, organic flag, sub-category.

import { describe, expect, it } from 'vitest'

import { detectMeatCut, detectProductForm, extractBrand, isOrganic, detectSubCategory, extractProductMetadata } from './product-metadata'

describe('extractBrand', () => {
  it('detects Migros own brands', () => {
    expect(extractBrand('m-budget milch 1l')).toBe('M-Budget')
    expect(extractBrand('m-classic bratbutter 250g')).toBe('M-Classic')
    expect(extractBrand('naturaplan bio vollmilch 1l')).toBe('Naturaplan')
  })

  it('detects Coop own brands', () => {
    expect(extractBrand('prix garantie milch 1l')).toBe('Prix Garantie')
    expect(extractBrand('fine food olivenöl 500ml')).toBe('Fine Food')
    expect(extractBrand('betty bossi salatsauce')).toBe('Betty Bossi')
  })

  it('detects cross-store brands', () => {
    expect(extractBrand('emmi caffè latte 230ml')).toBe('Emmi')
    expect(extractBrand('barilla spaghetti n.5 500g')).toBe('Barilla')
    expect(extractBrand('lindt lindor kugeln 200g')).toBe('Lindt')
  })

  it('does not match brand substrings in other words', () => {
    // "emmi" should not match inside "emmentaler"
    expect(extractBrand('emmentaler käse 200g')).toBeNull()
  })

  it('returns null for products without known brands', () => {
    expect(extractBrand('bio vollmilch 1l')).toBeNull()
    expect(extractBrand('pouletbrust 500g')).toBeNull()
  })
})

describe('isOrganic', () => {
  it('detects bio keyword', () => {
    expect(isOrganic('bio vollmilch 1l')).toBe(true)
    expect(isOrganic('m-budget bio eier 6 stück')).toBe(true)
  })

  it('detects naturaplan', () => {
    expect(isOrganic('naturaplan joghurt 150g')).toBe(true)
  })

  it('detects demeter', () => {
    expect(isOrganic('demeter milch 1l')).toBe(true)
  })

  it('returns false for non-organic products', () => {
    expect(isOrganic('vollmilch 1l')).toBe(false)
    expect(isOrganic('m-budget milch 1l')).toBe(false)
  })

  it('does not match bio as substring', () => {
    // "bio" should be a word boundary, not inside another word
    expect(isOrganic('biosphäre 500ml')).toBe(false)
  })
})

describe('detectSubCategory', () => {
  it('detects dairy products', () => {
    expect(detectSubCategory('vollmilch 1l', null)).toBe('dairy')
    expect(detectSubCategory('joghurt nature 150g', null)).toBe('dairy')
    expect(detectSubCategory('gruyère aoc 200g', null)).toBe('dairy')
  })

  it('detects meat products', () => {
    expect(detectSubCategory('hackfleisch 500g', null)).toBe('meat')
    expect(detectSubCategory('rindsentrecôte 300g', null)).toBe('meat')
  })

  it('detects poultry', () => {
    expect(detectSubCategory('pouletbrust 400g', null)).toBe('poultry')
  })

  it('detects vegetables', () => {
    expect(detectSubCategory('rispentomaten 500g', null)).toBe('vegetables')
    expect(detectSubCategory('rüebli 1kg', null)).toBe('vegetables')
  })

  it('detects cleaning products', () => {
    expect(detectSubCategory('allzweckreiniger 1l', null)).toBe('cleaning')
  })

  it('detects personal care', () => {
    expect(detectSubCategory('nivea duschgel 250ml', null)).toBe('personal-care')
  })

  it('returns null for long-life products without specific sub-category', () => {
    expect(detectSubCategory('chips original 170g', null)).toBeNull()
  })

  it('uses sourceCategory as fallback', () => {
    expect(detectSubCategory('some product', 'milch & milchprodukte')).toBe('dairy')
  })
})

describe('extractProductMetadata', () => {
  it('extracts all metadata at once', () => {
    const meta = extractProductMetadata('naturaplan bio vollmilch 1l', 'milch')
    expect(meta.brand).toBe('Naturaplan')
    expect(meta.isOrganic).toBe(true)
    expect(meta.subCategory).toBe('dairy')
    expect(meta.productForm).toBe('raw')
  })

  it('handles product with no metadata', () => {
    const meta = extractProductMetadata('chips original 170g', null)
    expect(meta.brand).toBeNull()
    expect(meta.isOrganic).toBe(false)
    expect(meta.subCategory).toBeNull()
    expect(meta.productForm).toBe('raw')
  })

  it('detects product form for processed products', () => {
    const meta = extractProductMetadata('tomatenpüree 3x200g', null)
    expect(meta.productForm).toBe('processed')
  })
})

describe('detectProductForm', () => {
  it('detects raw products', () => {
    expect(detectProductForm('tomaten cherry 250g')).toBe('raw')
    expect(detectProductForm('pouletbrust 500g')).toBe('raw')
    expect(detectProductForm('kartoffeln festkochend')).toBe('raw')
  })

  it('detects processed products', () => {
    expect(detectProductForm('tomatenpüree 3x200g')).toBe('processed')
    expect(detectProductForm('tomatensauce basilikum')).toBe('processed')
    expect(detectProductForm('tomatenmark 70g')).toBe('processed')
    expect(detectProductForm('ketchup heinz 500ml')).toBe('processed')
    expect(detectProductForm('räucherlachs 200g')).toBe('processed')
  })

  it('detects ready meals', () => {
    expect(detectProductForm('kartoffel smoky cubes 300g')).toBe('ready-meal')
    expect(detectProductForm('chicken nuggets 500g')).toBe('ready-meal')
    expect(detectProductForm('kartoffelgratin 400g')).toBe('ready-meal')
    expect(detectProductForm('rösti 500g')).toBe('ready-meal')
  })

  it('detects frozen products', () => {
    expect(detectProductForm('pommes frites 1kg')).toBe('frozen')
    expect(detectProductForm('tiefkühl gemüse 450g')).toBe('frozen')
  })

  it('detects canned products', () => {
    expect(detectProductForm('pelati 400g')).toBe('canned')
  })

  it('detects dried products', () => {
    expect(detectProductForm('getrocknete tomaten 100g')).toBe('dried')
  })
})

describe('detectMeatCut', () => {
  it('detects breast', () => {
    expect(detectMeatCut('pouletbrust 500g')).toBe('breast')
    expect(detectMeatCut('pouletbrustfilet bio')).toBe('breast')
  })

  it('detects wings', () => {
    expect(detectMeatCut('pouletflügeli 1kg')).toBe('wings')
  })

  it('detects thigh', () => {
    expect(detectMeatCut('pouletschenkel')).toBe('thigh')
  })

  it('detects minced', () => {
    expect(detectMeatCut('hackfleisch rind 500g')).toBe('minced')
  })

  it('returns null for non-meat or unrecognized', () => {
    expect(detectMeatCut('tomaten cherry')).toBeNull()
    expect(detectMeatCut('vollmilch 1l')).toBeNull()
  })
})
