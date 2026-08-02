/** Maps a Loki log level to the scoped terminal color token (styles/tokens.css --term-*).
 * The terminal is a deliberately always-dark console, so these are its own palette, not the
 * app's theme-adaptive semantic tokens. */
export function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'ERROR':
    case 'CRITICAL':
      return 'var(--term-error)'
    case 'WARN':
    case 'WARNING':
      return 'var(--term-warn)'
    case 'DEBUG':
      return 'var(--term-debug)'
    default:
      return 'var(--term-info)'
  }
}
