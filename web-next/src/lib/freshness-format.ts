// Time-ago formatting for Surface 2 freshness labels (per design spec §2.8).
// Honest, low-precision rounding — users think in "this week / a few weeks / a while".

export type FreshnessAge = { value: number; unit: 'days' | 'weeks' | 'months' | '3plus' }

export function ageFromTimestamp(iso: string | null, now: Date = new Date()): FreshnessAge | null {
  if (!iso) return null
  const seenAt = new Date(iso).getTime()
  const days = Math.floor((now.getTime() - seenAt) / (1000 * 60 * 60 * 24))
  if (days <= 6) return { value: Math.max(1, days), unit: 'days' }
  if (days <= 27) return { value: Math.floor(days / 7), unit: 'weeks' }
  if (days <= 89) return { value: Math.floor(days / 30), unit: 'months' }
  return { value: 3, unit: '3plus' }
}
