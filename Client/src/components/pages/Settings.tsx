import { useEffect, useState } from 'react'
import { User } from 'oidc-client-ts'
import { useNavigate } from 'react-router-dom'
import { userManager, clearAuthNexusAccessToken } from '../../utils/authService'
import { logDevError } from '../../utils/errors'
import { useSessionEmployeeQuery } from '../../queries/employees'
import { usePreferences } from '../../components/settings/usePreferences'
import { AppearanceCard } from '../../components/settings/AppearanceCard'
import { ProfileCard } from '../../components/settings/ProfileCard'

export default function Settings() {
  const prefs = usePreferences()
  const employeeQuery = useSessionEmployeeQuery()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      try {
        const u = await userManager.getUser()
        if (mounted) setUser(u)
      } catch {
        /* ignore — profile fields just show a dash */
      }
    }
    void loadUser()
    return () => { mounted = false }
  }, [])

  const handleLogout = async () => {
    try {
      await userManager.signoutRedirect()
    } catch (err) {
      logDevError('settings.signout', err)
      clearAuthNexusAccessToken()
      navigate('/login')
    }
  }

  return (
    <main className="mx-auto w-full max-w-content px-4 py-3 text-foreground sm:px-6 sm:py-4">
      <header className="mb-4 text-center">
        <h1 className="text-[length:var(--text-2xl)] font-extrabold tracking-tight text-foreground">Settings</h1>
      </header>

      <div className="flex flex-col gap-5">
        <ProfileCard user={user} employee={employeeQuery.data ?? null} onLogout={() => void handleLogout()} />
        <AppearanceCard prefs={prefs} />
      </div>
    </main>
  )
}
