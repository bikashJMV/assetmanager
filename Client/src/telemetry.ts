type TelemetryPriority = 'HIGH' | 'MEDIUM' | 'LOW'
type TelemetrySource = 'client_engagement' | 'client_data' | 'server_api' | 'telemetry_internal'
type TelemetryEnvironment = 'prod' | 'staging' | 'dev' | 'local'

type TelemetryEvent = {
  event_id: string
  schema_version: number
  source: TelemetrySource
  event_name: string
  event_domain?: string
  route_pattern?: string
  success?: boolean
  actor_role?: string
  session_id?: string
  request_id?: string
  environment: TelemetryEnvironment
  priority: TelemetryPriority
  sample_rate: number
  metadata: Record<string, unknown>
  created_at: string
}

type BufferedTelemetryEvent = TelemetryEvent & {
  attempts: number
  next_retry_at: number
}

const STORAGE_KEY = 'ams.telemetry.buffer.v1'
const FLUSH_INTERVAL_MS = 30_000
const MAX_BATCH_SIZE = 30
const MAX_BUFFER_SIZE = 300
const MAX_EVENT_AGE_MS = 60 * 60 * 1000
const RETRY_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000]

const TELEMETRY_ENV_ENABLED = (import.meta.env.VITE_TELEMETRY_ENABLED ?? 'false') === 'true'

function isTelemetryEnabled(): boolean {
  if (!TELEMETRY_ENV_ENABLED) return false
  return localStorage.getItem('ams.telemetry.enabled') !== 'false'
}
const TELEMETRY_INGEST_URL = (import.meta.env.VITE_TELEMETRY_INGEST_URL as string | undefined)?.trim() ?? ''
const TELEMETRY_TOKEN_URL = (import.meta.env.VITE_TELEMETRY_TOKEN_URL as string | undefined)?.trim() || '/telemetry/ingest-token'
const ENV_RAW = ((import.meta.env.MODE as string | undefined) ?? 'local').toLowerCase()

const ENVIRONMENT: TelemetryEnvironment =
  ENV_RAW === 'production'
    ? 'prod'
    : ENV_RAW === 'staging'
      ? 'staging'
      : 'local'

let started = false
let flushTimer: number | null = null
let flushing = false
let inMemoryBuffer: BufferedTelemetryEvent[] = []

const SENSITIVE_METADATA_KEYS = new Set([
  'authorization',
  'auth',
  'token',
  'cookie',
  'email',
  'employee_code',
  'asset_tag',
  'serial_number',
  'password',
  'raw_ip',
  'user_agent',
])

function nowMs() {
  return Date.now()
}

function generateEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSessionId() {
  try {
    const key = 'ams.telemetry.session.v1'
    const existing = sessionStorage.getItem(key)
    if (existing && existing.trim()) return existing.trim()
    const next = generateEventId()
    sessionStorage.setItem(key, next)
    return next
  } catch {
    return generateEventId()
  }
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]'
      continue
    }
    out[key] = value
  }
  return out
}

function loadBufferFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as BufferedTelemetryEvent[]
    if (!Array.isArray(parsed)) return
    
    // Automatically repair old "dev" events to match backend "local" requirement.
    for (const event of parsed) {
      if (event.environment === 'dev') {
        event.environment = 'local'
      }
    }
    
    inMemoryBuffer = parsed
  } catch {
    inMemoryBuffer = []
  }
}

function saveBufferToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryBuffer))
  } catch {
    // Storage is best effort only.
  }
}

function pruneBuffer() {
  const oldestAllowed = nowMs() - MAX_EVENT_AGE_MS
  inMemoryBuffer = inMemoryBuffer.filter((item) => {
    const created = new Date(item.created_at).getTime()
    return Number.isFinite(created) && created >= oldestAllowed
  })
  if (inMemoryBuffer.length <= MAX_BUFFER_SIZE) return
  const overflow = inMemoryBuffer.length - MAX_BUFFER_SIZE
  // Drop oldest low-priority events first under pressure.
  inMemoryBuffer.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const lowIndexes: number[] = []
  for (let i = 0; i < inMemoryBuffer.length; i += 1) {
    if (inMemoryBuffer[i]?.priority === 'LOW') lowIndexes.push(i)
  }
  const toRemove = new Set<number>()
  for (let i = 0; i < Math.min(overflow, lowIndexes.length); i += 1) {
    toRemove.add(lowIndexes[i]!)
  }
  if (toRemove.size < overflow) {
    for (let i = 0; i < inMemoryBuffer.length && toRemove.size < overflow; i += 1) {
      if (!toRemove.has(i)) toRemove.add(i)
    }
  }
  inMemoryBuffer = inMemoryBuffer.filter((_, idx) => !toRemove.has(idx))
}

