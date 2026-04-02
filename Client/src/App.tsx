import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Sidebar from './components/common/Sidebar'
import { getSession, onAuthStateChange, signInWithGoogle, signOut } from './api'
import { startTelemetryBuffer, trackTelemetryEvent } from './telemetry'
import { applyDocumentPreferences, applyStoredPreferences, getInitialDensity, getInitialFont, getInitialTheme } from './utils/theme'
import { getUserFacingMessage, logDevError } from './utils/errors'
import './index.css'

const Home = lazy(() => import('./components/pages/Home'))
const AllAssets = lazy(() => import('./components/pages/AllAssets'))
const NewAsset = lazy(() => import('./components/pages/NewAsset'))
const AssetDetail = lazy(() => import('./components/pages/AssetDetail'))
const ScanPage = lazy(() => import('./components/pages/ScanPage'))
const PageNotFound = lazy(() => import('./components/common/PageNotFound'))
const Guide = lazy(() => import('./components/common/Guide'))
const Analysis = lazy(() => import('./components/pages/Analysis'))
const RecycleBin = lazy(() => import('./components/pages/RecycleBin'))
const Notifications = lazy(() => import('./components/pages/Notifications'))
const IdleWarningModal = lazy(() => import('./components/common/IdleWarningModal'))
import { useIdleTimeout } from './hooks/useIdleTimeout'
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
  const navigate = useNavigate()
  const isPublicScan = location.pathname.startsWith('/scan/')
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    applyStoredPreferences()
    startTelemetryBuffer()
  }, [])

  useEffect(() => {
    trackTelemetryEvent({
      source: 'client_engagement',
      event_name: 'route_viewed',
      event_domain: 'navigation',
      route_pattern: location.pathname,
      priority: 'LOW',
      metadata: { has_query: Boolean(location.search), has_hash: Boolean(location.hash) },
    })
  }, [location.pathname, location.search, location.hash])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !['ams-theme', 'ams-density', 'ams-font'].includes(event.key)) return
      applyDocumentPreferences(getInitialTheme(), getInitialDensity(), getInitialFont())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])

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

  const handleAutoLogout = async () => {
    try {
      await signOut()
    } catch (err) {
      logDevError('app.autologout', err)
    } finally {
      navigate('/login')
    }
  }

  const { isWarning, stayLoggedIn, logoutNow } = useIdleTimeout({
    isAuthenticated: Boolean(session),
    onWarn: () => { },
    onIdle: () => void handleAutoLogout(),
  })

  const showSidebar = !isPublicScan
  const nextFromQuery = new URLSearchParams(location.search).get('next')
  const loginReturnPath =
    typeof nextFromQuery === 'string' && nextFromQuery.trim().startsWith('/') ? nextFromQuery.trim() : '/'

  return (
    <div className="min-h-screen bg-app text-primary flex">
      {isWarning && Boolean(session) && (
        <Suspense fallback={null}>
          <IdleWarningModal
            onStayLoggedIn={stayLoggedIn}
            onLogoutNow={logoutNow}
          />
        </Suspense>
      )}
      {showSidebar && <Sidebar isAuthenticated={Boolean(session)} />}
      <div className={`flex-1 overflow-y-auto ${showSidebar ? 'pt-16 sm:pt-0' : ''}`}>
        <Suspense fallback={<AuthLoadingScreen />}>
          <Routes>
            <Route path="/" element={<Home isAuthenticated={Boolean(session)} />} />
            <Route path="/dashboard/home" element={<Home isAuthenticated={Boolean(session)} />} />
            <Route path="/scan/:id" element={<ScanPage />} />
            <Route path="/guide" element={<Guide />} />
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
              <Route path="/404" element={<PageNotFound />} />
              <Route path="/employee" element={<Employee />} />
              <Route path="/employee/new" element={<NewEmployee />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/recycle-bin" element={<RecycleBin />} />
            </Route>

            <Route
              path="*"
              element={
                <Navigate
                  to={
                    session
                      ? '/404'
                      : `/login?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`
                  }
                  replace
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
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
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
  const location = useLocation()

  const handleSignIn = async () => {
    setLoading(true)
    setMessage('')
    try {
      const nextFromQuery = new URLSearchParams(location.search).get('next')
      const nextPath =
        typeof nextFromQuery === 'string' && nextFromQuery.trim().startsWith('/') ? nextFromQuery.trim() : '/'

      await signInWithGoogle(nextPath)
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
          className="mt-6 w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition disabled:opacity-60"
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
