// Verdict → WhatsApp deep-link helper per v4 spec §8.
// Kept pure (no React imports) so tests run without env setup.

import type { WeeklyVerdict } from '@shared/types'
import { STORE_META } from '@shared/types'

/**
 * Build a share-ready summary line from the verdict.
 * Example: "Coop wins Fresh · Denner wins Long-life · 20 deals"
 */
export function verdictSummary(verdict: WeeklyVerdict): string {
  const winners = verdict.categories.filter((c) => c.winner !== 'tie' && c.winner != null)
  if (winners.length === 0) return 'Similar promotions across stores this week.'

  const totalDeals = verdict.categories.reduce(
    (n, c) => n + Object.values(c.dealCounts).reduce((a, b) => a + (b ?? 0), 0),
    0,
  )

  const parts = winners.map((c) => {
    const catLabel =
      c.category === 'fresh' ? 'Fresh'
        : c.category === 'long-life' ? 'Long-life'
          : 'Household'
    const storeLabel = c.winner !== 'tie' && c.winner != null
      ? STORE_META[c.winner].label
      : '—'
    return `${storeLabel} wins ${catLabel}`
  })

  return `${parts.join(' · ')} · ${totalDeals} deals`
}

const SITE_URL = 'https://basketch.vercel.app'

/**
 * Build the text blob sent to WhatsApp. Four lines, ready to paste.
 * Uses weekOf as a stable slug (no DB change needed).
 */
export function verdictShareText(verdict: WeeklyVerdict): string {
  return [
    'basketch verdict',
    verdictSummary(verdict),
    `See the deals → ${SITE_URL}/deals`,
  ].join('\n')
}

/**
 * WhatsApp deep link — opens the share sheet on mobile, wa.me/send on desktop.
 * Spec §8.
 */
export function verdictWhatsAppUrl(verdict: WeeklyVerdict): string {
  return `https://wa.me/?text=${encodeURIComponent(verdictShareText(verdict))}`
}
