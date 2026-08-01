import { apiRequest } from '../api/apiClient'

export type AssignAssetInput = {
  asset_tag: string
  employee_id: string
  assigned_at?: string | null
  notes?: string | null
  source?: string | null
}

export type AssignAssetResult = {
  ok?: boolean
  assignment_id?: string | null
  asset_id?: string | null
  asset_tag?: string | null
  /** Row UUID of the assigned employee. */
  id?: string | null
  /** Business employee id (`employees.employee_id`). */
  employee_id?: string | null
  status?: string | null
  message?: string | null
}

export async function assignAsset(input: AssignAssetInput): Promise<AssignAssetResult> {
  return apiRequest<AssignAssetResult>({
    method: 'POST',
    url: '/api/v1/assignments/assign',
    data: input,
  })
}

export type ReturnAssetInput = {
  asset_tag: string
  returned_at?: string | null
  notes?: string | null
  source?: string | null
}

export type ReturnAssetResult = {
  ok?: boolean
  assignment_id?: string | null
  asset_id?: string | null
  asset_tag?: string | null
  status?: string | null
  message?: string | null
}

export async function returnAsset(input: ReturnAssetInput): Promise<ReturnAssetResult> {
  return apiRequest<ReturnAssetResult>({
    method: 'POST',
    url: '/api/v1/assignments/return',
    data: input,
  })
}
