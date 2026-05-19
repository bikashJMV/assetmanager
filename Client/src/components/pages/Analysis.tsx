import { useEffect, useState } from 'react'
import { hasActiveAdminAccess } from '../../api'
import OverviewAnalysis from './Overview.Analysis'

export default function Analysis() {
  const [canView, setCanView] = useState(false)

  useEffect(() => {
    let mounted = true
    void hasActiveAdminAccess().then((allowed) => {
      if (mounted) setCanView(allowed)
    })
    return () => { mounted = false }
  }, [])

  if (!canView) return null

  return <OverviewAnalysis />
}
