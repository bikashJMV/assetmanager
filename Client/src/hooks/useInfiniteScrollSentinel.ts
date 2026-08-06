import { useEffect, useRef } from 'react'

/**
 * Fires `onReach` when the returned sentinel ref scrolls into view. `rootMargin`
 * pre-loads slightly before the sentinel is actually visible so the list keeps
 * flowing. The observer is disabled while `enabled` is false (no next page, or a
 * fetch already in flight), which is what stops repeat fires.
 */
export function useInfiniteScrollSentinel<T extends HTMLElement = HTMLDivElement>(
  onReach: () => void,
  enabled: boolean,
) {
  const sentinelRef = useRef<T | null>(null)
  const onReachRef = useRef(onReach)
  onReachRef.current = onReach

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReachRef.current()
      },
      { rootMargin: '320px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return sentinelRef
}
