import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { useBasketContext } from '@/lib/basket-context'

function NavLink(props: { to: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  const { pathname } = useLocation()
  const isActive = pathname === props.to || pathname.startsWith(props.to + '/')

  return (
    <Link
      to={props.to}
      onClick={props.onClick}
      aria-current={isActive ? 'page' : undefined}
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
  const { basketId } = useBasketContext()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const myListPath = basketId ? `/compare/${basketId}` : '/deals'

  function handleMyListClick(e: React.MouseEvent) {
    e.preventDefault()
    setMobileMenuOpen(false)
    if (basketId) {
      navigate(`/compare/${basketId}`)
    } else {
      navigate('/deals')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold no-underline" onClick={() => setMobileMenuOpen(false)}>
            <img src="/favicon.svg" alt="" width="28" height="28" className="shrink-0" aria-hidden="true" />
            basketch
          </Link>

          {/* Desktop nav */}
          <nav className="hidden gap-4 md:flex" aria-label="Main navigation">
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to={myListPath} onClick={handleMyListClick}>My List</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>

          {/* Mobile hamburger button */}
          <button
            type="button"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <nav className="mx-auto mt-2 flex max-w-[640px] flex-col gap-1 border-t border-border pt-2 md:hidden" aria-label="Mobile navigation">
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to={myListPath} onClick={handleMyListClick}>My List</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        )}
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[640px] flex-1 p-4" onClick={() => setMobileMenuOpen(false)}>
        <Outlet />
      </main>
      <footer className="safe-area-bottom border-t border-border p-6 text-center">
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" width="20" height="20" aria-hidden="true" />
            <span className="text-sm font-semibold">basketch</span>
          </div>
          <nav className="flex gap-4 text-xs text-muted" aria-label="Footer navigation">
            <Link to="/deals" className="hover:text-current no-underline">Deals</Link>
            <Link to={myListPath} onClick={handleMyListClick} className="hover:text-current no-underline">My List</Link>
            <Link to="/about" className="hover:text-current no-underline">About</Link>
          </nav>
          <p className="text-[11px] text-muted">
            Deal data from aktionis.ch. Not affiliated with any store.
          </p>
        </div>
      </footer>
    </div>
  )
}
