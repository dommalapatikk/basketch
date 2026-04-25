export interface StaleBannerProps {
  lastUpdated: string
}

export function StaleBanner(props: StaleBannerProps) {
  const date = new Date(props.lastUpdated)
  const formatted = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="rounded-md bg-warning-light p-3 text-sm text-warning" role="status" aria-live="polite">
      Deals may be outdated — last updated{' '}
      <time dateTime={props.lastUpdated}>{formatted}</time>
    </div>
  )
}
