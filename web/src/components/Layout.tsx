import { Link, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5 text-xl font-bold no-underline">
            <img src="/favicon.svg" alt="" className="size-9" />
            basketch
          </Link>
          <nav className="flex gap-4">
            <Link to="/onboarding" className="flex min-h-[44px] items-center text-sm text-muted no-underline hover:text-current">
              My List
            </Link>
            <Link to="/about" className="flex min-h-[44px] items-center text-sm text-muted no-underline hover:text-current">
              About
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 p-4">
        <Outlet />
      </main>
      <footer className="p-6 text-center text-xs text-muted">
        basketch — Migros vs Coop, side by side<br />
        Built by Kiran Dommalapati
      </footer>
    </div>
  )
}
