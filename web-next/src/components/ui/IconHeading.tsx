// Section heading with a Lucide icon picked from the sub-category key.
// Spec refs: redesign-spec-v2 §3.6 (icon mappings) + §6.10 (IconHeading)
// + v2.1 §D.3 (additional mappings: Dairy, Bakery, Eggs, Pet, Baby,
// Condiments, Cereals).
//
// AC8 selector is literally `h2 > svg`, so the icon must be a direct child
// of the <h2> element. Do not wrap the icon in another span.

import {
  Apple,
  Baby,
  Beer,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Droplets,
  Drumstick,
  Egg,
  FileText,
  HeartPulse,
  Milk,
  Package,
  PawPrint,
  ShoppingCart,
  Snowflake,
  Soup,
  Sparkle,
  Sparkles,
  Wheat,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

type IconHeadingProps = {
  /** Raw sub-category key as it comes off the data feed (e.g. "wine",
   *  "paper-goods", "Beauty & Hygiene"). Matched case-insensitively. */
  subCategory: string
  /** Localised display label for the heading (already translated). */
  label: ReactNode
  /** Optional deal count to render in the subline (e.g. 4). */
  count?: number
  /** Optional store count to render in the subline (e.g. "4 stores"). */
  storesCount?: number
  /** Optional id for `aria-labelledby` wiring. */
  id?: string
  /** Optional extra subline content (renders after count/storesCount). */
  children?: ReactNode
  /** Optional className override on the <h2>. */
  className?: string
}

// Ordered list of (keyword → icon) rules. First match wins. Keywords are
// lowercase and matched against the normalised sub-category key using
// `includes`, so "Beauty & Hygiene" matches `beauty`, "personal-care"
// matches `personal care`, etc. Order matters where keywords overlap
// (e.g. `bakery` must come before generic `bread`).
const ICON_RULES: ReadonlyArray<readonly [string, LucideIcon]> = [
  // v2 §3.6 — non-food
  ['household', ShoppingCart],
  ['non-food', ShoppingCart],
  ['home & cleaning', ShoppingCart],
  ['laundry', Droplets],
  ['paper', FileText],
  ['personal care', HeartPulse],
  ['cleaning', Sparkles],
  ['beauty', Sparkle],
  ['hygiene', Sparkle],

  // Drinks (specific before generic so `wine`/`beer` win over `juice`)
  ['wine', Wine],
  ['beer', Beer],
  ['coffee', Coffee],
  ['tea', CupSoda],
  ['soft drinks', CupSoda],
  ['water', CupSoda],
  ['juice', CupSoda],

  // Snacks / chocolate / cookies
  ['chocolate', Cookie],
  ['snacks', Cookie],
  ['cookie', Cookie],

  // Grains / cereals / pasta — `bakery`/`pastry` MUST be matched before
  // generic `bread crumb` so croissant icon wins for bakery.
  ['bakery', Croissant],
  ['pastry', Croissant],
  ['pasta', Wheat],
  ['rice', Wheat],
  ['cereal', Wheat],
  ['wheat', Wheat],
  ['bread crumb', Wheat],

  // Frozen / fresh produce / meat
  ['frozen', Snowflake],
  ['vegetable', Apple],
  ['fruit', Apple],
  ['fresh', Apple],
  ['produce', Apple],
  ['meat', Drumstick],
  ['fish', Drumstick],
  ['poultry', Drumstick],

  // v2.1 §D.3
  ['dairy', Milk],
  ['milk', Milk],
  ['cheese', Milk],
  ['yogurt', Milk],
  ['eggs', Egg],
  ['egg', Egg],
  ['pet', PawPrint],
  ['baby', Baby],
  ['condiment', Soup],
  ['sauce', Soup],
]

/**
 * Pick a Lucide icon for the given sub-category key. Pure, exported for tests.
 * Normalisation: lowercase, replace `-`/`_` with a space, collapse whitespace.
 * Falls back to `Package` when nothing matches.
 */
export function iconForSubCategory(subCategory: string): LucideIcon {
  const key = subCategory
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [needle, icon] of ICON_RULES) {
    if (key.includes(needle)) return icon
  }
  return Package
}

export function IconHeading({
  subCategory,
  label,
  count,
  storesCount,
  id,
  children,
  className,
}: IconHeadingProps) {
  const Icon = iconForSubCategory(subCategory)

  // Build the optional subline from numeric props. Kept inline so the <h2>
  // direct child is still the <svg> (AC8 selector).
  const sublineParts: ReactNode[] = []
  if (typeof storesCount === 'number') {
    sublineParts.push(`${storesCount} ${storesCount === 1 ? 'store' : 'stores'}`)
  }
  if (typeof count === 'number') {
    sublineParts.push(`${count} ${count === 1 ? 'deal' : 'deals'}`)
  }
  const sublineText = sublineParts.join(' · ')

  return (
    <h2
      id={id}
      className={
        className ??
        'flex items-center gap-2 text-h2 text-lg font-semibold tracking-tight text-[var(--color-ink)]'
      }
    >
      <Icon
        className="size-5 text-[var(--color-ink-3)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span>{label}</span>
      {sublineText ? (
        <span className="ml-1 text-sm font-normal text-[var(--color-ink-3)]">
          · {sublineText}
        </span>
      ) : null}
      {children}
    </h2>
  )
}
