import { apiRequest } from './apiClient'

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

export interface LogEntry {
  ts: string
  ts_ns: string
  level: LogLevel
  service: string
  message: string
}

export interface LogsResponse {
  logs: LogEntry[]
  next_cursor: string | null
}

export type LokiLogsParams = {
  limit?: number
  start?: number
  end?: number
  service?: 'all' | 'ams-server' | 'telemetry-server'
  level?: string
  cursor?: string
}

export async function fetchLokiLogs(params: LokiLogsParams): Promise<LogsResponse> {
  return apiRequest<LogsResponse>({
    method: 'GET',
    url: '/observability/logs',
    params,
  })
}
