import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Renders children on document.body so position:fixed overlays cover the full viewport
 * (header, sidebar) and are not clipped by the main shell's overflow-y-auto.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
