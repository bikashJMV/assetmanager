import { useCallback, useRef, useState } from 'react'
import { getUserFacingMessage } from '../utils/errors'

type UseRefreshableLoaderOptions = {
  defaultErrorMessage: string
  onError?: (error: unknown) => void
}

export function useRefreshableLoader({ defaultErrorMessage, onError }: UseRefreshableLoaderOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const run = useCallback(async (task: () => Promise<void>) => {
    setLoading(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(getUserFacingMessage(err, defaultErrorMessage))
      onErrorRef.current?.(err)
    } finally {
      setLoading(false)
    }
  }, [defaultErrorMessage])

  return {
    loading,
    error,
    setError,
    run,
  }
}