function buildBufferedEvent(input: {
  source: TelemetrySource
  event_name: string
  event_domain?: string
  route_pattern?: string
  success?: boolean
  actor_role?: string
  request_id?: string
  priority?: TelemetryPriority
  metadata?: Record<string, unknown>
}): BufferedTelemetryEvent {
  const createdAt = new Date().toISOString()
  const event: TelemetryEvent = {
    event_id: generateEventId(),
    schema_version: 1,
    source: input.source,
    event_name: input.event_name,
    event_domain: input.event_domain,
    route_pattern: input.route_pattern,
    success: input.success,
    actor_role: input.actor_role,
    session_id: getSessionId(),
    request_id: input.request_id,
    environment: ENVIRONMENT,
    priority: input.priority ?? 'LOW',
    sample_rate: 1.0,
    metadata: sanitizeMetadata(input.metadata ?? {}),
    created_at: createdAt,
  }
  return { ...event, attempts: 0, next_retry_at: nowMs() }
}

import { supabase } from './supabaseClient'

async function fetchIngestToken() {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    // If the user is not signed in (or session not ready yet),
    // avoid calling the backend since it will respond 401.
    if (!token) return null

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(TELEMETRY_TOKEN_URL, {
      method: 'POST',
      headers,
    })
    if (!response.ok) return null
    const data = (await response.json()) as { token?: string }
    const responseToken = typeof data.token === 'string' ? data.token.trim() : ''
    return responseToken || null
  } catch {
    return null
  }
}

function pickBatch() {
  const now = nowMs()
  return inMemoryBuffer
    .filter((item) => item.next_retry_at <= now)
    .sort((a, b) => {
      const priorityRank: Record<TelemetryPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      if (priorityRank[a.priority] !== priorityRank[b.priority]) {
        return priorityRank[b.priority] - priorityRank[a.priority]
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    .slice(0, MAX_BATCH_SIZE)
}

function markRetry(eventIds: Set<string>) {
  const now = nowMs()
  inMemoryBuffer = inMemoryBuffer.map((event) => {
    if (!eventIds.has(event.event_id)) return event
    const nextAttempts = event.attempts + 1
    const delay = RETRY_BACKOFF_MS[Math.min(nextAttempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 30_000
    return { ...event, attempts: nextAttempts, next_retry_at: now + delay }
  })
}

function removeByIds(eventIds: Set<string>) {
  inMemoryBuffer = inMemoryBuffer.filter((item) => !eventIds.has(item.event_id))
}

function toPayloadEvents(batch: BufferedTelemetryEvent[]): TelemetryEvent[] {
  return batch.map((item) => {
    const { attempts, next_retry_at, ...event } = item
    void attempts
    void next_retry_at
    return event
  })
}

async function flushInternal() {
  if (!isTelemetryEnabled() || !TELEMETRY_INGEST_URL) return
  if (flushing) return
  flushing = true
  try {
    pruneBuffer()
    if (!inMemoryBuffer.length) {
      saveBufferToStorage()
      return
    }
    const batch = pickBatch()
    if (!batch.length) return
    const token = await fetchIngestToken()
    if (!token) {
      markRetry(new Set(batch.map((evt) => evt.event_id)))
      saveBufferToStorage()
      return
    }
    const payload = { events: toPayloadEvents(batch) }
    const response = await fetch(TELEMETRY_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Ingest-Token': token,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    })

    const eventIds = new Set(batch.map((evt) => evt.event_id))
    if (response.ok) {
      removeByIds(eventIds)
    } else {
      markRetry(eventIds)
    }
    saveBufferToStorage()
  } catch {
    const eventIds = new Set(pickBatch().map((evt) => evt.event_id))
    markRetry(eventIds)
    saveBufferToStorage()
  } finally {
    flushing = false
  }
}

function flushWithBeacon() {
  if (!isTelemetryEnabled() || !TELEMETRY_INGEST_URL) return
  if (typeof navigator.sendBeacon !== 'function') return
  const batch = pickBatch()
  if (!batch.length) return
  const payload = JSON.stringify({ events: toPayloadEvents(batch) })
  try {
    const blob = new Blob([payload], { type: 'application/json' })
    const sent = navigator.sendBeacon(TELEMETRY_INGEST_URL, blob)
    if (sent) {
      removeByIds(new Set(batch.map((evt) => evt.event_id)))
      saveBufferToStorage()
    }
  } catch {
    // Best effort only.
  }
}

export function startTelemetryBuffer() {
  if (started) return
  started = true
  loadBufferFromStorage()
  pruneBuffer()
  saveBufferToStorage()

  flushTimer = window.setInterval(() => {
    void flushInternal()
  }, FLUSH_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushWithBeacon()
      void flushInternal()
    }
  })

  window.addEventListener('beforeunload', () => {
    flushWithBeacon()
  })
}

export function stopTelemetryBuffer() {
  if (flushTimer !== null) {
    window.clearInterval(flushTimer)
    flushTimer = null
  }
  started = false
}

export function trackTelemetryEvent(input: {
  source: TelemetrySource
  event_name: string
  event_domain?: string
  route_pattern?: string
  success?: boolean
  actor_role?: string
  request_id?: string
  priority?: TelemetryPriority
  metadata?: Record<string, unknown>
}) {
  if (!isTelemetryEnabled()) return
  const event = buildBufferedEvent(input)
  inMemoryBuffer.push(event)
  pruneBuffer()
  saveBufferToStorage()
  if (event.priority === 'HIGH' || inMemoryBuffer.length >= MAX_BATCH_SIZE) {
    void flushInternal()
  }
}

