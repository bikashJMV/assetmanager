import { useEffect, useRef } from 'react'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useToast } from '../../hooks/useToast'

/**
 * Side-effect-only component: surfaces connectivity changes as toasts.
 * - On network drop → a PERSISTENT warning toast (durationMs: 0) that stays until the user
 *   closes it (or connectivity returns).
 * - On reconnect → dismiss the offline toast and show a brief "Back online" success toast.
 * No polling, no timers — driven entirely by useOnlineStatus (browser events).
 */
export function NetworkStatusWatcher() {
  const online = useOnlineStatus()
  const { showToast, dismissToast } = useToast()
  const offlineToastId = useRef<number | null>(null)
  const firstRun = useRef(true)

  useEffect(() => {
    // Skip the initial mount so a normal load (online) doesn't flash a toast.
    if (firstRun.current) {
      firstRun.current = false
      if (online) return
    }

    if (!online) {
      if (offlineToastId.current === null) {
        offlineToastId.current = showToast({
          variant: 'warning',
          title: 'No internet connection',
          message: 'You are offline. Changes may not be saved until the connection returns.',
          durationMs: 0,
        })
      }
      return
    }

    // Back online
    if (offlineToastId.current !== null) {
      dismissToast(offlineToastId.current)
      offlineToastId.current = null
      showToast({ variant: 'success', title: 'Back online', message: 'Your connection has been restored.' })
    }
  }, [online, showToast, dismissToast])

  return null
}
