import { getSession } from '../api'
import { fetchEnveloped } from '../utils/apiEnvelope'

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || 'http://localhost:8000'

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
  const session = await getSession()
  const token = session?.access_token?.trim()
  if (!token) throw new Error('Missing session token. Please log in again.')

  const url = new URL(`${API_BASE}/observability/logs`)
  const query = new URLSearchParams()
  if (params.limit) query.append('limit', params.limit.toString())
  if (params.start !== undefined) query.append('start', params.start.toString())
  if (params.end !== undefined) query.append('end', params.end.toString())
  if (params.service) query.append('service', params.service)
  if (params.level) query.append('level', params.level)
  if (params.cursor) query.append('cursor', params.cursor)
  url.search = query.toString()

  const { data } = await fetchEnveloped<LogsResponse>(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  })

  return data
}
