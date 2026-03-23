import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Sidebar from './components/common/Sidebar'
import { getSession, onAuthStateChange, signInWithGoogle } from './api'
import { getUserFacingMessage, logDevError } from './utils/errors'
import './index.css'

const Home = lazy(() => import('./components/pages/Home'))
const AllAssets = lazy(() => import('./components/pages/AllAssets'))
const NewAsset = lazy(() => import('./components/pages/NewAsset'))
const AssetDetail = lazy(() => import('./components/pages/AssetDetail'))
const ScanPage = lazy(() => import('./components/pages/ScanPage'))
const PageNotFound = lazy(() => import('./components/common/PageNotFound'))
const Guide = lazy(() => import('./components/common/Guide'))
const Employee = lazy(() => import('./components/pages/Employee'))
const NewEmployee = lazy(() => import('./components/pages/NewEmployee'))

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

function AppRoutes() {
  const location = useLocation()
  const isPublicScan = location.pathname.startsWith('/scan/')
  const isLogin = location.pathname === '/login'
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let mounted = true

    void (async () => {
      try {
        const next = await getSession()
        if (!mounted) return
        setSession(next)
      } catch (err) {
        if (!mounted) return
        logDevError('app.session', err)
        setAuthError(getUserFacingMessage(err, 'Unable to validate your session right now.'))
      } finally {
        if (mounted) setAuthLoading(false)
      }
    })()

    const unsubscribe = onAuthStateChange((nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const showSidebar = Boolean(session) && !isPublicScan && !isLogin
  const loginReturnPath = getReturnPathFromState(location.state)

  return (
    <div className="min-h-screen bg-app text-primary flex">
      {showSidebar && <Sidebar />}
      <div className={`flex-1 overflow-y-auto ${showSidebar ? 'pt-16 sm:pt-0' : ''}`}>
        <Suspense fallback={<AuthLoadingScreen />}>
          <Routes>
            <Route path="/" element={<Home isAuthenticated={Boolean(session)} />} />
            <Route path="/dashboard/home" element={<Home isAuthenticated={Boolean(session)} />} />
            <Route path="/scan/:id" element={<ScanPage />} />
            <Route
              path="/login"
              element={
                authLoading
                  ? <AuthLoadingScreen />
                  : (session ? <Navigate to={loginReturnPath} replace /> : <SignInScreen error={authError} />)
              }
            />

            <Route element={<RequireAuth session={session} authLoading={authLoading} />}>
              <Route path="/assets/scan" element={<ScanPage protectedRoute />} />
              <Route path="/assets/scan/:id" element={<ScanPage protectedRoute />} />
              <Route path="/assets" element={<AllAssets />} />
              <Route path="/assets/new" element={<NewAsset />} />
              <Route path="/assets/:id" element={<AssetDetail />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/404" element={<PageNotFound />} />
              <Route path="/employee" element={<Employee />} />
              <Route path="/employee/new" element={<NewEmployee />} />
            </Route>

            <Route
              path="*"
              element={
                <Navigate
                  to={session ? '/404' : '/login'}
                  replace
                  state={session ? undefined : { from: location }}
                />
              }
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}

function RequireAuth({ session, authLoading }: { session: Session | null; authLoading: boolean }) {
  const location = useLocation()

  if (authLoading) {
    return <AuthLoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

function getReturnPathFromState(state: unknown): string {
  if (!state || typeof state !== 'object') return '/'

  const from = (state as {
    from?: { pathname?: string; search?: string; hash?: string }
  }).from

  const pathname = typeof from?.pathname === 'string' ? from.pathname : '/'
  const search = typeof from?.search === 'string' ? from.search : ''
  const hash = typeof from?.hash === 'string' ? from.hash : ''
  const target = `${pathname}${search}${hash}`

  return target && target !== '/login' ? target : '/'
}

function AuthLoadingScreen() {
  return (
    <main className="min-h-screen bg-app text-primary flex items-center justify-center">
      <p className="text-subtle">Checking session...</p>
    </main>
  )
}

function SignInScreen({ error }: { error: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignIn = async () => {
    setLoading(true)
    setMessage('')
    try {
      await signInWithGoogle()
    } catch (err) {
      logDevError('app.signin', err)
      setMessage(getUserFacingMessage(err, 'Google sign-in failed. Please try again.'))
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-app text-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-base bg-surface-2 p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-subtle">AMS</p>
        <h1 className="text-2xl font-bold mt-2">Sign in to continue</h1>
        <p className="text-sm text-muted mt-2">Use your Google workspace account. Domain checks are enforced in Supabase.</p>

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={loading}
          className="mt-6 w-full bg-accent text-on-accent font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition disabled:opacity-60"
        >
          {loading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        {(error || message) && (
          <p className="text-accent text-sm mt-3">{message || error}</p>
        )}
      </div>
    </main>
  )
}
