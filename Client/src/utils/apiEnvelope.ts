/**
 * Shared types and unwrapping helpers for the v2 API envelope.
 *
 * Envelope shape:
 *   { status_code, status, message, data, error?, meta }
 *
 * Works with BOTH legacy (raw) and enveloped responses so existing
 * call-sites can migrate incrementally.
 */

// ────────────────────── Types ──────────────────────

export interface ApiErrorDetail {
  code: string
  detail: string
}

export interface ApiResponseMeta {
  request_id: string
  timestamp: string
  count: number
  total?: number
  page?: number
  page_size?: number
}

export interface ApiEnvelope<T = unknown> {
  status_code: number
  status: boolean
  message: string
  data: T
  error?: ApiErrorDetail | null
  meta: ApiResponseMeta
}

// ────────────────────── Detection ──────────────────────

/** True when the parsed JSON looks like a v2 envelope. */
export function isEnvelope(body: unknown): body is ApiEnvelope {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.status_code === 'number' &&
    typeof b.status === 'boolean' &&
    typeof b.message === 'string' &&
    b.meta !== undefined &&
    'data' in b
  )
}

// ────────────────────── Unwrapping ──────────────────────

/**
 * Unwrap a response body that may or may not be enveloped.
 *
 * - Enveloped success  → returns `envelope.data`
 * - Enveloped error    → throws with `envelope.message` (+ `error.detail`)
 * - Legacy (raw) body  → returned as-is (no transformation)
 */
export function unwrapResponse<T = unknown>(body: unknown): T {
  if (!isEnvelope(body)) return body as T

  if (!body.status) {
    const detail = body.error?.detail ?? body.message
    throw new Error(detail || 'Request failed.')
  }

  return body.data as T
}

/**
 * Convenience wrapper around `fetch()` that:
 *  1. Adds `X-Response-Envelope: true` header
 *  2. Parses JSON
 *  3. Unwraps the envelope (throws on error)
 *
 * Drop-in replacement for `fetch(...).then(r => r.json())`.
 */
export async function fetchEnveloped<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ data: T; meta: ApiResponseMeta }> {
  const headers = new Headers(init?.headers)
  headers.set('X-Response-Envelope', 'true')

  const resp = await fetch(input, { ...init, headers })
  const body: unknown = await resp.json()

  if (isEnvelope(body)) {
    if (!body.status) {
      const detail = body.error?.detail ?? body.message
      throw new Error(detail || `Request failed (${body.status_code}).`)
    }
    return { data: body.data as T, meta: body.meta }
  }

  // Legacy fallback: server didn't return envelope format
  if (!resp.ok) {
    const msg =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as Record<string, unknown>).detail)
        : `Request failed (${resp.status}).`
    throw new Error(msg)
  }

  const fallbackMeta: ApiResponseMeta = {
    request_id: resp.headers.get('x-request-id') ?? '',
    timestamp: new Date().toISOString(),
    count: Array.isArray(body) ? (body as unknown[]).length : body ? 1 : 0,
  }

  return { data: body as T, meta: fallbackMeta }
}
