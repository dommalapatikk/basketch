import { Link, Outlet, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

const BASKET_KEY = 'basketch_favoriteId'

function NavLink(props: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation()
  const isActive = pathname === props.to || pathname.startsWith(props.to + '/')

  return (
    <Link
      to={props.to}
      className={cn(
        'flex min-h-[44px] items-center text-sm no-underline',
        isActive ? 'font-semibold text-accent' : 'text-muted hover:text-current',
      )}
    >
      {props.children}
    </Link>
  )
}

function getMyListPath(): string {
  try {
    const id = localStorage.getItem(BASKET_KEY)
    if (id) return `/compare/${id}`
  } catch { /* ignore */ }
  return '/onboarding'
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold no-underline">
            <img src="/favicon.svg" alt="" width="28" height="28" className="shrink-0" aria-hidden="true" />
            basketch
          </Link>
          <nav className="flex gap-4" aria-label="Main navigation">
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to={getMyListPath()}>My List</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[640px] flex-1 p-4">
        <Outlet />
      </main>
      <footer className="border-t border-border p-6 text-center">
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" width="20" height="20" aria-hidden="true" />
            <span className="text-sm font-semibold">basketch</span>
          </div>
          <nav className="flex gap-4 text-xs text-muted" aria-label="Footer navigation">
            <Link to="/deals" className="hover:text-current no-underline">Deals</Link>
            <Link to="/onboarding" className="hover:text-current no-underline">My List</Link>
            <Link to="/about" className="hover:text-current no-underline">About</Link>
          </nav>
          <p className="text-[11px] text-muted">
            Data from Migros API and aktionis.ch. Not affiliated with either store.
          </p>
        </div>
      </footer>
    </div>
  )
}
