import { supabase } from './supabaseClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TelemetryPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type TelemetrySource = 'client_engagement' | 'client_data' | 'server_api' | 'telemetry_internal'
export type TelemetryEnvironment = 'prod' | 'staging' | 'dev' | 'local'

export interface TelemetryEvent {
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

export interface BufferedTelemetryEvent extends TelemetryEvent {
  attempts: number
  next_retry_at: number
}

// ─── Message types: Main → Worker ─────────────────────────────────────────────

interface WorkerConfig {
  ingestUrl: string
  environment: TelemetryEnvironment
  flushIntervalMs: number
  enabled: boolean
}

interface InitMsg {
  type: 'INIT'
  config: WorkerConfig
  sessionId: string
  recoveredEvents: BufferedTelemetryEvent[]
}

interface AddEventMsg {
  type: 'ADD_EVENT'
  event: BufferedTelemetryEvent
}

interface TokenMsg {
  type: 'TOKEN'
  requestId: string
  token: string | null
}

interface ForceFlushMsg {
  type: 'FORCE_FLUSH'
}

interface SetEnabledMsg {
  type: 'SET_ENABLED'
  enabled: boolean
}

// ─── Message types: Worker → Main ─────────────────────────────────────────────

interface ReadyMsg {
  type: 'READY'
}

interface NeedTokenMsg {
  type: 'NEED_TOKEN'
  requestId: string
}

interface BeaconUpdateMsg {
  type: 'BEACON_UPDATE'
  batch: TelemetryEvent[]
  ingestUrl: string
}

type WorkerToMainMsg = ReadyMsg | NeedTokenMsg | BeaconUpdateMsg

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = 'ams.telemetry.buffer.v1'
const FLUSH_INTERVAL_MS = 30_000
const MAX_BATCH_SIZE = 30
const MAX_BUFFER_SIZE = 300
const MAX_EVENT_AGE_MS = 60 * 60 * 1000
const MAX_RESPAWN_ATTEMPTS = 3

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

const TELEMETRY_ENV_ENABLED = (import.meta.env.VITE_TELEMETRY_ENABLED ?? 'false') === 'true'
const TELEMETRY_INGEST_URL = (import.meta.env.VITE_TELEMETRY_INGEST_URL ?? '').trim()
const TELEMETRY_TOKEN_URL = (import.meta.env.VITE_TELEMETRY_TOKEN_URL ?? '').trim() || '/telemetry/ingest-token'
const ENV_RAW = (import.meta.env.MODE ?? 'local').toLowerCase()

const ENVIRONMENT: TelemetryEnvironment =
  ENV_RAW === 'production' ? 'prod' : ENV_RAW === 'staging' ? 'staging' : 'local'

// ─── Module-level coordinator state ───────────────────────────────────────────

let started = false
let worker: Worker | null = null
let workerReady = false
let respawnAttempts = 0
let beaconRegistered = false

/** Events queued before the worker posts READY. */
let preReadyQueue: BufferedTelemetryEvent[] = []

/** Last beacon snapshot from worker — used synchronously in beforeunload. */
let beaconCache: { batch: TelemetryEvent[]; ingestUrl: string } | null = null

// ─── Helpers that must stay on main thread ────────────────────────────────────

function isTelemetryEnabled(): boolean {
  if (!TELEMETRY_ENV_ENABLED) return false
  return localStorage.getItem('ams.telemetry.enabled') !== 'false'
}

function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSessionId(): string {
  try {
    const key = 'ams.telemetry.session.v1'
    const existing = sessionStorage.getItem(key)
    if (existing?.trim()) return existing.trim()
    const next = generateEventId()
    sessionStorage.setItem(key, next)
    return next
  } catch {
    return generateEventId()
  }
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    out[key] = SENSITIVE_METADATA_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value
  }
  return out
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
    created_at: new Date().toISOString(),
  }
  return { ...event, attempts: 0, next_retry_at: Date.now() }
}

async function fetchIngestToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) return null

    const response = await fetch(TELEMETRY_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { token?: string }
    const responseToken = typeof data.token === 'string' ? data.token.trim() : ''
    return responseToken || null
  } catch {
    return null
  }
}

// ─── Legacy localStorage migration ───────────────────────────────────────────

function migrateLegacyStorage(): BufferedTelemetryEvent[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const cutoff = Date.now() - MAX_EVENT_AGE_MS
    const recovered: BufferedTelemetryEvent[] = []

    for (const e of parsed as BufferedTelemetryEvent[]) {
      if (typeof e.event_id !== 'string' || typeof e.created_at !== 'string') continue
      const age = new Date(e.created_at).getTime()
      if (!Number.isFinite(age) || age < cutoff) continue
      // Repair legacy environment value.
      if ((e.environment as string) === 'dev') e.environment = 'local'
      recovered.push(e)
    }

    return recovered.slice(0, MAX_BUFFER_SIZE)
  } catch {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* ignore */ }
    return []
  }
}

