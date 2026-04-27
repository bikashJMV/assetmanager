import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  changeEmployeeRole,
  createEmployee,
  getEmployeeById,
  getEmployeePortfolio,
  getSessionEmployeeProfile,
  listEmployees,
  softDeleteEmployee,
  updateEmployee,
  type ListEmployeesParams,
} from '../services/employeeService'
import type { EmployeeRole, EmployeeUpsertInput } from '../types/api'

export const employeeQueryKeys = {
  all: ['employees'] as const,
  list: (params: ListEmployeesParams) => [...employeeQueryKeys.all, 'list', params] as const,
  detail: (id: string) => [...employeeQueryKeys.all, 'detail', id] as const,
  portfolio: (id: string) => [...employeeQueryKeys.all, 'portfolio', id] as const,
  me: () => [...employeeQueryKeys.all, 'me'] as const,
}

export function useEmployeesListQuery(params: ListEmployeesParams) {
  return useQuery({
    queryKey: employeeQueryKeys.list(params),
    queryFn: () => listEmployees(params),
  })
}

export function useEmployeeQuery(id: string) {
  return useQuery({
    queryKey: employeeQueryKeys.detail(id),
    queryFn: () => getEmployeeById(id),
    enabled: Boolean(id && id.trim()),
  })
}

export function useEmployeePortfolioQuery(id: string) {
  return useQuery({
    queryKey: employeeQueryKeys.portfolio(id),
    queryFn: () => getEmployeePortfolio(id),
    enabled: Boolean(id && id.trim()),
  })
}

export function useSessionEmployeeQuery() {
  return useQuery({
    queryKey: employeeQueryKeys.me(),
    queryFn: () => getSessionEmployeeProfile(),
  })
}

export function useCreateEmployeeMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<EmployeeUpsertInput, 'id'>) => createEmployee(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeeQueryKeys.all })
    },
  })
}

export function useUpdateEmployeeMutation(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<EmployeeUpsertInput, 'id'>) => updateEmployee(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeeQueryKeys.all })
    },
  })
}

export function useChangeEmployeeRoleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: EmployeeRole }) => changeEmployeeRole(id, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeeQueryKeys.all })
    },
  })
}

export function useSoftDeleteEmployeeMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeleteEmployee(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeeQueryKeys.all })
    },
  })
}
