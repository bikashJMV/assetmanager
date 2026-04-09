const DEFAULT_USER_MESSAGE = 'Something went wrong. Please try again.'

type FriendlyRewrite = {
  pattern: string
  rewrite: string | null
}

const FRIENDLY_REWRITES: FriendlyRewrite[] = [
  { pattern: 'employee is not active', rewrite: 'This employee is currently inactive. Please verify their status before assigning assets.' },
  { pattern: 'employee is inactive', rewrite: 'This employee is currently inactive. Please verify their status before assigning assets.' },
  { pattern: 'employee record is not available', rewrite: 'This employee record is no longer available. It may have been removed from the system.' },
  { pattern: 'employee code is required', rewrite: 'An employee code or email is required for this operation.' },
  { pattern: 'no active employee found', rewrite: 'No active employee matches this identifier. Please verify the employee code or email and try again.' },
  { pattern: 'employee identifier is empty', rewrite: 'An employee code or email is required for assignment.' },
  { pattern: 'no open assignment found', rewrite: 'This asset has no open assignment to return. It may have already been returned.' },
  { pattern: 'invalid status', rewrite: null },
  { pattern: 'asset is already', rewrite: null },
  { pattern: 'status changed from', rewrite: null },
  { pattern: 'already assigned to', rewrite: null },
  { pattern: 'cannot assign', rewrite: null },
  { pattern: 'employee not found', rewrite: 'Employee not found in the system. Please verify the employee code or email and try again.' },
  { pattern: 'asset not found', rewrite: 'Asset not found. Please verify the asset tag and try again.' },
]

const PASSTHROUGH_HINTS = [
  'fn_assign_asset',
  'fn_return_asset',
  'fn_set_asset_lifecycle_status',
  'status update failed',
  'unable to update asset status',
  'unable to assign',
  'unable to return',
  'assign failed',
  'return failed',
  'no data returned from assign',
  'no data returned from return',
  'invalid response from server',
  'violates foreign key',
  'duplicate key',
  'null value violates',
  'check constraint',
]

export function getUserFacingMessage(error: unknown, fallback: string = DEFAULT_USER_MESSAGE): string {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error ?? '')

  const message = raw.trim()
  if (!message) return fallback

  const normalized = message.toLowerCase()

  for (const { pattern, rewrite } of FRIENDLY_REWRITES) {
    if (normalized.includes(pattern)) {
      return rewrite ?? message
    }
  }

  if (PASSTHROUGH_HINTS.some((h) => normalized.includes(h))) {
    return message
  }

  if (
    normalized.includes('fetch') ||
    normalized.includes('network') ||
    normalized.includes('failed to fetch')
  ) {
    return 'Network issue detected. Please check your connection and try again.'
  }

  if (
    normalized.includes('401') ||
    normalized.includes('jwt') ||
    normalized.includes('not authenticated') ||
    normalized.includes('unauthorized')
  ) {
    return 'Your session has expired. Please sign in again.'
  }

  if (normalized.includes('not found') || normalized.includes('no rows')) {
    return 'We could not find that record.'
  }

  if (
    normalized.includes('row-level security') ||
    normalized.includes('violates row-level security policy') ||
    normalized.includes('permission denied')
  ) {
    return 'You do not have permission for this action. Active admin access is required.'
  }

  if (
    normalized.includes('active admin employee record') ||
    normalized.includes('active admin access is required') ||
    normalized.includes('must be linked to an active admin') ||
    normalized.includes('it ops employee record') ||
    normalized.includes('already linked to another auth user') ||
    normalized.includes('employee profile found') ||
    normalized.includes('backend admin access is still false') ||
    normalized.includes('not linked to an employee profile') ||
    normalized.includes('cannot revoke admin from the last active admin user') ||
    normalized.includes('you cannot change your own admin privileges') ||
    normalized.includes('only admins can change admin privileges') ||
    normalized.includes('you are not signed in') ||
    normalized.includes('unable to verify access')
  ) {
    return message
  }

  return message
}

export function getErrorDebugDetail(error: unknown): string | undefined {
  if (!import.meta.env.DEV) return undefined
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') return error
  if (error == null) return undefined
  return String(error)
}

export function logDevError(context: string, error: unknown) {
  if (!import.meta.env.DEV) return
  console.error(`[${context}]`, error)
}

export { DEFAULT_USER_MESSAGE }
