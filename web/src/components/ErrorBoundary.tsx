import { Component, type ErrorInfo, type ReactNode } from 'react'

import { buttonVariants } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
          <p className="mb-6 text-sm text-muted">
            An unexpected error occurred. Try reloading the page.
          </p>
          <a
            href="/"
            className={buttonVariants()}
          >
            Back to home
          </a>
        </div>
      )
    }

    return this.props.children
  }
}
