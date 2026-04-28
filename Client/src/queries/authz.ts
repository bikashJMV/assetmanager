import { useQuery } from '@tanstack/react-query'

import { hasAdminAccess, hasItOpsAccess } from '../services/authzService'

export const authzQueryKeys = {
  all: ['authz'] as const,
  admin: () => [...authzQueryKeys.all, 'admin'] as const,
  itops: () => [...authzQueryKeys.all, 'itops'] as const,
}

export function useAdminAccessQuery() {
  return useQuery({
    queryKey: authzQueryKeys.admin(),
    queryFn: () => hasAdminAccess(),
  })
}

export function useItOpsAccessQuery() {
  return useQuery({
    queryKey: authzQueryKeys.itops(),
    queryFn: () => hasItOpsAccess(),
  })
}

