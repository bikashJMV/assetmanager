import { useQuery } from '@tanstack/react-query'

import {
  getAnalyticsTimeseries,
  listCategories,
  listDepartments,
} from '../services/metaService'

export const metaQueryKeys = {
  all: ['meta'] as const,
  categories: () => [...metaQueryKeys.all, 'categories'] as const,
  departments: () => [...metaQueryKeys.all, 'departments'] as const,
  analyticsTimeseries: () =>
    [...metaQueryKeys.all, 'analytics-timeseries'] as const,
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

export function useAnalyticsTimeseriesQuery() {
  return useQuery({
    queryKey: metaQueryKeys.analyticsTimeseries(),
    queryFn: () => getAnalyticsTimeseries(),
  })
}

