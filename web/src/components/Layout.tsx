import { Link, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="header-logo">
            <img src="/favicon.svg" alt="" className="header-logo-icon" />
            basketch
          </Link>
          <nav className="header-nav">
            <Link to="/onboarding">My List</Link>
            <Link to="/about">About</Link>
          </nav>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        basketch — Migros vs Coop, side by side<br />
        Built by Kiran Dommalapati
      </footer>
    </div>
  )
}
