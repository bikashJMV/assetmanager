/**
 * Dev-only logging for the auth flow (GitHub #44).
 *
 * The auth path used to `console.log` response objects and OIDC user objects straight to the
 * browser console in production — any user with DevTools open, or any installed extension, could
 * read token material out of them. Two rules now apply:
 *
 *   1. Informational logs go through `devLog` / `devWarn` and are stripped in production builds.
 *   2. Failures still report in production via `errorLog`, but only ever a status code or message
 *      — never a response body, OIDC user, or headers object.
 *
 * `describeError` exists so a caught `unknown` can be logged without dumping an object that may
 * carry an Authorization header or token payload.
 */

const IS_DEV: boolean = import.meta.env.DEV

/** Informational auth trace. Emitted only in development builds. */
export function devLog(...args: unknown[]): void {
  if (!IS_DEV) return
  console.log(...args)
}

/** Non-fatal auth warning. Emitted only in development builds. */
export function devWarn(...args: unknown[]): void {
  if (!IS_DEV) return
  console.warn(...args)
}

/**
 * Reduce an unknown thrown value to a safe, printable string.
 * Never returns the original object, so token-bearing fields cannot reach the console.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

/**
 * Production-visible failure log. Callers must pass already-safe scalars
 * (status codes, messages) — never a raw body, user, or headers object.
 */
export function errorLog(message: string, detail?: string | number): void {
  if (detail === undefined) {
    console.error(message)
    return
  }
  console.error(message, detail)
}
