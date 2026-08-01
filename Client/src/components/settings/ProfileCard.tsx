import type { User } from 'oidc-client-ts'
import type { SessionEmployee } from '../../api'
import { formatRoleLabel, roleBadgeStyle } from '../../utils/formatDisplay'
import { AppIcon, Button, type AppIconName } from '../ui'
import { formatLastLogin, getLastLoginDate } from './formatLastLogin'
import { useToast } from '../../hooks/useToast'
import ProfileAvatar from './ProfileAvatar'

function Field({
  icon,
  label,
  value,
  copyText,
}: {
  icon: AppIconName
  label: string
  value: React.ReactNode
  copyText?: string
}) {
  const { showToast } = useToast()
  const canCopy = Boolean(copyText && copyText !== '—')

  const onCopy = async () => {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      showToast({ variant: 'success', message: `${label} copied.` })
    } catch {
      showToast({ variant: 'warning', message: `Unable to copy ${label.toLowerCase()}.` })
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-md border border-line bg-surface-sunken px-3 py-2.5" title={label}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-muted" style={{ backgroundColor: 'hsl(var(--surface-hover))' }}>
        <AppIcon name={icon} size={16} aria-label={label} />
      </span>
      <div className="min-w-0 flex-1 text-[length:var(--text-sm)] font-medium text-foreground truncate">{value}</div>
      {canCopy ? (
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
          className="shrink-0 rounded p-1 text-foreground-faint opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <AppIcon name="copy" size={14} />
        </button>
      ) : null}
    </div>
  )
}

export function ProfileCard({
  user,
  employee,
  onLogout,
}: {
  user: User | null
  employee: SessionEmployee | null
  onLogout: () => void
}): React.ReactElement {
  const lastLoginDate = getLastLoginDate(user)
  const lastLogin = lastLoginDate ? formatLastLogin(lastLoginDate) : '—'
  const name = employee?.name ?? String(user?.profile?.name ?? 'Account')
  const email = employee?.email ?? (typeof user?.profile?.email === 'string' ? user.profile.email : '—')
  const roleLabel = employee ? formatRoleLabel(employee.role) : '—'

  return (
    <section>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex flex-col items-center gap-3 sm:w-64 sm:shrink-0">
          <h2 className="text-[length:var(--text-lg)] font-semibold text-foreground">Profile</h2>
          <div className="flex w-full justify-center">
            <ProfileAvatar name={name} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field icon="profile" label="Name" value={name} copyText={name} />
            <Field icon="employees" label="Employee ID" value={employee?.employee_id ?? '—'} copyText={employee?.employee_id ?? undefined} />
            <Field icon="email" label="Email" value={email} copyText={email} />
            <Field icon="departments" label="Department" value={employee?.department ?? '—'} copyText={employee?.department ?? undefined} />
            <Field
              icon="role"
              label="Role"
              copyText={roleLabel}
              value={
                employee ? (
                  <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={roleBadgeStyle(employee.role)}>
                    {roleLabel}
                  </span>
                ) : '—'
              }
            />
            <Field icon="lastLogin" label="Last login" value={lastLogin} copyText={lastLogin} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 border-t border-line pt-4">
        <Button variant="danger-outline" icon="signOut" onClick={onLogout}>Log out</Button>
      </div>
    </section>
  )
}
