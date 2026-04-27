import { QueryClient } from '@tanstack/react-query'

const DEFAULT_RETRY_COUNT = 1

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: DEFAULT_RETRY_COUNT,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

