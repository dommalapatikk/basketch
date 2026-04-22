import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { BasketProvider } from './lib/basket-context'
import { ToastProvider } from './components/Toast'

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const ComparisonPage = lazy(() => import('./pages/ComparisonPage').then(m => ({ default: m.ComparisonPage })))
const DealsPage = lazy(() => import('./pages/DealsPage').then(m => ({ default: m.DealsPage })))
const CategoryPage = lazy(() => import('./pages/CategoryPage').then(m => ({ default: m.CategoryPage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <BasketProvider>
          <ToastProvider>
            <Suspense fallback={<div className="py-12 text-center text-muted">Loading...</div>}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/deals" element={<DealsPage />} />
                  <Route path="/c/:subCategoryId" element={<CategoryPage />} />
                  <Route path="/compare/:favoriteId" element={<ComparisonPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
        </BasketProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
