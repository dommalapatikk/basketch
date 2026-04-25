export interface LoadingStateProps {
  message?: string
}

export function LoadingState(props: LoadingStateProps) {
  return (
    <div className="py-12 text-center text-muted" role="status" aria-live="polite">
      <div className="mx-auto size-6 rounded-full border-[3px] border-border border-t-accent animate-spin" />
      <p className="mt-3 text-sm">{props.message ?? 'Loading...'}</p>
    </div>
  )
}
