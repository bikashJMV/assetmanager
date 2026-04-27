import { useQuery } from '@tanstack/react-query'

import { listCategories, listDepartments } from '../services/metaService'

export const metaQueryKeys = {
  all: ['meta'] as const,
  categories: () => [...metaQueryKeys.all, 'categories'] as const,
  departments: () => [...metaQueryKeys.all, 'departments'] as const,
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: metaQueryKeys.categories(),
    queryFn: () => listCategories(),
  })
}

export function useDepartmentsQuery() {
  return useQuery({
    queryKey: metaQueryKeys.departments(),
    queryFn: () => listDepartments(),
  })
}