// ─── Worker message handler ───────────────────────────────────────────────────

function handleWorkerMessage(event: MessageEvent<WorkerToMainMsg>): void {
  const msg = event.data

  switch (msg.type) {
    case 'READY': {
      workerReady = true
      respawnAttempts = 0
      // Drain events queued before the worker was ready.
      for (const e of preReadyQueue) {
        worker!.postMessage({ type: 'ADD_EVENT', event: e } satisfies AddEventMsg)
      }
      preReadyQueue = []
      break
    }

    case 'NEED_TOKEN': {
      // Fetch Supabase token on main thread and send back to worker.
      void fetchIngestToken().then((token) => {
        worker?.postMessage({
          type: 'TOKEN',
          requestId: msg.requestId,
          token,
        } satisfies TokenMsg)
      })
      break
    }

    case 'BEACON_UPDATE': {
      beaconCache = { batch: msg.batch, ingestUrl: msg.ingestUrl }
      break
    }
  }
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

function spawnWorker(recoveredEvents: BufferedTelemetryEvent[]): Worker {
  const w = new Worker(
    new URL('./telemetry.worker.ts', import.meta.url),
    { type: 'module' },
  )

  w.onmessage = handleWorkerMessage

  w.onerror = (e: ErrorEvent) => {
    // Prevent worker error from surfacing as an uncaught window error.
    e.preventDefault()
    w.terminate()
    worker = null
    workerReady = false

    if (respawnAttempts < MAX_RESPAWN_ATTEMPTS) {
      respawnAttempts++
      const delay = Math.min(1_000 * 2 ** respawnAttempts, 30_000)
      setTimeout(() => {
        if (started) {
          // Respawn with empty recovery — legacy migration already ran once.
          worker = spawnWorker([])
        }
      }, delay)
    }
    // Beyond MAX_RESPAWN_ATTEMPTS: telemetry silently stops.
    // preReadyQueue is bounded by MAX_BUFFER_SIZE so it won't grow unbounded.
  }

  w.onmessageerror = () => {
    // Structured-clone failure — log and continue.
    console.warn('[telemetry] worker message deserialization error')
  }

  // Send config immediately. Worker posts READY after processing INIT.
  w.postMessage({
    type: 'INIT',
    config: {
      ingestUrl: TELEMETRY_INGEST_URL,
      environment: ENVIRONMENT,
      flushIntervalMs: FLUSH_INTERVAL_MS,
      enabled: isTelemetryEnabled(),
    },
    sessionId: getSessionId(),
    recoveredEvents,
  } satisfies InitMsg)

  return w
}

function registerBeforeUnload(): void {
  if (beaconRegistered) return
  beaconRegistered = true

  const sendBeacon = () => {
    if (!beaconCache?.batch.length || !beaconCache.ingestUrl) return
    try {
      const blob = new Blob(
        [JSON.stringify({ events: beaconCache.batch })],
        { type: 'application/json' },
      )
      navigator.sendBeacon(beaconCache.ingestUrl, blob)
    } catch {
      // Best effort only.
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendBeacon()
      // Also ask worker to flush asynchronously — covers the case where
      // the page becomes visible again before it closes.
      worker?.postMessage({ type: 'FORCE_FLUSH' } satisfies ForceFlushMsg)
    }
  })

  window.addEventListener('beforeunload', sendBeacon)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startTelemetryBuffer(): void {
  if (started) {
    // Re-enabling after a stopTelemetryBuffer call — tell existing worker.
    worker?.postMessage({ type: 'SET_ENABLED', enabled: isTelemetryEnabled() } satisfies SetEnabledMsg)
    started = true
    return
  }
  started = true

  const recovered = migrateLegacyStorage()
  worker = spawnWorker(recovered)
  registerBeforeUnload()
}

export function stopTelemetryBuffer(): void {
  if (!started) return
  started = false
  // Tell worker to stop flushing but do NOT terminate it —
  // it may be mid-flush and we need it alive for beacon updates.
  worker?.postMessage({ type: 'SET_ENABLED', enabled: false } satisfies SetEnabledMsg)
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
}): void {
  if (!isTelemetryEnabled()) return

  const event = buildBufferedEvent(input)

  if (!workerReady || !worker) {
    // Worker not yet ready — buffer on main thread until READY fires.
    if (preReadyQueue.length < MAX_BUFFER_SIZE) {
      preReadyQueue.push(event)
    }
    return
  }

  worker.postMessage({ type: 'ADD_EVENT', event } satisfies AddEventMsg)

  // HIGH priority or batch threshold reached → ask worker to flush immediately.
  if (event.priority === 'HIGH' || preReadyQueue.length >= MAX_BATCH_SIZE) {
    worker.postMessage({ type: 'FORCE_FLUSH' } satisfies ForceFlushMsg)
  }
}
