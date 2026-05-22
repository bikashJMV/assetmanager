import { useEffect, useState } from 'react'
import { getAssignmentActivity, type AssignmentActivityItem } from '../../../services/assetService'
import { getUserFacingMessage, logDevError } from '../../../utils/errors'

export function useAssignmentActivity(fromDate: string) {
  const [data, setData] = useState<AssignmentActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getAssignmentActivity(fromDate)
      .then((rows) => { if (!cancelled) setData(rows) })
      .catch((err) => {
        logDevError('assignmentActivity.load', err)
        if (!cancelled) setError(getUserFacingMessage(err, 'Failed to load assignment activity.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fromDate])

  return { data, loading, error }
}
