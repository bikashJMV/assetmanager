import { createContext, useContext, useCallback, useSyncExternalStore } from 'react'

type BreadcrumbStore = {
  label: string | null
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => string | null
  set: (label: string | null) => void
}

function createBreadcrumbStore(): BreadcrumbStore {
  let current: string | null = null
  const listeners = new Set<() => void>()

  return {
    get label() {
      return current
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot() {
      return current
    },
    set(next) {
      if (next === current) return
      current = next
      listeners.forEach((cb) => cb())
    },
  }
}

export const BreadcrumbOverrideCtx = createContext<BreadcrumbStore>(createBreadcrumbStore())

export function useBreadcrumbOverride() {
  const store = useContext(BreadcrumbOverrideCtx)
  const label = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return label
}

export function useSetBreadcrumbOverride() {
  const store = useContext(BreadcrumbOverrideCtx)
  return useCallback((label: string | null) => store.set(label), [store])
}

export { createBreadcrumbStore }
