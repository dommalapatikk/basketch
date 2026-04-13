import { Link, Outlet, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

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

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5 text-xl font-bold no-underline">
            basketch
          </Link>
          <nav className="flex gap-4" aria-label="Main navigation">
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[640px] flex-1 p-4">
        <Outlet />
      </main>
      <footer className="border-t border-border p-6 text-center">
        <p className="text-xs text-muted">
          basketch — your weekly promotions, compared. Migros vs Coop.
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Data from Migros API and aktionis.ch
        </p>
      </footer>
    </div>
  )
}
