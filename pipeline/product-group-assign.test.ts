import { describe, expect, it } from 'vitest'

import { assignProductGroup } from './product-group-assign'

describe('assignProductGroup', () => {
  // ============================================================
  // CHICKEN — must distinguish cuts
  // ============================================================
  it('assigns chicken breast correctly', () => {
    expect(assignProductGroup('pouletbrust 500g')?.groupId).toBe('chicken-breast')
    expect(assignProductGroup('pouletschnitzel mariniert')?.groupId).toBe('chicken-breast')
    expect(assignProductGroup('optigal pouletbrustfilet')?.groupId).toBe('chicken-breast')
  })

  it('assigns chicken wings correctly', () => {
    expect(assignProductGroup('pouletflügeli 1kg')?.groupId).toBe('chicken-wings')
    expect(assignProductGroup('chicken wings bbq')?.groupId).toBe('chicken-wings')
  })

  it('assigns chicken nuggets correctly', () => {
    expect(assignProductGroup('poulet nuggets 500g')?.groupId).toBe('chicken-nuggets')
    expect(assignProductGroup('chicken nuggets')?.groupId).toBe('chicken-nuggets')
  })

  it('does NOT assign bare "poulet" to chicken-breast', () => {
    // bare "poulet" doesn't match any chicken rule (they all require specific cuts)
    expect(assignProductGroup('poulet')?.groupId).not.toBe('chicken-breast')
  })

  // ============================================================
  // TOMATOES — must distinguish fresh from processed
  // ============================================================
  it('assigns fresh tomatoes correctly', () => {
    expect(assignProductGroup('tomaten cherry 250g')?.groupId).toBe('tomatoes-fresh')
    expect(assignProductGroup('rispentomaten 500g')?.groupId).toBe('tomatoes-fresh')
  })

  it('assigns tomato puree separately from fresh', () => {
    expect(assignProductGroup('tomatenpüree 3x200g')?.groupId).toBe('tomato-puree')
    expect(assignProductGroup('tomatenmark 70g')?.groupId).toBe('tomato-puree')
  })

  it('assigns tomato sauce separately', () => {
    expect(assignProductGroup('tomatensauce basilikum')?.groupId).toBe('tomato-sauce')
    expect(assignProductGroup('passata 500ml')?.groupId).toBe('tomato-sauce')
  })

  it('assigns canned tomatoes separately', () => {
    expect(assignProductGroup('pelati 400g')?.groupId).toBe('tomatoes-canned')
    expect(assignProductGroup('tomatenstücke 400g')?.groupId).toBe('tomatoes-canned')
  })

  it('does NOT assign tomatenpüree to fresh tomatoes', () => {
    expect(assignProductGroup('tomatenpüree 3x200g')?.groupId).not.toBe('tomatoes-fresh')
  })

  // ============================================================
  // POTATOES — must distinguish raw from ready meals
  // ============================================================
  it('assigns raw potatoes correctly', () => {
    expect(assignProductGroup('kartoffeln festkochend 2kg')?.groupId).toBe('potatoes')
  })

  it('assigns potato ready meals separately', () => {
    expect(assignProductGroup('kartoffel smoky cubes 300g')?.groupId).toBe('potato-ready-meal')
    expect(assignProductGroup('kartoffelgratin 400g')?.groupId).toBe('potato-ready-meal')
    expect(assignProductGroup('rösti 500g')?.groupId).toBe('potato-ready-meal')
  })

  it('assigns frozen fries separately', () => {
    expect(assignProductGroup('pommes frites 1kg')?.groupId).toBe('fries-frozen')
  })

  it('does NOT assign kartoffel smoky cubes to raw potatoes', () => {
    expect(assignProductGroup('kartoffel smoky cubes')?.groupId).not.toBe('potatoes')
  })

  // ============================================================
  // MILK — must distinguish cow milk from plant milk
  // ============================================================
  it('assigns cow milk correctly', () => {
    expect(assignProductGroup('m-budget vollmilch 1l')?.groupId).toBe('milk-whole-1l')
    expect(assignProductGroup('prix garantie milch 1l')?.groupId).toBe('milk-whole-1l')
    expect(assignProductGroup('halbfettmilch 1l')?.groupId).toBe('milk-whole-1l')
  })

  it('assigns plant milk separately', () => {
    expect(assignProductGroup('hafermilch 1l')?.groupId).toBe('milk-plant')
    expect(assignProductGroup('sojamilch bio')?.groupId).toBe('milk-plant')
  })

  it('does NOT assign milchschokolade to milk', () => {
    expect(assignProductGroup('milchschokolade 100g')?.groupId).not.toBe('milk-whole-1l')
  })

  // ============================================================
  // PRODUCT FORM
  // ============================================================
  it('assigns correct product form', () => {
    expect(assignProductGroup('tomatenpüree 3x200g')?.productForm).toBe('processed')
    expect(assignProductGroup('kartoffel smoky cubes')?.productForm).toBe('ready-meal')
    expect(assignProductGroup('pommes frites 1kg')?.productForm).toBe('frozen')
    expect(assignProductGroup('pelati 400g')?.productForm).toBe('canned')
    expect(assignProductGroup('tomaten cherry 250g')?.productForm).toBe('raw')
    expect(assignProductGroup('chicken nuggets')?.productForm).toBe('ready-meal')
  })

  // ============================================================
  // RETURNS NULL FOR UNKNOWN PRODUCTS
  // ============================================================
  it('returns null for unrecognized products', () => {
    expect(assignProductGroup('airfryer xxl 5.5l')).toBeNull()
    expect(assignProductGroup('ferrari modell 1:43')).toBeNull()
  })
})
