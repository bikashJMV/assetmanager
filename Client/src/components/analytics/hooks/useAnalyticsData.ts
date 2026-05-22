import { useCallback, useEffect, useState } from 'react'
import {
  getOverviewAnalysisData,
  hasActiveAdminAccess,
  listWarrantyNotifications,
  type OverviewAnalysisSnapshot,
  type WarrantyNotification,
} from '../../../api'
import { getUserFacingMessage, logDevError } from '../../../utils/errors'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

export type AnalyticsData = {
  snapshot: OverviewAnalysisSnapshot
  warrantyAlerts: WarrantyNotification[]
}

export function useAnalyticsData() {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const allowed = await hasActiveAdminAccess()
      if (!allowed) {
        setAccessDenied(true)
        setLoadState('error')
        return
      }
      const [snapshot, warrantyAlerts] = await Promise.all([
        getOverviewAnalysisData({ employeeLimit: 100 }),
        listWarrantyNotifications(100),
      ])
      setData({ snapshot, warrantyAlerts })
      setLoadState('success')
    } catch (err) {
      logDevError('overviewAnalytics.load', err)
      setError(getUserFacingMessage(err, 'Unable to load analytics dashboard right now.'))
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loadState, error, accessDenied, refresh: load }
}
