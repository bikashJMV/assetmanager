import { useEffect } from 'react'
import { SEARCH_DEBOUNCE_MS } from './allAssetsConfig'
import type { useAssetsFilters } from './useAssetsFilters'

type SyncParams = {
  accessResolved: boolean
  isFetched: boolean
  hasData: boolean
  totalAssets: number
  initialListReady: boolean
  setInitialListReady: (v: boolean) => void
  listErrorMessage: string
  setDismissedListError: (v: boolean) => void
  filters: ReturnType<typeof useAssetsFilters>
}

/** URL/query synchronisation side-effects for AllAssets: first-load gate, debounced search
 * push, out-of-range page clamp, and list-error dismissal reset. */
export function useAssetsListSync(p: SyncParams) {
  const { filters: f } = p

  useEffect(() => { if (p.listErrorMessage) p.setDismissedListError(false) }, [p, p.listErrorMessage])

  useEffect(() => {
    if (p.accessResolved && !p.initialListReady && p.isFetched) p.setInitialListReady(true)
  }, [p, p.accessResolved, p.isFetched, p.initialListReady])

  useEffect(() => {
    if (!p.accessResolved) return
    const timer = setTimeout(() => {
      if (f.searchInput !== (f.searchParam || '')) {
        f.setSearchParams((prev) => {
          const trimmed = f.searchInput.trim()
          if (trimmed) prev.set('search', trimmed)
          else prev.delete('search')
          prev.set('page', '1')
          return prev
        }, { replace: true })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [p, p.accessResolved, f])

  useEffect(() => {
    if (!p.hasData || p.totalAssets <= 0) return
    const totalPages = Math.max(1, Math.ceil(p.totalAssets / f.pageSize))
    if (f.currentPage > totalPages) {
      f.setSearchParams((prev) => { prev.set('page', totalPages.toString()); return prev }, { replace: true })
    }
  }, [p, p.hasData, p.totalAssets, f])
}
