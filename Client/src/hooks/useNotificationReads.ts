import { useCallback, useSyncExternalStore } from 'react'
import type { WarrantyNotification } from '../api'

/**
 * Read/unread tracking for warranty notifications.
 *
 * The server view's notification_id is `gen_random_uuid()` — regenerated on every query, so it
 * cannot key read-state. We key on a STABLE composite `asset_id:severity` (one warranty alert per
 * asset per severity) and persist the read set in localStorage (per-user-per-device; no backend
 * or schema change needed). Cross-tab sync via the storage event.
 */
const STORAGE_KEY = 'ams-notif-read'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeSet(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  // notify same-tab subscribers (storage event only fires cross-tab)
  window.dispatchEvent(new Event('ams-notif-read-change'))
}

function keyOf(item: WarrantyNotification): string {
  return `${item.asset_id}:${item.severity}`
}

const listeners = new Set<() => void>()
function subscribe(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener('storage', handler)
  window.addEventListener('ams-notif-read-change', handler)
  listeners.add(cb)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('ams-notif-read-change', handler)
    listeners.delete(cb)
  }
}

let cachedSnapshot = ''
function getSnapshot(): string {
  const current = localStorage.getItem(STORAGE_KEY) ?? ''
  if (current !== cachedSnapshot) cachedSnapshot = current
  return cachedSnapshot
}

export function useNotificationReads() {
  useSyncExternalStore(subscribe, getSnapshot, () => '')

  const isRead = useCallback((item: WarrantyNotification) => readSet().has(keyOf(item)), [])

  const unreadCount = useCallback(
    (items: WarrantyNotification[]) => {
      const set = readSet()
      return items.reduce((n, it) => (set.has(keyOf(it)) ? n : n + 1), 0)
    },
    [],
  )

  const markRead = useCallback((items: WarrantyNotification | WarrantyNotification[]) => {
    const set = readSet()
    for (const it of Array.isArray(items) ? items : [items]) set.add(keyOf(it))
    writeSet(set)
  }, [])

  const markAllRead = useCallback((items: WarrantyNotification[]) => {
    const set = readSet()
    for (const it of items) set.add(keyOf(it))
    writeSet(set)
  }, [])

  return { isRead, unreadCount, markRead, markAllRead }
}
