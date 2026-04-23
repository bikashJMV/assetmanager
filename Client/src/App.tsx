import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Sidebar from './components/common/Sidebar'
import { getSession, onAuthStateChange, signInWithGoogle, signOut } from './api'
import { startOtelTelemetry } from './otel-telemetry'
import { getSessionEmployee, listWarrantyNotifications, type SessionEmployee, type WarrantyNotification } from './api'
import {
  applyDocumentPreferences,
  applyStoredPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
} from './utils/theme'
import { getUserFacingMessage, logDevError } from './utils/errors'
import { formatRoleLabel, roleBadgeClass } from './utils/formatDisplay'
import AnimatedNavIcon from './components/common/AnimatedNavIcon'
import Breadcrumbs from './components/common/Breadcrumbs'
import ScrollTopButton from './components/common/ScrollTopButton'
import { ToastProvider } from './components/common/ToastProvider'
import { BreadcrumbOverrideCtx, createBreadcrumbStore } from './hooks/useBreadcrumbOverride'
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
const EmployeeDetail = lazy(() => import('./components/pages/EmployeeDetail'))
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
  const [profileLoading, setProfileLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    applyStoredPreferences()
    startOtelTelemetry()
  }, [])

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
        if (!next?.user) {
          setSessionEmployee(null)
          return
        }
        const employee = await getSessionEmployee(next.user)
        if (!mounted) return
        setSessionEmployee(employee)
      } catch (err) {
        if (!mounted) return
        logDevError('app.session', err)
        setAuthError(getUserFacingMessage(err, 'Unable to validate your session right now.'))
      } finally {
        if (mounted) {
          setAuthLoading(false)
          setProfileLoading(false)
        }
      }
    })()

    const unsubscribe = onAuthStateChange((nextSession, event) => {
      setSession(nextSession)
      if (!nextSession?.user) {
        setSessionEmployee(null)
        setProfileLoading(false)
        return
      }
      // TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION: refresh profile without unmounting the app.
      // Otherwise RequireAuth shows a full-screen loader and wipes modal + page state (e.g. tab focus).
      const silentProfileRefresh: AuthChangeEvent[] = ['TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION']
      const blockUiForProfile = !silentProfileRefresh.includes(event)

      if (blockUiForProfile) setProfileLoading(true)
      void (async () => {
        try {
          const emp = await getSessionEmployee(nextSession.user)
          if (!mounted) return
          setSessionEmployee(emp)
        } catch (err) {
          logDevError('app.sessionEmployee', err)
          if (!mounted) return
          setSessionEmployee(null)
        } finally {
          if (mounted && blockUiForProfile) setProfileLoading(false)
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

  const breadcrumbStore = useMemo(() => createBreadcrumbStore(), [])
  useEffect(() => { breadcrumbStore.set(null) }, [location.pathname, breadcrumbStore])

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
            sessionEmployee={sessionEmployee}
          />
        )}
        <div
          ref={scrollContainerRef}
          data-app-scroll-root
          className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto"
          onClick={() => {
            if (showSidebar && !sidebarCollapsed) {
              setSidebarCollapsed(true)
            }
          }}
        >
          <BreadcrumbOverrideCtx.Provider value={breadcrumbStore}>
          {showBreadcrumbs && <Breadcrumbs />}
          <Suspense fallback={<AuthLoadingScreen />}>
            <Routes>
              <Route
                path="/"
                element={(
                  authLoading || (session && profileLoading) ? (
                    <AuthLoadingScreen />
                  ) : session && !sessionEmployee ? (
                    <NoEmployeeAccessHandler />
                  ) : (
                    <Home isAuthenticated={Boolean(session)} />
                  )
                )}
              />
              <Route
                path="/dashboard/home"
                element={(
                  authLoading || (session && profileLoading) ? (
                    <AuthLoadingScreen />
                  ) : session && !sessionEmployee ? (
                    <NoEmployeeAccessHandler />
                  ) : (
                    <Home isAuthenticated={Boolean(session)} />
                  )
                )}
              />
              <Route path="/scan/:id" element={<ScanPage />} />
              <Route path="/guide" element={<Guide />} />
              <Route
                path="/login"
                element={
                  authLoading || (session && profileLoading)
                    ? <AuthLoadingScreen />
                    : session && !sessionEmployee
                      ? <NoEmployeeAccessHandler />
                      : session
                        ? <Navigate to={loginReturnPath} replace />
                        : <SignInScreen error={authError} />
                }
              />

              <Route
                element={(
                  <RequireAuth
                    session={session}
                    authLoading={authLoading}
                    profileLoading={profileLoading}
                    sessionEmployee={sessionEmployee}
                  />
                )}
              >
                {/* Accessible to all authenticated employees */}
                <Route path="/assets/scan" element={<ScanPage protectedRoute />} />
                <Route path="/assets/scan/:id" element={<ScanPage protectedRoute />} />
                <Route path="/assets" element={<AllAssets />} />
                <Route path="/assets/:id" element={<AssetDetail />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/404" element={<PageNotFound />} />
                {/* Employee profile — accessible to all; EmployeeDetail self-guards cross-profile access */}
                <Route path="/employee/:id" element={<EmployeeDetail />} />

                {/* Admin / IT Ops only — employees redirected to /assets */}
                <Route element={<RequirePrivileged sessionEmployee={sessionEmployee} />}>
                  <Route path="/assets/new" element={<NewAsset />} />
                  <Route path="/employee" element={<Employee />} />
                  <Route path="/employee/new" element={<NewEmployee />} />
                  <Route path="/analysis" element={<Analysis />} />
                  <Route path="/recycle-bin" element={<RecycleBin />} />
                </Route>
              </Route>

              <Route
                path="*"
                element={
                  authLoading || (session && profileLoading) ? (
                    <AuthLoadingScreen />
                  ) : session && !sessionEmployee ? (
                    <NoEmployeeAccessHandler />
                  ) : (
                    <Navigate
                      to={
                        session
                          ? '/404'
                          : `/login?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`
                      }
                      replace
                    />
                  )
                }
              />
            </Routes>
          </Suspense>
          </BreadcrumbOverrideCtx.Provider>
        </div>
      </div>
      <ScrollTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  )
}

function NotifSeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === 'expired'
      ? 'bg-red-500'
      : 'bg-amber-400'
  return <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden="true" />
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
  const [notifItems, setNotifItems] = useState<WarrantyNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
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

  useEffect(() => {
    if (!notifOpen) return
    let cancelled = false
    setNotifLoading(true)
    listWarrantyNotifications(30)
      .then((rows) => { if (!cancelled) setNotifItems(rows) })
      .catch(() => { if (!cancelled) setNotifItems([]) })
      .finally(() => { if (!cancelled) setNotifLoading(false) })
    return () => { cancelled = true }
  }, [notifOpen])

  // Profile link respects role: employees go to their own profile, admin/IT Ops to directory.
  const isPrivileged = Boolean(sessionEmployee?.is_active && sessionEmployee.role !== 'employee')
  const profileLink = isPrivileged
    ? '/employee'
    : sessionEmployee?.id
      ? `/employee/${sessionEmployee.id}`
      : null

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
          {sessionEmployee && (
            <span
              className={`hidden sm:inline text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full select-none ${roleBadgeClass(sessionEmployee.role)}`}
              title={`Role: ${formatRoleLabel(sessionEmployee.role)}`}
            >
              {formatRoleLabel(sessionEmployee.role)}
            </span>
          )}
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
              <div className="absolute right-[-3rem] mt-3 w-56 rounded-xl border border-base bg-app shadow-2xl p-3 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AnimatedNavIcon name="users" />
                    {profileLink ? (
                      <button
                        type="button"
                        className="text-left text-sm font-semibold text-primary truncate hover:text-accent hover:underline hover:decoration-accent hover:decoration-1 hover:decoration-solid"
                        onClick={() => {
                          setUserMenuOpen(false)
                          navigate(profileLink)
                        }}
                      >
                        {sessionEmployee?.name || 'Not signed in'}
                      </button>
                    ) : (
                      <span className="text-sm font-semibold text-primary truncate">
                        {sessionEmployee?.name || 'Not signed in'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-subtle truncate">
                    <AnimatedNavIcon name="boxes" />
                    <span>{sessionEmployee?.department || 'Department: N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
                    <AnimatedNavIcon name="settings" />
                    <span>Role: {sessionEmployee?.role ? formatRoleLabel(sessionEmployee.role) : 'N/A'}</span>
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
              <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-xl border border-base bg-app shadow-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-base">
                  <p className="text-sm font-semibold text-primary">Warranty Alerts</p>
                  {notifLoading && (
                    <span className="text-xs text-muted animate-pulse">Loading…</span>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-[color:var(--border)]">
                  {!notifLoading && notifItems.length === 0 && (
                    <p className="px-4 py-5 text-center text-sm text-muted">No new notifications.</p>
                  )}
                  {notifItems.map((item) => (
                    <button
                      key={item.notification_id}
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--accent-soft)]/10"
                      onClick={() => {
                        setNotifOpen(false)
                        navigate(`/assets/${item.asset_tag ?? item.asset_id}`)
                      }}
                    >
                      <NotifSeverityDot severity={item.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-primary">
                          {item.category_name ?? 'Asset'}
                          {item.asset_tag ? <span className="ml-1.5 font-normal text-subtle">· {item.asset_tag}</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{item.message}</p>
                        {item.current_employee_name && (
                          <p className="mt-0.5 text-xs text-subtle truncate">
                            Assigned: {item.current_employee_name}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-base px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false)
                      navigate('/notifications')
                    }}
                    className="w-full rounded-lg bg-accent text-white text-sm font-semibold py-1.5 hover:bg-accent-hover transition"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function NoEmployeeAccessHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    void signOut()
      .then(() => navigate('/login?reason=no-employee', { replace: true }))
      .catch((err) => {
        logDevError('app.noEmployeeSignOut', err)
        navigate('/login?reason=no-employee', { replace: true })
      })
  }, [navigate])
  return (
    <main className="min-h-screen bg-app text-primary flex items-center justify-center px-4">
      <div className="text-center space-y-2 max-w-md">
        <p className="text-primary font-medium">Not registered in the employee directory</p>
        <p className="text-sm text-muted">Signing you out…</p>
      </div>
    </main>
  )
}

function RequireAuth({
  session,
  authLoading,
  profileLoading,
  sessionEmployee,
}: {
  session: Session | null
  authLoading: boolean
  profileLoading: boolean
  sessionEmployee: SessionEmployee | null
}) {
  const location = useLocation()

  if (authLoading || profileLoading) {
    return <AuthLoadingScreen />
  }

  if (!session) {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  if (!sessionEmployee) {
    return <NoEmployeeAccessHandler />
  }

  return <Outlet />
}

/**
 * Nested guard (inside RequireAuth) that allows only admin and IT Ops.
 * Employees land on /assets (their assigned-asset view) instead.
 */
function RequirePrivileged({ sessionEmployee }: { sessionEmployee: SessionEmployee | null }) {
  const isPrivileged = sessionEmployee?.is_active && sessionEmployee.role !== 'employee'
  if (!isPrivileged) {
    return <Navigate to="/assets" replace />
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
  const reason = new URLSearchParams(location.search).get('reason')
  const reasonBanner =
    reason === 'no-employee'
      ? 'This account is not in the employee directory. Contact your administrator if you need access.'
      : ''

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

        {(message || error || reasonBanner) && (
          <p className="text-accent text-sm mt-3">{message || error || reasonBanner}</p>
        )}
      </div>
    </main>
  )
}
