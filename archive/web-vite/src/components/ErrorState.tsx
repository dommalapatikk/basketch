import { Button } from './ui/Button'

export interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState(props: ErrorStateProps) {
  return (
    <div
      className="rounded-md border border-[#fecaca] bg-error-light p-4 text-center"
      role="alert"
    >
      <p className="text-sm font-medium text-error">
        {props.message ?? 'Something went wrong. Please try again.'}
      </p>
      {props.onRetry && (
        <Button
          className="mt-3"
          onClick={props.onRetry}
          type="button"
        >
          Try again
        </Button>
      )}
    </div>
  )
}
