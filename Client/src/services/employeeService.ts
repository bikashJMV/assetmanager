import type { EmployeePortfolio, EmployeeRecord, EmployeeRole, EmployeeUpsertInput } from '../types/api'
import type { ListEnvelope } from '../api/apiClient'

import { apiRequest } from '../api/apiClient'

export type ListEmployeesParams = {
  page: number
  limit: number
  search?: string
  status?: 'true' | 'false' | 'all'
  department?: string
  role?: string
}

/** List employees with filters + pagination (admin/it_ops only). */
export async function listEmployees(params: ListEmployeesParams): Promise<ListEnvelope<EmployeeRecord>> {
  return apiRequest<ListEnvelope<EmployeeRecord>>({
    method: 'GET',
    url: '/api/v1/employees',
    params,
  })
}

/** Get a single employee by UUID. Employee role can only access own profile. */
export async function getEmployeeById(id: string): Promise<EmployeeRecord> {
  return apiRequest<EmployeeRecord>({
    method: 'GET',
    url: `/api/v1/employees/${encodeURIComponent(id)}`,
  })
}

/** Get the session employee's own profile. */
export async function getSessionEmployeeProfile(): Promise<EmployeeRecord> {
  return apiRequest<EmployeeRecord>({
    method: 'GET',
    url: '/api/v1/employees/me',
  })
}

/** Get employee profile + currently assigned assets bundle. */
export async function getEmployeePortfolio(id: string): Promise<EmployeePortfolio> {
  return apiRequest<EmployeePortfolio>({
    method: 'GET',
    url: `/api/v1/employees/${encodeURIComponent(id)}/portfolio`,
  })
}

/** Update an existing employee (admin/it_ops only). */
export async function updateEmployee(id: string, input: Omit<EmployeeUpsertInput, 'id'>): Promise<EmployeeRecord> {
  return apiRequest<EmployeeRecord>({
    method: 'PUT',
    url: `/api/v1/employees/${encodeURIComponent(id)}`,
    data: {
      employee_id: input.employee_id.trim(),
      name: input.name.trim(),
      email: input.email?.trim() || null,
      department: input.department?.trim() || null,
      role: input.role ?? 'employee',
      is_active: input.is_active ?? true,
    },
  })
}

/** Change an employee's role (admin/it_ops only; only it_ops can assign it_ops). */
export async function changeEmployeeRole(id: string, role: EmployeeRole): Promise<EmployeeRecord> {
  return apiRequest<EmployeeRecord>({
    method: 'PATCH',
    url: `/api/v1/employees/${encodeURIComponent(id)}/role`,
    data: { role },
  })
}

/** Search active employees for assignment lookup. */
export async function searchAssignableEmployees(
  query: string,
  options: { limit?: number } = {},
): Promise<EmployeeRecord[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const limit = Math.max(1, options.limit ?? 8)
  const result = await listEmployees({
    page: 1,
    limit,
    search: trimmed,
    status: 'true',
  })

  return (result.items ?? []).filter((row) => row.employee_id.trim().length > 0)
}
