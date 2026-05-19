import { userManager } from '../../utils/authService'

// const orgId = import.meta.env.VITE_ORG_ID?.trim()

export type AuthNexusLoginButtonProps = {
  /** `primary`: full-width accent (login page). `default`: compact pill (home). */
  variant?: 'default' | 'primary'
}

/**
 * Triggers AuthNexus OIDC redirect (Authorization Code + PKCE).
 */
import { getInitialTheme } from '../../utils/theme'

export default function AuthNexusLoginButton({ variant = 'default' }: AuthNexusLoginButtonProps) {
  const authority = import.meta.env.VITE_AUTH_AUTHORITY?.trim()
  const disabled = !authority

  const handleClick = () => {
    if (disabled) return
    
    const currentTheme = getInitialTheme()
    const themeColor = currentTheme === 'dark' ? '#020617' : '#FFFFFF'

    console.log('[authNexus] Initiating redirect. Storage Key:', userManager.settings.authority)
    void userManager.signinRedirect({
      extraQueryParams: {
                'org_id': import.meta.env.VITE_ORG_ID?.trim(),
                'project_id': import.meta.env.VITE_PROJECT_ID?.trim(),
                'project_name': import.meta.env.VITE_PROJECT_NAME?.trim(),
                'primary_color': import.meta.env.VITE_PRIMARY_COLOR?.trim(),
                'primary_origin': window.location.origin,
                'theme' : themeColor
            }
    })
  }

  const base =
    variant === 'primary'
      ? 'w-full bg-accent text-on-accent font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition disabled:opacity-60'
      : 'rounded-full border border-[#D9D4CB] bg-white px-5 py-2.5 text-sm font-semibold text-[#0A0A0A] shadow-sm transition hover:bg-[#F8F3EC] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={
        disabled
          ? 'Set VITE_AUTH_AUTHORITY (and related VITE_* AuthNexus vars) in .env'
          : 'Open AuthNexus sign-in'
      }
      className={base}
    >
      {disabled ? 'Sign-in unavailable (configure AuthNexus env)' : 'Sign in with AuthNexus'}
    </button>
  )
}
