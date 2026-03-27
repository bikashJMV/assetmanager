import { useState } from 'react'
import { getUserFacingMessage } from '../utils/errors'

type UseRefreshableLoaderOptions = {
  defaultErrorMessage: string
  onError?: (error: unknown) => void
}

export function useRefreshableLoader({ defaultErrorMessage, onError }: UseRefreshableLoaderOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async (task: () => Promise<void>) => {
    setLoading(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(getUserFacingMessage(err, defaultErrorMessage))
      onError?.(err)
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    setError,
    run,
  }
}
