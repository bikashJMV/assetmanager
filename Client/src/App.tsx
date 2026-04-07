import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Sidebar from './components/common/Sidebar'
import {
  getSession,
  onAuthStateChange,
  resetPostSignInIntroBootstrapClaim,
  signInWithGoogle,
  signOut,
  takePendingPostSignInIntro,
} from './api'
import { startTelemetryBuffer, trackTelemetryEvent } from './telemetry'
import { getSessionEmployee, type SessionEmployee } from './api'
import {
  applyDocumentPreferences,
  applyStoredPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
} from './utils/theme'
import { getUserFacingMessage, logDevError } from './utils/errors'
import AnimatedNavIcon from './components/common/AnimatedNavIcon'
import Breadcrumbs from './components/common/Breadcrumbs'
import ScrollTopButton from './components/common/ScrollTopButton'
import { ToastProvider } from './components/common/ToastProvider'
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
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}

function AppRoutes() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublicScan = location.pathname.startsWith('/scan/')
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionEmployee, setSessionEmployee] = useState<SessionEmployee | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  /** OAuth returns to `/` (not `/login`), so router state is missing — flip this on `SIGNED_IN` only. */
  const [showIntroAfterSignIn, setShowIntroAfterSignIn] = useState(false)

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
      if (!event.key || !['ams-theme', 'ams-density', 'ams-font', 'ams-text-scale'].includes(event.key)) return
      applyDocumentPreferences(getInitialTheme(), getInitialDensity(), getInitialFont(), getInitialTextScale())
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
        const employee = await getSessionEmployee(next?.user)
        if (!mounted) return
        setSessionEmployee(employee)
      } catch (err) {
        if (!mounted) return
        logDevError('app.session', err)
        setAuthError(getUserFacingMessage(err, 'Unable to validate your session right now.'))
      } finally {
        if (mounted) setAuthLoading(false)
      }
    })()

    const unsubscribe = onAuthStateChange((nextSession, event) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (nextSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        if (takePendingPostSignInIntro()) {
          setShowIntroAfterSignIn(true)
        }
      }
      if (event === 'SIGNED_OUT') {
        resetPostSignInIntroBootstrapClaim()
        setShowIntroAfterSignIn(false)
      }
      void (async () => {
        try {
          const emp = await getSessionEmployee(nextSession?.user)
          setSessionEmployee(emp)
        } catch (err) {
          logDevError('app.sessionEmployee', err)
          setSessionEmployee(null)
        }
      })()
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
  const showTopBar = !isPublicScan
  const showBreadcrumbs = !isPublicScan && location.pathname !== '/login'
  const nextFromQuery = new URLSearchParams(location.search).get('next')
  const loginReturnPath =
    typeof nextFromQuery === 'string' && nextFromQuery.trim().startsWith('/') ? nextFromQuery.trim() : '/'

  return (
    <div className="min-h-screen bg-app text-primary flex flex-col">
      {isWarning && Boolean(session) && (
        <Suspense fallback={null}>
          <IdleWarningModal
            onStayLoggedIn={stayLoggedIn}
            onLogoutNow={logoutNow}
          />
        </Suspense>
      )}

      {showTopBar && (
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          sessionEmployee={sessionEmployee}
          onSignOut={handleAutoLogout}
          navigate={navigate}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        {showSidebar && (
          <Sidebar
            isAuthenticated={Boolean(session)}
            collapsed={sidebarCollapsed}
            onSetCollapsed={setSidebarCollapsed}
            topOffset={showTopBar ? 64 : 0}
          />
        )}
        <div
          ref={scrollContainerRef}
          className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto"
          onClick={() => {
            if (showSidebar && !sidebarCollapsed) {
              setSidebarCollapsed(true)
            }
          }}
        >
          {showBreadcrumbs && <Breadcrumbs />}
          <Suspense fallback={<AuthLoadingScreen />}>
            <Routes>
              <Route
                path="/"
                element={(
                  <Home
                    isAuthenticated={Boolean(session)}
                    userId={session?.user.id ?? null}
                    wantPostSignInIntro={showIntroAfterSignIn}
                    onPostSignInIntroConsumed={() => {
                      resetPostSignInIntroBootstrapClaim()
                      setShowIntroAfterSignIn(false)
                    }}
                  />
                )}
              />
              <Route
                path="/dashboard/home"
                element={(
                  <Home
                    isAuthenticated={Boolean(session)}
                    userId={session?.user.id ?? null}
                    wantPostSignInIntro={showIntroAfterSignIn}
                    onPostSignInIntroConsumed={() => {
                      resetPostSignInIntroBootstrapClaim()
                      setShowIntroAfterSignIn(false)
                    }}
                  />
                )}
              />
              <Route path="/scan/:id" element={<ScanPage />} />
              <Route path="/guide" element={<Guide />} />
              <Route
                path="/login"
                element={
                  authLoading
                    ? <AuthLoadingScreen />
                    : (session ? (
                      <Navigate to={loginReturnPath} replace state={{ showPostSignInIntro: true }} />
                    ) : (
                      <SignInScreen error={authError} />
                    ))
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
      <ScrollTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  )
}

function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  sessionEmployee,
  onSignOut,
  navigate,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  sessionEmployee: SessionEmployee | null
  onSignOut: () => Promise<void>
  navigate: ReturnType<typeof useNavigate>
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const notifRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      const userHas = userMenuRef.current?.contains(target ?? null)
      const notifHas = notifRef.current?.contains(target ?? null)
      if (!userHas && !notifHas) {
        setUserMenuOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-base bg-surface-2/95 backdrop-blur supports-[backdrop-filter]:bg-surface-2/80">
      <div className="flex items-center justify-between px-4 py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="icon-btn text-muted"
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <AnimatedNavIcon name="list-chevrons-up-down" className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-lg font-semibold text-primary truncate hover:text-accent"
            title="Go to Home"
          >
            Asset Manager
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
            onClick={() => {
              setUserMenuOpen((v) => !v)
              setNotifOpen(false)
            }}
            className={`icon-btn ${userMenuOpen ? 'icon-btn-active' : ''}`}
            aria-label="User menu"
            title="User menu"
          >
            <AnimatedNavIcon name="user-circle" className="h-7 w-7" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-[-3rem] mt-3 w-52 rounded-xl border border-base bg-app shadow-2xl p-3 space-y-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AnimatedNavIcon name="users" />
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-primary truncate hover:text-accent hover:underline hover:decoration-accent hover:decoration-1 hover:decoration-solid"
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/employee')
                    }}
                  >
                    {sessionEmployee?.name || 'Not signed in'}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-subtle truncate">
                  <AnimatedNavIcon name="boxes" />
                  <span>{sessionEmployee?.department || 'Department: N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
                  <AnimatedNavIcon name="settings" />
                  <span>Role:{sessionEmployee?.role ? sessionEmployee.role : 'N/A'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                    void onSignOut()
                  }}
                  className="w-full rounded-lg bg-accent text-white text-sm font-semibold py-1 hover:bg-accent-hover transition"
                >
                 {sessionEmployee?.name ? 'Sign Out' : 'Sign In'}
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
            onClick={() => {
              setNotifOpen((v) => !v)
              setUserMenuOpen(false)
            }}
            className={`icon-btn ${notifOpen ? 'icon-btn-active' : ''}`}
            aria-label="Notifications"
            title="Notifications"
          >
            <AnimatedNavIcon name="bell" className="h-7 w-7" />
          </button>
            {notifOpen && (
              <div className="absolute right-0 mt-3 w-52 rounded-xl border border-base bg-app shadow-2xl p-2 space-y-3">
                <p className="text-sm font-semibold text-primary">Notifications</p>
                <p className="text-sm text-muted">No new notifications.</p>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false)
                    navigate('/notifications')
                  }}
                  className="w-full rounded-lg bg-accent text-white text-sm font-semibold py-1 hover:bg-accent-hover transition"
                >
                  View all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
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
