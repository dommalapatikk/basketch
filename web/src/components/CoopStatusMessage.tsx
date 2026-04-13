/**
 * Two-tier Coop status messages for the comparison page.
 *
 * Tier 1 (coopProductKnown = true): Product seen at Coop before, not on sale now.
 * Tier 2 (coopProductKnown = false): Product never seen at Coop.
 *
 * Both tiers use full-opacity #666 text (5.7:1 contrast, WCAG AA).
 * Tier 2 is differentiated by an info icon, not opacity.
 */
export interface CoopStatusMessageProps {
  coopProductKnown: boolean
}

export function CoopStatusMessage(props: CoopStatusMessageProps) {
  if (props.coopProductKnown) {
    return (
      <p className="text-sm italic text-muted">
        Not on promotion at Coop this week
      </p>
    )
  }

  return (
    <p className="text-sm italic text-muted" role="note">
      <svg
        className="mr-1 inline-block size-3.5 align-text-bottom"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM7 7h2v5H7V7z" />
      </svg>
      We haven't found this at Coop yet — check back next week.
    </p>
  )
}
