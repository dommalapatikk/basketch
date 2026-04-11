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
        isActive ? 'font-semibold text-current' : 'text-muted hover:text-current',
      )}
    >
      {props.children}
    </Link>
  )
}

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
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to="/onboarding">New List</NavLink>
            <NavLink to="/about">About</NavLink>
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
