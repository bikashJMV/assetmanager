import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { User } from 'oidc-client-ts'
import { getSessionEmployee, type SessionEmployee } from '../../api'
import { userManager, clearAuthNexusAccessToken } from '../../utils/authService'
import { refreshTokenViaBFF } from '../../utils/authNexus.api'
import { logDevError } from '../../utils/errors'

export interface AuthBootstrap {
  user: User | null
  sessionEmployee: SessionEmployee | null
  authLoading: boolean
  profileLoading: boolean
  handleSignOut: () => Promise<void>
}

/**
 * Owns the authNexus/UserManager session lifecycle: initial restore, OIDC event
 * subscriptions, and sign-out. Kept out of the router component so App.tsx stays small.
 *
 * Session authority = the BFF refresh cookie. A raw OIDC `userSignedOut` signal is NOT
 * treated as an immediate logout (it can be session-monitor noise emitted when the BFF
 * rotates the token). Instead we confirm with the BFF (`/api/auth/refresh`) and only
 * terminate the session when that genuinely fails — the production-standard BFF pattern.
 */
export function useAuthBootstrap(navigate: NavigateFunction): AuthBootstrap {
  const [user, setUser] = useState<User | null>(null)
  const [sessionEmployee, setSessionEmployee] = useState<SessionEmployee | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const intentionalSignOutRef = useRef(false)

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

    const onUserLoaded = (u: User) => {
      setUser(u)
      setProfileLoading(true)
      const loadProfile = async (): Promise<void> => {
        try {
          const emp = await getSessionEmployee()
          if (mounted) setSessionEmployee(emp)
        } catch {
          if (mounted) setSessionEmployee(null)
        } finally {
          if (mounted) setProfileLoading(false)
        }
      }
      void loadProfile()
    }

    const clearSession = () => {
      setUser(null)
      setSessionEmployee(null)
    }

    // Terminate the session only after the BFF confirms it is really gone. A raw OIDC
    // sign-out signal (session-monitor noise on token rotation) is not authoritative.
    const onSignedOut = () => {
      if (intentionalSignOutRef.current) {
        clearSession()
        return
      }
      void (async () => {
        try {
          await refreshTokenViaBFF()
          const refreshed = await userManager.getUser()
          if (mounted && refreshed && !refreshed.expired) {
            setUser(refreshed) // BFF session still valid — ignore the spurious sign-out signal
            return
          }
        } catch (err) {
          logDevError('app.auth.revalidate', err)
        }
        if (!mounted) return
        clearSession()
        clearAuthNexusAccessToken()
        navigate('/login')
      })()
    }

    userManager.events.addUserLoaded(onUserLoaded)
    userManager.events.addUserUnloaded(clearSession)
    userManager.events.addUserSignedOut(onSignedOut)

    return () => {
      mounted = false
      userManager.events.removeUserLoaded(onUserLoaded)
      userManager.events.removeUserUnloaded(clearSession)
      userManager.events.removeUserSignedOut(onSignedOut)
    }
  }, [navigate])

  const handleSignOut = async () => {
    intentionalSignOutRef.current = true
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

  return { user, sessionEmployee, authLoading, profileLoading, handleSignOut }
}
