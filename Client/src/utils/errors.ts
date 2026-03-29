const DEFAULT_USER_MESSAGE = 'Something went wrong. Please try again.'

export function getUserFacingMessage(error: unknown, fallback: string = DEFAULT_USER_MESSAGE): string {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error ?? '')

  const message = raw.trim()
  if (!message) return fallback

  const normalized = message.toLowerCase()

  // Assign / return RPC and DB errors — must run before broad "not found" / friendly rewrites.
  const assignReturnHints = [
    'employee is inactive',
    'employee is not active',
    'employee not found',
    'employee record is not available',
    'employee code is required',
    'asset not found',
    'already assigned to same employee',
    'no open assignment',
    'asset assigned successfully',
    'unable to assign',
    'unable to return',
    'assign failed',
    'return failed',
    'no data returned from assign',
    'no data returned from return',
    'invalid response from server',
    'fn_assign_asset',
    'fn_return_asset',
    'violates foreign key',
    'duplicate key',
    'null value violates',
    'check constraint',
  ]
  if (assignReturnHints.some((h) => normalized.includes(h))) {
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
