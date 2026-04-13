import { Link } from 'react-router-dom'

import { usePageTitle } from '../lib/hooks'
import { Card } from '../components/ui/Card'
import { buttonVariants } from '../components/ui/Button'

export function AboutPage() {
  usePageTitle('About')
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">About basketch</h1>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-base leading-loose">
          <li>Every Wednesday evening, we fetch this week's promotions from Migros and Coop.</li>
          <li>We categorise every deal into Fresh, Long-life, or Non-food and calculate a weekly verdict.</li>
          <li>You see the verdict instantly. Browse all deals, or track your regular items for a personal comparison.</li>
        </ol>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Data sources</h2>
        <ul className="list-disc space-y-2 pl-5 text-base leading-loose">
          <li><strong>Migros promotions:</strong> via the Migros API (open source wrapper)</li>
          <li><strong>Coop promotions:</strong> via aktionis.ch (public deal aggregator since 2006)</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          We only use publicly available data. No scraping of protected websites. Deal data is refreshed weekly.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">What we compare</h2>
        <p className="text-base leading-relaxed">
          basketch compares weekly promotions, not regular shelf prices.
          Promotions change every week and are the reason you might switch stores.
          Regular prices are stable — you already know what milk costs.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Privacy</h2>
        <ul className="list-disc space-y-2 pl-5 text-base leading-loose">
          <li>No account required</li>
          <li>No tracking cookies</li>
          <li>Email is optional and only used to find your list</li>
          <li>We use Vercel Analytics (anonymous page view counts, no personal data)</li>
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Built by</h2>
        <p className="text-base leading-relaxed">
          Kiran Dommalapati, Bern.
          A real product for a tiny audience, documented like a portfolio project.
        </p>
      </Card>

      <div className="mt-8 text-center">
        <Link to="/onboarding" className={buttonVariants()}>
          Get started — build your list
        </Link>
      </div>
    </div>
  )
}
