/// <reference lib="webworker" />
export {}

// ─── Types (duplicated from telemetry.ts — worker cannot import DOM-dependent modules) ───

type TelemetryPriority = 'HIGH' | 'MEDIUM' | 'LOW'
type TelemetrySource = 'client_engagement' | 'client_data' | 'server_api' | 'telemetry_internal'
type TelemetryEnvironment = 'prod' | 'staging' | 'dev' | 'local'

interface TelemetryEvent {
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

interface BufferedTelemetryEvent extends TelemetryEvent {
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

type MainToWorkerMsg = InitMsg | AddEventMsg | TokenMsg | ForceFlushMsg | SetEnabledMsg

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

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 30
const MAX_BUFFER_SIZE = 300
const MAX_EVENT_AGE_MS = 60 * 60 * 1000
const RETRY_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000]

// ─── Worker state ─────────────────────────────────────────────────────────────

let buffer: BufferedTelemetryEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let isFlushing = false
let isEnabled = false
let ingestUrl = ''
let flushIntervalMs = 30_000

interface PendingToken {
  requestId: string
  resolve: (token: string | null) => void
  timeoutId: ReturnType<typeof setTimeout>
}

let pendingToken: PendingToken | null = null

// ─── Buffer helpers ───────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now()
}

function pruneBuffer(): void {
  const oldestAllowed = nowMs() - MAX_EVENT_AGE_MS

  // Drop expired events.
  buffer = buffer.filter((e) => {
    const created = new Date(e.created_at).getTime()
    return Number.isFinite(created) && created >= oldestAllowed
  })

  if (buffer.length <= MAX_BUFFER_SIZE) return

  // Drop oldest LOW-priority events first under pressure.
  const overflow = buffer.length - MAX_BUFFER_SIZE
  buffer.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const toRemove = new Set<string>()
  for (const e of buffer) {
    if (e.priority === 'LOW' && toRemove.size < overflow) toRemove.add(e.event_id)
  }
  if (toRemove.size < overflow) {
    for (const e of buffer) {
      if (!toRemove.has(e.event_id) && toRemove.size < overflow) toRemove.add(e.event_id)
    }
  }
  buffer = buffer.filter((e) => !toRemove.has(e.event_id))
}

function pickBatch(): BufferedTelemetryEvent[] {
  const now = nowMs()
  return buffer
    .filter((e) => e.next_retry_at <= now)
    .sort((a, b) => {
      const rank: Record<TelemetryPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      if (rank[a.priority] !== rank[b.priority]) return rank[b.priority] - rank[a.priority]
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    .slice(0, MAX_BATCH_SIZE)
}

function markRetry(ids: Set<string>): void {
  const now = nowMs()
  buffer = buffer.map((e) => {
    if (!ids.has(e.event_id)) return e
    const nextAttempts = e.attempts + 1
    const delay = RETRY_BACKOFF_MS[Math.min(nextAttempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 30_000
    return { ...e, attempts: nextAttempts, next_retry_at: now + delay }
  })
}

function removeByIds(ids: Set<string>): void {
  buffer = buffer.filter((e) => !ids.has(e.event_id))
}

function toPayloadEvents(batch: BufferedTelemetryEvent[]): TelemetryEvent[] {
  return batch.map(({ attempts, next_retry_at, ...event }) => {
    void attempts
    void next_retry_at
    return event
  })
}

// ─── Beacon update ────────────────────────────────────────────────────────────

function postBeaconUpdate(): void {
  const batch = pickBatch()
  const msg: BeaconUpdateMsg = {
    type: 'BEACON_UPDATE',
    batch: toPayloadEvents(batch),
    ingestUrl,
  }
  self.postMessage(msg)
}

// ─── Token request ────────────────────────────────────────────────────────────

function requestToken(): Promise<string | null> {
  // Only one in-flight token request at a time (isFlushing already guards this,
  // but be defensive).
  if (pendingToken) return Promise.resolve(null)

  return new Promise<string | null>((resolve) => {
    const requestId = crypto.randomUUID()

    const timeoutId = setTimeout(() => {
      if (pendingToken?.requestId === requestId) {
        pendingToken = null
        resolve(null)
      }
    }, 10_000)

    pendingToken = { requestId, resolve, timeoutId }

    const msg: NeedTokenMsg = { type: 'NEED_TOKEN', requestId }
    self.postMessage(msg)
  })
}

// ─── Flush ────────────────────────────────────────────────────────────────────

async function runFlush(): Promise<void> {
  if (!isEnabled || !ingestUrl) return
  if (isFlushing) return
  isFlushing = true
  try {
    pruneBuffer()
    const batch = pickBatch()

    // Always update beacon cache so main thread has a fresh snapshot.
    postBeaconUpdate()

    if (!batch.length) return

    const token = await requestToken()
    if (!token) {
      markRetry(new Set(batch.map((e) => e.event_id)))
      return
    }

    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Ingest-Token': token,
      },
      body: JSON.stringify({ events: toPayloadEvents(batch) }),
      keepalive: true,
    })

    const ids = new Set(batch.map((e) => e.event_id))
    if (response.ok) {
      removeByIds(ids)
    } else {
      markRetry(ids)
    }
  } catch {
    // Network failure — mark current batch for retry.
    const ids = new Set(pickBatch().map((e) => e.event_id))
    if (ids.size) markRetry(ids)
  } finally {
    isFlushing = false
    postBeaconUpdate()
  }
}

// ─── Flush loop ───────────────────────────────────────────────────────────────

function startFlushLoop(): void {
  if (flushTimer !== null) return
  flushTimer = setInterval(() => { void runFlush() }, flushIntervalMs)
}

function stopFlushLoop(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<MainToWorkerMsg>) => {
  const msg = event.data

  switch (msg.type) {
    case 'INIT': {
      isEnabled = msg.config.enabled
      ingestUrl = msg.config.ingestUrl
      flushIntervalMs = msg.config.flushIntervalMs

      // Enqueue any events recovered from legacy localStorage migration.
      for (const e of msg.recoveredEvents) {
        buffer.push(e)
      }
      pruneBuffer()

      if (isEnabled) startFlushLoop()

      // Notify main thread we are ready to accept ADD_EVENT messages.
      const ready: ReadyMsg = { type: 'READY' }
      self.postMessage(ready)

      // Immediately post beacon cache so main thread has a snapshot before first flush.
      postBeaconUpdate()
      break
    }

    case 'ADD_EVENT': {
      buffer.push(msg.event)
      pruneBuffer()
      break
    }

    case 'TOKEN': {
      if (pendingToken && pendingToken.requestId === msg.requestId) {
        clearTimeout(pendingToken.timeoutId)
        const { resolve } = pendingToken
        pendingToken = null
        resolve(msg.token)
      }
      // Mismatched requestId → stale response, silently discard.
      break
    }

    case 'FORCE_FLUSH': {
      void runFlush()
      break
    }

    case 'SET_ENABLED': {
      isEnabled = msg.enabled
      if (isEnabled) {
        startFlushLoop()
      } else {
        stopFlushLoop()
      }
      break
    }
  }
}
