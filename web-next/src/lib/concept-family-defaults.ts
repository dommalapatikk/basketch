import type { ConceptVariantTile } from '@/lib/v3-types'

// Hard-coded fallback default tiles per design spec §1.4 + §1.5 "Cold-start data".
// Used when pipeline_run.deal_count is null, has < 4 rows, or is older than 14 days.
// Covers the 5 starter-pack families seeded in 20260427_v3_concept_layer.sql.
//
// Once the pipeline has 14 days of clean data, server queries should override
// these from `pipeline_run.deal_count` aggregations (S8 follow-up).

export const CONCEPT_FAMILY_DEFAULT_TILES: Record<string, ConceptVariantTile[]> = {
  milk: [
    { conceptSlug: 'milk-cow-fresh-3.5pct-1l', primaryLabel: 'Whole milk',    detailLabel: '3.5 % fat · 1 L · Fresh' },
    { conceptSlug: 'milk-cow-fresh-0.1pct-1l', primaryLabel: 'Skim',          detailLabel: '0.1 % · 1 L · Fresh'      },
    { conceptSlug: 'milk-cow-fresh-1.5pct-1l', primaryLabel: 'Semi-skimmed',  detailLabel: '1.5 % · 1 L · Fresh'      },
    { conceptSlug: 'milk-cow-uht-3.5pct-1l',   primaryLabel: 'UHT',           detailLabel: '3.5 % · 1 L · Long-life'  },
  ],
  bread: [
    { conceptSlug: 'bread-white-500g',     primaryLabel: 'White bread',  detailLabel: '500 g · Sliced'      },
    { conceptSlug: 'bread-wholemeal-500g', primaryLabel: 'Wholemeal',    detailLabel: '500 g · Sliced'      },
    { conceptSlug: 'bread-rye-500g',       primaryLabel: 'Rye',          detailLabel: '500 g'               },
    { conceptSlug: 'bread-rolls-6pack',    primaryLabel: 'Bread rolls',  detailLabel: '6 × 50 g'            },
  ],
  eggs: [
    { conceptSlug: 'eggs-medium-10pack',          primaryLabel: 'Medium',          detailLabel: '10 eggs · Cage-free'  },
    { conceptSlug: 'eggs-large-10pack',           primaryLabel: 'Large',           detailLabel: '10 eggs · Cage-free'  },
    { conceptSlug: 'eggs-organic-medium-6pack',   primaryLabel: 'Organic medium',  detailLabel: '6 eggs · Bio'          },
    { conceptSlug: 'eggs-free-range-medium-10pack', primaryLabel: 'Free-range',  detailLabel: '10 eggs · Naturafarm' },
  ],
  butter: [
    { conceptSlug: 'butter-200g',           primaryLabel: 'Butter',          detailLabel: '200 g · Fresh'    },
    { conceptSlug: 'butter-250g',           primaryLabel: 'Butter',          detailLabel: '250 g · Fresh'    },
    { conceptSlug: 'butter-organic-200g',   primaryLabel: 'Organic butter',  detailLabel: '200 g · Bio'      },
    { conceptSlug: 'butter-salted-200g',    primaryLabel: 'Salted butter',   detailLabel: '200 g'            },
  ],
  water: [
    { conceptSlug: 'water-still-1.5l',           primaryLabel: 'Still',         detailLabel: '1.5 L · PET'       },
    { conceptSlug: 'water-sparkling-1.5l',       primaryLabel: 'Sparkling',     detailLabel: '1.5 L · PET'       },
    { conceptSlug: 'water-still-6x1.5l',         primaryLabel: 'Still 6-pack',  detailLabel: '6 × 1.5 L · PET'   },
    { conceptSlug: 'water-sparkling-6x1.5l',     primaryLabel: 'Sparkling 6',   detailLabel: '6 × 1.5 L · PET'   },
  ],
}

/** True when the pipeline doesn't yet have enough clean data to derive tiles
 *  from `pipeline_run.deal_count`. Server query falls back to the constant above. */
export function shouldUseDefaultTiles(args: {
  rowCount: number | null
  lastRunAt: Date | null
}): boolean {
  if (args.rowCount === null || args.rowCount < 4) return true
  if (!args.lastRunAt) return true
  const daysAgo = (Date.now() - args.lastRunAt.getTime()) / (1000 * 60 * 60 * 24)
  return daysAgo > 14
}
