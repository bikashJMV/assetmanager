import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { User } from 'oidc-client-ts'

import Sidebar from './components/common/Sidebar'
import { startOtelTelemetry } from './otel-telemetry'
import { getSessionEmployee, type SessionEmployee, type WarrantyNotification, listWarrantyNotifications } from './api'
import { userManager, clearAuthNexusAccessToken } from './utils/authService'

import {
  applyDocumentPreferences,
  applyStoredPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
} from './utils/theme'
import { logDevError } from './utils/errors'
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
const LogsPage = lazy(() => import('./components/pages/LogsPage'))
const QrBatches = lazy(() => import('./components/pages/QrBatches'))
const Notifications = lazy(() => import('./components/pages/Notifications'))

const Employee = lazy(() => import('./components/pages/Employee'))
const EmployeeDetail = lazy(() => import('./components/pages/EmployeeDetail'))
const NewEmployee = lazy(() => import('./components/pages/NewEmployee'))
const AuthCallback = lazy(() => import('./components/pages/AuthCallback'))

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

  const [user, setUser] = useState<User | null>(null)
  const [sessionEmployee, setSessionEmployee] = useState<SessionEmployee | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
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
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── Auth Logic (authNexus / UserManager) ───────────────────────────────────

  useEffect(() => {
    let mounted = true

    const loadUserAndProfile = async () => {
      try {
        const currentUser = await userManager.getUser()
        if (!mounted) return

        setUser(currentUser)

        if (currentUser && !currentUser.expired) {
          setProfileLoading(true)
          const employee = await getSessionEmployee()
          if (!mounted) return
          setSessionEmployee(employee)
        } else {
          setSessionEmployee(null)
        }
      } catch (err) {
        logDevError('app.auth', err)
        if (mounted) setSessionEmployee(null)
      } finally {
        if (mounted) {
          setAuthLoading(false)
          setProfileLoading(false)
        }
      }
    }

    void loadUserAndProfile()

    // OIDC Events
    const onUserLoaded = (u: User) => {
      setUser(u)
      setProfileLoading(true)
      void getSessionEmployee()
        .then(emp => { if (mounted) setSessionEmployee(emp) })
        .catch(() => { if (mounted) setSessionEmployee(null) })
        .finally(() => { if (mounted) setProfileLoading(false) })
    }

    const onUserUnloaded = () => {
      setUser(null)
      setSessionEmployee(null)
    }

    userManager.events.addUserLoaded(onUserLoaded)
    userManager.events.addUserUnloaded(onUserUnloaded)
    userManager.events.addUserSignedOut(onUserUnloaded)

    return () => {
      mounted = false
      userManager.events.removeUserLoaded(onUserLoaded)
      userManager.events.removeUserUnloaded(onUserUnloaded)
      userManager.events.removeUserSignedOut(onUserUnloaded)
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await userManager.signoutRedirect()
    } catch (err) {
      logDevError('app.signout', err)
      clearAuthNexusAccessToken()
      setUser(null)
      setSessionEmployee(null)
      navigate('/login')
    }
  }

  const breadcrumbStore = useMemo(() => createBreadcrumbStore(), [])
  useEffect(() => { breadcrumbStore.set(null) }, [location.pathname, breadcrumbStore])

  const showSidebar = !isPublicScan && location.pathname !== '/login' && location.pathname !== '/callback'
  const showTopBar = !isPublicScan && location.pathname !== '/login' && location.pathname !== '/callback'
  const showBreadcrumbs = showTopBar && location.pathname !== '/dashboard'

  if (authLoading) return <AuthLoadingScreen />

  return (
    <div className="min-h-screen bg-app text-primary flex flex-col">
      {showTopBar && (
        <TopBar
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          user={user}
          sessionEmployee={sessionEmployee}
          onSignOut={handleSignOut}
          navigate={navigate}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        {showSidebar && (
          <Sidebar
            isAuthenticated={Boolean(user && !user.expired)}
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
            if (showSidebar && !sidebarCollapsed) setSidebarCollapsed(true)
          }}
        >
          <BreadcrumbOverrideCtx.Provider value={breadcrumbStore}>
            {showBreadcrumbs && <Breadcrumbs />}
            <Suspense fallback={<AuthLoadingScreen />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Home isAuthenticated={Boolean(user && !user.expired)} />} />
                <Route path="/callback" element={<AuthCallback />} />
                <Route path="/login" element={<SignInScreen />} />
                <Route path="/scan/:id" element={<ScanPage />} />
                <Route path="/guide" element={<Guide />} />

                <Route element={<RequireAuth user={user} profileLoading={profileLoading} sessionEmployee={sessionEmployee} />}>
                  <Route path="/assets" element={<AllAssets />} />
                  <Route path="/assets/scan" element={<ScanPage protectedRoute />} />
                  <Route path="/assets/scan/:id" element={<ScanPage protectedRoute />} />
                  <Route path="/assets/:id" element={<AssetDetail />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/employee/:id" element={<EmployeeDetail />} />

                  <Route element={<RequirePrivileged sessionEmployee={sessionEmployee} />}>
                    <Route path="/assets/new" element={<NewAsset />} />
                    <Route path="/employee" element={<Employee />} />
                    <Route path="/employee/new" element={<NewEmployee />} />
                    <Route path="/analysis" element={<Analysis />} />
                    <Route path="/qr-generate/batches" element={<QrBatches />} />
                  </Route>

                  <Route element={<RequireItOps sessionEmployee={sessionEmployee} />}>
                    <Route path="/logs" element={<LogsPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to={user ? "/404" : "/login"} replace />} />
                <Route path="/404" element={<PageNotFound />} />
              </Routes>
            </Suspense>
          </BreadcrumbOverrideCtx.Provider>
        </div>
      </div>
      <ScrollTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  )
}

function TopBar({
  onToggleSidebar,
  user,
  sessionEmployee,
  onSignOut,
  navigate,
}: {
  onToggleSidebar: () => void
  user: User | null
  sessionEmployee: SessionEmployee | null
  onSignOut: () => Promise<void>
  navigate: ReturnType<typeof useNavigate>
}) {
  const hasOidcSession = Boolean(user && !user.expired)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState<WarrantyNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const notifRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!userMenuRef.current?.contains(target) && !notifRef.current?.contains(target)) {
        setUserMenuOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  useEffect(() => {
    if (!notifOpen) return
    setNotifLoading(true)
    listWarrantyNotifications(30)
      .then(setNotifItems)
      .catch(() => setNotifItems([]))
      .finally(() => setNotifLoading(false))
  }, [notifOpen])


  return (
    <header className="sticky top-0 z-20 border-b border-base bg-surface-2/95 backdrop-blur supports-[backdrop-filter]:bg-surface-2/80">
      <div className="flex items-center justify-between px-4 py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onToggleSidebar} className="icon-btn text-muted">
            <AnimatedNavIcon name="list-chevrons-up-down" className="h-7 w-7" />
          </button>
          <button type="button" onClick={() => navigate('/')} className="text-lg font-semibold text-primary truncate hover:text-accent">
            Asset Manager
          </button>
        </div>

        <div className="flex items-center gap-2">
          {hasOidcSession && sessionEmployee && (
            <span className={`hidden sm:inline text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${roleBadgeClass(sessionEmployee.role)}`}>
              {formatRoleLabel(sessionEmployee.role)}
            </span>
          )}
          <div className="relative" ref={userMenuRef}>
            <button type="button" onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false) }} className={`icon-btn ${userMenuOpen ? 'icon-btn-active' : ''}`}>
              <AnimatedNavIcon name="user-circle" className="h-8 w-8" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-[-3rem] mt-3 mr-10 w-56 rounded-xl border border-base bg-app shadow-2xl p-3 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AnimatedNavIcon name="users" />
                    <span className="text-sm font-semibold text-primary truncate">
                      {sessionEmployee?.name
                        ?? (hasOidcSession
                          ? (String(user?.profile?.name ?? user?.profile?.email ?? 'Account'))
                          : 'Guest')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <AnimatedNavIcon name="boxes" />
                    <span>
                      {sessionEmployee?.department
                        ?? (hasOidcSession ? '—' : 'Not signed in')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (hasOidcSession) {
                      void onSignOut()
                    } else {
                      setUserMenuOpen(false)
                      navigate('/login')
                    }
                  }}
                  className="w-full rounded-lg bg-accent text-on-accent text-sm font-semibold py-1 hover:bg-accent-hover transition"
                >
                  {hasOidcSession ? 'Sign out' : 'Sign in'}
                </button>
              </div>
            )}
          </div>

          {hasOidcSession ? (
            <div className="relative" ref={notifRef}>
              <button type="button" onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false) }} className={`icon-btn ${notifOpen ? 'icon-btn-active' : ''}`}>
                <AnimatedNavIcon name="bell" className="h-7 w-7" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-xl border border-base bg-app shadow-2xl overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-base flex justify-between">
                    {/* <p className="text-sm font-semibold text-primary">Warranty Alerts</p> */}
                    {notifLoading && <span className="text-xs text-muted animate-pulse">Loading…</span>}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-base">
                    {!notifLoading && notifItems.length === 0 && <p className="px-4 py-5 text-center text-sm text-muted">No alerts.</p>}
                    {notifItems.map((item) => (
                      <button key={item.notification_id} type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent-soft/10" onClick={() => { setNotifOpen(false); navigate(`/assets/${item.asset_tag}`) }}>
                        <div className={`mt-1 h-2 w-2 rounded-full ${item.severity === 'expired' ? 'bg-red-500' : 'bg-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{item.category_name} · {item.asset_tag}</p>
                          <p className="text-xs text-muted">{item.message}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-base">
                    <button type="button" onClick={() => { setNotifOpen(false); navigate('/notifications') }} className="w-full rounded-lg bg-accent text-on-accent text-sm font-semibold py-1.5 hover:bg-accent-hover transition">
                      View all
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function RequireAuth({ user, profileLoading, sessionEmployee }: { user: User | null, profileLoading: boolean, sessionEmployee: SessionEmployee | null }) {
  const location = useLocation()
  if (profileLoading) return <AuthLoadingScreen />
  if (!user || user.expired) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!sessionEmployee) return <NoEmployeeAccessHandler />
  return <Outlet />
}

function RequirePrivileged({ sessionEmployee }: { sessionEmployee: SessionEmployee | null }) {
  const isPrivileged = sessionEmployee && sessionEmployee.role !== 'employee'
  return isPrivileged ? <Outlet /> : <Navigate to="/assets" replace />
}

function RequireItOps({ sessionEmployee }: { sessionEmployee: SessionEmployee | null }) {
  const isItOps = sessionEmployee && sessionEmployee.role === 'it_ops'
  return isItOps ? <Outlet /> : <Navigate to="/assets" replace />
}

function AuthLoadingScreen() {
  return (
    <main className="min-h-screen bg-app flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-subtle text-sm animate-pulse">Authenticating...</p>
      </div>
    </main>
  )
}

function SignInScreen() {
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const nextUrl = searchParams.get('next') || '/'

  const handleSignIn = () => {
    setLoading(true)
    void userManager.signinRedirect({ state: { returnTo: nextUrl } })
  }

  return (
    <main className="min-h-screen bg-app flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-base bg-surface-2 p-8 shadow-xl text-center">
        <p className="text-xs uppercase tracking-widest text-subtle font-bold mb-2">Internal Access</p>
        <h1 className="text-3xl font-bold text-primary mb-6">Asset Manager</h1>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-accent text-on-accent font-bold py-3 rounded-xl hover:bg-accent-hover transition-all flex items-center justify-center gap-3"
        >
          {loading ? 'Redirecting...' : 'Sign in with authNexus'}
        </button>
        <p className="text-xs text-muted mt-6">Secure OIDC Gateway Protection Enabled</p>
      </div>
    </main>
  )
}

function NoEmployeeAccessHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = setTimeout(() => navigate('/login?reason=no-profile'), 3000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <main className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <AnimatedNavIcon name="alert-triangle" className="h-12 w-12 text-accent mx-auto" />
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="text-muted max-w-sm">Your account is authenticated but not registered in the employee directory. Contact IT for provisioning.</p>
      </div>
    </main>
  )
}
