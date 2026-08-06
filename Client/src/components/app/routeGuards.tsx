import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { User } from 'oidc-client-ts'
import type { SessionEmployee } from '../../api'
import { userManager } from '../../utils/authService'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { BrandLogo } from '../common/BrandLogo'

export function AuthLoadingScreen() {
  return (
    <main className="min-h-screen bg-app flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-subtle text-sm animate-pulse">Authenticating...</p>
      </div>
    </main>
  )
}

export function RequireAuth({
  user,
  profileLoading,
  sessionEmployee,
}: {
  user: User | null
  profileLoading: boolean
  sessionEmployee: SessionEmployee | null
}) {
  const location = useLocation()
  if (profileLoading) return <AuthLoadingScreen />
  if (!user || user.expired) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  // Must match the intent enforced by AuthCallback + RequirePrivileged/RequireItOps: a deactivated
  // employee with a still-valid OIDC token must NOT reach protected routes on a direct nav/refresh
  // (which bypasses the callback gate). getSessionEmployee returns inactive records too, so a bare
  // truthiness check let them through.
  if (!sessionEmployee || !sessionEmployee.is_active) return <NoEmployeeAccessHandler />
  return <Outlet />
}

export function RequirePrivileged({ sessionEmployee }: { sessionEmployee: SessionEmployee | null }) {
  const isPrivileged = sessionEmployee?.is_active && sessionEmployee.role !== 'employee'
  return isPrivileged ? <Outlet /> : <Navigate to="/assets" replace />
}

export function RequireItOps({ sessionEmployee }: { sessionEmployee: SessionEmployee | null }) {
  const isItOps = sessionEmployee?.is_active && sessionEmployee.role === 'it_ops'
  return isItOps ? <Outlet /> : <Navigate to="/assets" replace />
}

export function SignInScreen() {
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const nextUrl = searchParams.get('next') || '/'

  const handleSignIn = () => {
    setLoading(true)
    void userManager.signinRedirect({ state: { returnTo: nextUrl } })
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Decorative backdrop — sharp, no blur. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-app bg-[url('/Login_screen.jpeg')] bg-cover bg-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ backgroundColor: 'hsl(var(--hue-brand) 30% 8% / 0.55)' }}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-base bg-surface-2 p-8 text-center shadow-2xl">
        <div className="mb-6 flex justify-center"><BrandLogo size="lg" /></div>
        <p className="text-xs uppercase tracking-widest text-subtle font-bold mb-6">Internal Access</p>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-accent text-on-accent font-bold py-3 rounded-xl hover:bg-accent-hover transition-all flex items-center justify-center gap-3"
        >
          {loading ? 'Redirecting...' : 'Sign in with SSO'}
        </button>
        <p className="text-xs text-muted mt-6">Secure OIDC Gateway Protection Enabled</p>
      </div>
    </main>
  )
}

export function NoEmployeeAccessHandler() {
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
