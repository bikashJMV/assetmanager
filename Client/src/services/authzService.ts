import { apiRequest } from '../api/apiClient'

type AuthzCheckResponse = {
  allowed: boolean
  role: string
}

export async function hasAdminAccess(): Promise<AuthzCheckResponse> {
  return apiRequest<AuthzCheckResponse>({
    method: 'GET',
    url: '/api/v1/authz/admin',
  })
}

export async function hasItOpsAccess(): Promise<AuthzCheckResponse> {
  return apiRequest<AuthzCheckResponse>({
    method: 'GET',
    url: '/api/v1/authz/itops',
  })
}

