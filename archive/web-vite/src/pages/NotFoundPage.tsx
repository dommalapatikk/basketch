import { Link } from 'react-router-dom'

import { usePageTitle } from '../lib/hooks'
import { buttonVariants } from '../components/ui/Button'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-3 text-base text-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-12 space-y-3">
        <Link to="/" className={buttonVariants({ fullWidth: true })}>
          Go to home page
        </Link>
        <Link to="/deals" className={buttonVariants({ variant: 'outline', fullWidth: true })}>
          Browse this week's deals
        </Link>
      </div>
    </div>
  )
}
