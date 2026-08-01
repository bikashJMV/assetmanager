import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createQrBatch, listQrBatches } from '../services/qrService'

export const qrQueryKeys = {
  all: ['qr'] as const,
  batches: () => [...qrQueryKeys.all, 'batches'] as const,
  batchList: (page: number, limit: number) => [...qrQueryKeys.batches(), { page, limit }] as const,
  batchFeed: (limit: number) => [...qrQueryKeys.batches(), 'feed', { limit }] as const,
}

export function useQrBatchesQuery(page: number, limit: number) {
  return useQuery({
    queryKey: qrQueryKeys.batchList(page, limit),
    queryFn: () => listQrBatches(page, limit),
  })
}

/** Page-by-page feed for the infinite-scrolling batch list. Same endpoint and page
 * size as the paginated query — only the accumulation differs. */
export function useQrBatchesInfiniteQuery(limit: number) {
  return useInfiniteQuery({
    queryKey: qrQueryKeys.batchFeed(limit),
    queryFn: ({ pageParam }) => listQrBatches(pageParam, limit),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < lastPage.total ? lastPage.page + 1 : undefined
    },
  })
}

export function useCreateQrBatchMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ count, idempotencyKey }: { count: number; idempotencyKey: string }) =>
      createQrBatch(count, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qrQueryKeys.batches() })
    },
  })
}
