import type { AnalyticsTimeseries, CategoryRecord } from '../types/api'

import { apiRequest } from '../api/apiClient'

export async function listCategories(): Promise<CategoryRecord[]> {
  return apiRequest<CategoryRecord[]>({
    method: 'GET',
    url: '/api/v1/meta/categories',
  })
}

export async function listDepartments(): Promise<string[]> {
  return apiRequest<string[]>({
    method: 'GET',
    url: '/api/v1/meta/departments',
  })
}

export async function getAnalyticsTimeseries(): Promise<AnalyticsTimeseries> {
  return apiRequest<AnalyticsTimeseries>({
    method: 'GET',
    url: '/api/v1/meta/analytics-timeseries',
  })
}
