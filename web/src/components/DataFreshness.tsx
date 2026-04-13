export interface DataFreshnessProps {
  lastUpdated: string | null
}

export function DataFreshness(props: DataFreshnessProps) {
  if (!props.lastUpdated) return null
  const date = new Date(props.lastUpdated)
  const formatted = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return (
    <p className="text-xs text-muted">
      Deals updated: <time dateTime={props.lastUpdated}>{formatted}</time>
    </p>
  )
}
