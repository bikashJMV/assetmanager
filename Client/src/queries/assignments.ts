import { useMutation, useQueryClient } from '@tanstack/react-query'

import { assetQueryKeys } from './assets'
import { assignAsset, type AssignAssetInput } from '../services/assignmentService'

export function useAssignAssetMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AssignAssetInput) => assignAsset(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assetQueryKeys.all })
    },
  })
}

