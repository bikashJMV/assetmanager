import type { CSSProperties } from 'react'

/**
 * Sidebar is a DARK anchor in both themes (Docker style, Notes/UI.md §5). These inline
 * CSS-var overrides re-scope the bridged legacy vars for the whole subtree, beating the
 * :root[data-theme] bridge on specificity so every nav item that reads
 * --text/--muted/--border/--surface* renders on the dark palette.
 */
export const SIDEBAR_VARS: CSSProperties = {
  background: 'hsl(var(--sidebar-bg))',
  color: 'hsl(var(--sidebar-fg))',
  ['--bg' as string]: 'hsl(var(--sidebar-bg))',
  ['--surface' as string]: 'hsl(var(--sidebar-fg-active) / 0.06)',
  ['--surface-2' as string]: 'hsl(var(--sidebar-fg-active) / 0.08)',
  ['--surface-3' as string]: 'hsl(var(--sidebar-item-hover))',
  ['--text' as string]: 'hsl(var(--sidebar-fg-active))',
  ['--muted' as string]: 'hsl(var(--sidebar-fg))',
  ['--subtle' as string]: 'hsl(var(--sidebar-fg) / 0.65)',
  ['--border' as string]: 'hsl(var(--sidebar-border))',
  ['--accent-soft' as string]: 'hsl(var(--primary) / 0.30)',
}
