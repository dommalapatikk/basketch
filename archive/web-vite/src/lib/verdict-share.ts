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
 * Permalink URL for the verdict of a given week.
 * The VerdictPage route at /v/:weekOf reconstructs the verdict from the
 * deal rows whose validity range includes weekOf — no DB-side snapshot needed.
 */
export function verdictPermalinkUrl(verdict: WeeklyVerdict): string {
  return `${SITE_URL}/v/${verdict.weekOf}`
}

/**
 * Build the text blob sent to WhatsApp. Three lines, ready to paste.
 * Links to the permalink page so the recipient sees the frozen verdict,
 * not whatever the live /deals page shows after the week rolls over.
 */
export function verdictShareText(verdict: WeeklyVerdict): string {
  return [
    'basketch verdict',
    verdictSummary(verdict),
    `See the verdict → ${verdictPermalinkUrl(verdict)}`,
  ].join('\n')
}

/**
 * WhatsApp deep link — opens the share sheet on mobile, wa.me/send on desktop.
 * Spec §8.
 */
export function verdictWhatsAppUrl(verdict: WeeklyVerdict): string {
  return `https://wa.me/?text=${encodeURIComponent(verdictShareText(verdict))}`
}
