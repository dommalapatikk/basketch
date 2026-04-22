// Lucide icons per category / sub-category — v4 spec §5 row 5.
// Lives in web/ (not shared/) because shared/ is imported by the Node
// pipeline which cannot consume React components.
//
// Fallback: Package icon for anything without a dedicated mapping.

import {
  Apple,
  Beef,
  Beer,
  Carrot,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  Drumstick,
  Droplet,
  Egg,
  Fish,
  GlassWater,
  House,
  Leaf,
  Milk,
  Package,
  Sandwich,
  Snowflake,
  Sparkles,
  Sprout,
  Utensils,
  Wheat,
  Wine,
  type LucideIcon,
} from 'lucide-react'

import type { BrowseCategory } from '@shared/types'

export const CATEGORY_ICONS: Record<BrowseCategory, LucideIcon> = {
  'fruits-vegetables': Apple,
  'meat-fish': Beef,
  dairy: Milk,
  bakery: Wheat,
  'snacks-sweets': Cookie,
  'pasta-rice-cereals': Utensils,
  drinks: GlassWater,
  'ready-meals-frozen': Snowflake,
  'pantry-canned': Package,
  home: House,
  'beauty-hygiene': Sparkles,
  all: Package,
}

/**
 * Keyed by the `sub_category` column value used in DealRow.
 * Any new sub-category falls back to <Package/> until mapped.
 */
export const SUB_CATEGORY_ICONS: Record<string, LucideIcon> = {
  fruit: Apple,
  vegetables: Carrot,
  meat: Beef,
  poultry: Drumstick,
  fish: Fish,
  deli: Sandwich,
  dairy: Milk,
  eggs: Egg,
  bread: Croissant,
  snacks: Cookie,
  chocolate: Cookie,
  'pasta-rice': Utensils,
  water: Droplet,
  juice: GlassWater,
  beer: Beer,
  wine: Wine,
  'soft-drinks': GlassWater,
  coffee: Coffee,
  tea: Leaf,
  drinks: GlassWater,
  'coffee-tea': Coffee,
  'ready-meals': ChefHat,
  frozen: Snowflake,
  canned: Package,
  condiments: Sprout,
  cleaning: House,
  laundry: House,
  'paper-goods': Package,
  household: House,
  'personal-care': Sparkles,
}

export function iconForSubCategory(subCategory: string | null | undefined): LucideIcon {
  if (!subCategory) return Package
  return SUB_CATEGORY_ICONS[subCategory] ?? Package
}

export function iconForBrowseCategory(id: BrowseCategory): LucideIcon {
  return CATEGORY_ICONS[id] ?? Package
}
