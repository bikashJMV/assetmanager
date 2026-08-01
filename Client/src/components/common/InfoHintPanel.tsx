import { forwardRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type AnchoredPanelPosition = {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  width: number
}

type CloseButtonProps = {
  onClose: () => void
  size: 'sm' | 'md'
}

function CloseButton({ onClose, size }: CloseButtonProps) {
  const dims = size === 'md' ? 'h-9 w-9' : 'h-8 w-8'
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-lg text-muted outline-none transition hover:bg-surface-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]`}
    >
      <span className="sr-only">Close</span>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  )
}

type ModalPanelProps = {
  panelId: string
  panelTitle: string
  children: ReactNode
  onClose: () => void
}

export const InfoHintModalPanel = forwardRef<HTMLDivElement, ModalPanelProps>(
  ({ panelId, panelTitle, children, onClose }, ref) =>
    createPortal(
      <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/45 p-4 sm:p-6">
        <div className="mx-auto flex min-h-full items-center justify-center">
          <div
            ref={ref}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={panelTitle}
            className="relative flex w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-base bg-app shadow-[0_20px_80px_rgba(0,0,0,0.32)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-base px-4 py-3 sm:px-5">
              <h2 className="pr-2 text-sm font-semibold text-primary sm:text-base">{panelTitle}</h2>
              <CloseButton onClose={onClose} size="md" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="space-y-4 text-xs leading-relaxed text-muted sm:text-sm">{children}</div>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    ),
)

InfoHintModalPanel.displayName = 'InfoHintModalPanel'

type AnchoredPanelProps = {
  panelId: string
  panelTitle: string
  children: ReactNode
  onClose: () => void
  position: AnchoredPanelPosition
}

export const InfoHintAnchoredPanel = forwardRef<HTMLDivElement, AnchoredPanelProps>(
  ({ panelId, panelTitle, children, onClose, position }, ref) =>
    createPortal(
      <div
        ref={ref}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-label={panelTitle}
        className="fixed z-[210] flex flex-col overflow-hidden rounded-2xl border border-base bg-app shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
        style={{
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          top: position.top,
          bottom: position.bottom,
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-base px-4 py-3">
          <h2 className="pr-2 text-sm font-semibold text-primary">{panelTitle}</h2>
          <CloseButton onClose={onClose} size="sm" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4 text-xs leading-relaxed text-muted sm:text-sm">{children}</div>
        </div>
      </div>,
      document.body,
    ),
)

InfoHintAnchoredPanel.displayName = 'InfoHintAnchoredPanel'
