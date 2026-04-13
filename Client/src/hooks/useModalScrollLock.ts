import { useEffect } from 'react'

/**
 * Prevents the main app shell and document from scrolling while a full-screen modal is open.
 * Targets the scroll container marked with `data-app-scroll-root` in App.tsx (not `body`, which
 * does not scroll in this layout).
 */
export function useModalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const scrollRoot = document.querySelector<HTMLElement>('[data-app-scroll-root]')

    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevRootOverflow = scrollRoot?.style.overflow ?? ''
    const prevRootOverscroll = scrollRoot?.style.overscrollBehavior ?? ''

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (scrollRoot) {
      scrollRoot.style.overflow = 'hidden'
      scrollRoot.style.overscrollBehavior = 'none'
    }

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      if (scrollRoot) {
        scrollRoot.style.overflow = prevRootOverflow
        scrollRoot.style.overscrollBehavior = prevRootOverscroll
      }
    }
  }, [active])
}
