import { Card } from '../components/ui/Card'

export function AboutPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">About basketch</h1>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
          <li>Every Wednesday evening, we fetch this week's promotions from Migros and Coop.</li>
          <li>You pick a starter pack or build your own list of regular items.</li>
          <li>We match your items against active deals from both stores.</li>
          <li>You get a split shopping list: what to buy where.</li>
        </ol>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Data sources</h2>
        <ul className="list-disc space-y-1 pl-5 leading-relaxed">
          <li><strong>Migros</strong> — Official product API via migros-api-wrapper</li>
          <li><strong>Coop</strong> — Public deal aggregator aktionis.ch</li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          Only publicly available data is used. No scraping of bot-protected sites.
          Deal data is refreshed weekly.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Privacy</h2>
        <p className="text-sm">
          basketch stores only your favorites list and optional email address.
          No tracking, no ads, no personal data sold. Your email is used solely to
          retrieve your list — nothing else.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Built by</h2>
        <p className="text-sm">
          Kiran Dommalapati — a weekend shopper tired of checking two websites.
        </p>
      </Card>
    </div>
  )
}
