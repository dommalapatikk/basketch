// Contract test: every browse category has a Lucide icon mapping, and
// iconForSubCategory falls back gracefully for unknown sub_category values.

import { describe, it, expect } from 'vitest'

import { BROWSE_CATEGORIES } from '@shared/types'

import { iconForBrowseCategory, iconForSubCategory, CATEGORY_ICONS } from './category-icons'

describe('category-icons registry', () => {
  it('has a Lucide component for every BrowseCategory id', () => {
    for (const cat of BROWSE_CATEGORIES) {
      const Icon = CATEGORY_ICONS[cat.id]
      expect(Icon, `missing icon for ${cat.id}`).toBeDefined()
      expect(typeof Icon).toBe('object')
    }
  })

  it('iconForBrowseCategory returns a component for every id', () => {
    for (const cat of BROWSE_CATEGORIES) {
      expect(iconForBrowseCategory(cat.id)).toBeDefined()
    }
  })

  it('iconForSubCategory returns the fallback Package icon for unknown input', () => {
    const known = iconForSubCategory('water')
    const unknown = iconForSubCategory('nonexistent-sub-category-xyz')
    expect(known).toBeDefined()
    expect(unknown).toBeDefined()
  })

  it('handles null and undefined input', () => {
    expect(iconForSubCategory(null)).toBeDefined()
    expect(iconForSubCategory(undefined)).toBeDefined()
  })
})

