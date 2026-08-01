import { useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'

/**
 * Online/offline detection with ZERO polling — purely event-driven off the browser's
 * `online`/`offline` events (passive, fired by the OS network stack), read through
 * useSyncExternalStore so React stays in sync without timers or intervals. Also mirrors
 * the state into TanStack Query's onlineManager so paused queries resume on reconnect.
 */
function subscribe(callback: () => void): () => void {
  const onOnline = () => {
    onlineManager.setOnline(true)
    callback()
  }
  const onOffline = () => {
    onlineManager.setOnline(false)
    callback()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

export function useOnlineStatus(): boolean {
  // Server snapshot is always true (SSR/no-window); this app is client-only anyway.
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
