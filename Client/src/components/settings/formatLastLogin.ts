import type { User } from 'oidc-client-ts'

/**
 * Derive a human-readable "last login" from the OIDC session. We do NOT store a login
 * timestamp of our own, so we read the ID-token claims: prefer `auth_time` (when the user
 * actually authenticated), fall back to `iat` (token issued-at). Returns null if neither
 * is present — the caller shows a dash rather than a fabricated time.
 */
export function getLastLoginDate(user: User | null): Date | null {
  const profile = user?.profile as Record<string, unknown> | undefined
  const raw = profile?.auth_time ?? profile?.iat
  const seconds = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000)
}

/** Explicit date + time, e.g. "18 Jul 2026, 5:04 PM". */
export function formatLastLogin(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
