export function AboutPage() {
  return (
    <div>
      <h1 className="page-title">About basketch</h1>

      <div className="card">
        <h2 className="section-title">How it works</h2>
        <ol className="pl-20 lh-loose">
          <li>Every Wednesday evening, we fetch this week's promotions from Migros and Coop.</li>
          <li>You pick a starter pack or build your own list of regular items.</li>
          <li>We match your items against active deals from both stores.</li>
          <li>You get a split shopping list: what to buy where.</li>
        </ol>
      </div>

      <div className="card mt-16">
        <h2 className="section-title">Data sources</h2>
        <ul className="pl-20 lh-loose">
          <li><strong>Migros</strong> — Official product API via migros-api-wrapper</li>
          <li><strong>Coop</strong> — Public deal aggregator aktionis.ch</li>
        </ul>
        <p className="text-sm text-muted mt-8">
          Only publicly available data is used. No scraping of bot-protected sites.
          Deal data is refreshed weekly.
        </p>
      </div>

      <div className="card mt-16">
        <h2 className="section-title">Privacy</h2>
        <p className="text-sm">
          basketch stores only your favorites list and optional email address.
          No tracking, no ads, no personal data sold. Your email is used solely to
          retrieve your list — nothing else.
        </p>
      </div>

      <div className="card mt-16">
        <h2 className="section-title">Built by</h2>
        <p className="text-sm">
          Kiran Dommalapati — a weekend shopper tired of checking two websites.
        </p>
      </div>
    </div>
  )
}
