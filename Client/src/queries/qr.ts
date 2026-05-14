import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createQrBatch, listQrBatches } from '../services/qrService'

export const qrQueryKeys = {
  all: ['qr'] as const,
  batches: () => [...qrQueryKeys.all, 'batches'] as const,
  batchList: (page: number, limit: number) => [...qrQueryKeys.batches(), { page, limit }] as const,
}

export function useQrBatchesQuery(page: number, limit: number) {
  return useQuery({
    queryKey: qrQueryKeys.batchList(page, limit),
    queryFn: () => listQrBatches(page, limit),
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
