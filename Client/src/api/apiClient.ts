import type { AxiosRequestConfig } from 'axios'

import { requestBackend } from '../utils/authNexus.api'

export type ListEnvelope<T> = {
  items: T[]
  page: number
  limit: number
  count: number
  total: number
}

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  return requestBackend<T>(config)
}

