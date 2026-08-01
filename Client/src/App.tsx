import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import Sidebar from './components/common/Sidebar'
import { startOtelTelemetry } from './otel-telemetry'
import {
  applyDocumentPreferences,
  applyStoredPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
} from './utils/theme'

import Breadcrumbs from './components/common/Breadcrumbs'
import ScrollTopButton from './components/common/ScrollTopButton'
import { ToastProvider } from './components/common/ToastProvider'
import { NetworkStatusWatcher } from './components/common/NetworkStatusWatcher'
import { BreadcrumbOverrideCtx, createBreadcrumbStore } from './hooks/useBreadcrumbOverride'
import { useDocumentTitle } from './hooks/useDocumentTitle'
import { useAuthBootstrap } from './components/app/useAuthBootstrap'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import { IdleWarningModal } from './components/common/IdleWarningModal'
import { TopBar } from './components/app/TopBar'
import {
  AuthLoadingScreen,
  RequireAuth,
  RequireItOps,
  RequirePrivileged,
  SignInScreen,
} from './components/app/routeGuards'

import './index.css'

const Home = lazy(() => import('./components/pages/Home'))
const AllAssets = lazy(() => import('./components/pages/AllAssets'))
const NewAsset = lazy(() => import('./components/pages/NewAsset'))
const AssetDetail = lazy(() => import('./components/pages/AssetDetail'))
const ScanPage = lazy(() => import('./components/pages/ScanPage'))
const PageNotFound = lazy(() => import('./components/common/PageNotFound'))
const Analysis = lazy(() => import('./components/pages/Analysis'))
const LogsPage = lazy(() => import('./components/pages/LogsPage'))
const QrBatches = lazy(() => import('./components/pages/QrBatches'))
const Notifications = lazy(() => import('./components/pages/Notifications'))
const Employee = lazy(() => import('./components/pages/Employee'))
const EmployeeDetail = lazy(() => import('./components/pages/EmployeeDetail'))
const AuthCallback = lazy(() => import('./components/pages/AuthCallback'))
const Settings = lazy(() => import('./components/pages/Settings'))

// Idle-logout timings. Defaults: warn after 10 min inactivity, auto-logout 2 min later.
// Test seam (window.__AMS_IDLE__) lets e2e shorten these without changing prod behaviour.
const IDLE = (window as unknown as { __AMS_IDLE__?: { idleMs: number; warningMs: number } }).__AMS_IDLE__
const IDLE_MS = IDLE?.idleMs ?? 10 * 60 * 1000
const IDLE_WARNING_MS = IDLE?.warningMs ?? 2 * 60 * 1000

export default function App() {
  return (
    <ToastProvider>
      <NetworkStatusWatcher />
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const { user, sessionEmployee, authLoading, profileLoading, handleSignOut } = useAuthBootstrap(navigate)

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

  const breadcrumbStore = useMemo(() => createBreadcrumbStore(), [])
  useEffect(() => { breadcrumbStore.set(null) }, [location.pathname, breadcrumbStore])
  useDocumentTitle(location.pathname)

  const isSpecialRoute = isPublicScan || location.pathname === '/login' || location.pathname === '/callback'
  const showChrome = !isSpecialRoute
  const showBreadcrumbs = showChrome && location.pathname !== '/dashboard' && location.pathname !== '/settings' && location.pathname !== '/logs' && location.pathname !== '/qr-generate/batches'
  const isAuthenticated = Boolean(user && !user.expired)

  // Idle auto-logout — only for an authenticated, provisioned session.
  const idle = useIdleTimeout({
    enabled: isAuthenticated && Boolean(sessionEmployee),
    idleMs: IDLE_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: () => { void handleSignOut() },
  })

  if (authLoading) return <AuthLoadingScreen />

  return (
    <div className="min-h-screen bg-app text-primary flex flex-col">
      {showChrome && (
        <TopBar
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          user={user}
          sessionEmployee={sessionEmployee}
          navigate={navigate}
          onSignOut={() => { void handleSignOut() }}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        {showChrome && (
          <Sidebar
            isAuthenticated={isAuthenticated}
            collapsed={sidebarCollapsed}
            onSetCollapsed={setSidebarCollapsed}
            topOffset={64}
            sessionEmployee={sessionEmployee}
          />
        )}
        <div
          ref={scrollContainerRef}
          data-app-scroll-root
          className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto"
          onClick={() => {
            if (showChrome && !sidebarCollapsed) setSidebarCollapsed(true)
          }}
        >
          <BreadcrumbOverrideCtx.Provider value={breadcrumbStore}>
            {showBreadcrumbs && <Breadcrumbs />}
            <Suspense fallback={<AuthLoadingScreen />}>
              <Routes>
                {/* Login-first: guests land on the login form; authed users go to the dashboard.
                    Safe against a redirect flash because routes only render after authLoading
                    resolves. /dashboard stays public for direct links; /scan/:id too. */}
                <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
                <Route path="/dashboard" element={<Home isAuthenticated={isAuthenticated} />} />
                <Route path="/callback" element={<AuthCallback />} />
                <Route path="/login" element={<SignInScreen />} />
                <Route path="/scan/:id" element={<ScanPage />} />

                <Route element={<RequireAuth user={user} profileLoading={profileLoading} sessionEmployee={sessionEmployee} />}>
                  <Route path="/assets" element={<AllAssets />} />
                  <Route path="/assets/scan" element={<ScanPage protectedRoute />} />
                  <Route path="/assets/scan/:id" element={<ScanPage protectedRoute />} />
                  <Route path="/assets/:id" element={<AssetDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/employee/:id" element={<EmployeeDetail />} />
                  {/* Any authenticated user: server scopes an employee to alerts for assets they hold. */}
                  <Route path="/notifications" element={<Notifications />} />

                  <Route element={<RequirePrivileged sessionEmployee={sessionEmployee} />}>
                    <Route path="/assets/new" element={<NewAsset />} />
                    <Route path="/employee" element={<Employee />} />
                    <Route path="/analysis" element={<Analysis />} />
                    <Route path="/qr-generate/batches" element={<QrBatches />} />
                  </Route>

                  <Route element={<RequireItOps sessionEmployee={sessionEmployee} />}>
                    <Route path="/logs" element={<LogsPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to={user ? '/404' : '/login'} replace />} />
                <Route path="/404" element={<PageNotFound />} />
              </Routes>
            </Suspense>
          </BreadcrumbOverrideCtx.Provider>
        </div>
      </div>
      <ScrollTopButton scrollContainerRef={scrollContainerRef} />
      <IdleWarningModal
        open={idle.warning}
        secondsLeft={idle.secondsLeft}
        onStay={idle.stay}
        onLogout={() => { void handleSignOut() }}
      />
    </div>
  )
}
