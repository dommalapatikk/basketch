import { Link } from 'react-router-dom'

import { usePageTitle } from '../lib/hooks'
import { buttonVariants } from '../components/ui/Button'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <div className="py-12 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page you are looking for does not exist.
      </p>
      <Link to="/" className={buttonVariants({ className: 'mt-6' })}>
        Back to home
      </Link>
    </div>
  )
}
