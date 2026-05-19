import axios from 'axios'
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { clearAuthNexusAccessToken, getAuthNexusAccessToken, setAuthNexusAccessToken, userManager, registerSilentRefreshCallback } from './authService'

type FailedQueueEntry = {
  resolve: (token: string | null) => void
  reject: (error: unknown) => void
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

type ApiEnvelope<T = unknown> = {
  status_code?: number
  status?: 'success' | 'error' | boolean
  message?: string
  data?: T
  error?: { code?: string | null; details?: string | null; detail?: string | null } | null
  meta?: Record<string, unknown>
}

const backendBaseUrl: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? '')
  .trim()
  .replace(/\/$/, '')

const backendApiKey: string = (import.meta.env.VITE_BACKEND_API_KEY as string | undefined)?.trim() ?? ''

const api: AxiosInstance = axios.create({
  baseURL: backendBaseUrl,
})

let isRefreshing = false
let failedQueue: FailedQueueEntry[] = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

const refreshTokenViaBFF = async (): Promise<string> => {
  console.debug('[authNexus][refreshTokenViaBFF] STEP 1 — calling POST /api/auth/refresh...')

  const response = await fetch(`/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })

  console.debug('[authNexus][refreshTokenViaBFF] STEP 1 response status:', response.status)

  if (!response.ok) {
    const body = await response.text()
    console.error('[authNexus][refreshTokenViaBFF] FAILED STEP 1 — /api/auth/refresh returned', response.status, '| body:', body)
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  const data = await response.json()
  console.debug('[authNexus][refreshTokenViaBFF] STEP 2 — response keys:', Object.keys(data), '| has_access_token:', !!data.access_token, '| expires_in:', data.expires_in)

  const newAccessToken: string = data.access_token
  const expiresIn: number = data.expires_in ?? 900

  if (!newAccessToken) {
    console.error('[authNexus][refreshTokenViaBFF] FAILED STEP 2 — access_token missing in response. Full data:', data)
    throw new Error('No access_token in refresh response')
  }

  setAuthNexusAccessToken(newAccessToken)

  const user = await userManager.getUser()
  if (user) {
    user.access_token = newAccessToken
    user.expires_at = Math.floor(Date.now() / 1000) + expiresIn
    await userManager.storeUser(user)
    console.debug('[authNexus][refreshTokenViaBFF] STEP 3 OK — token stored. new expires_at:', user.expires_at)
  } else {
    console.warn('[authNexus][refreshTokenViaBFF] STEP 3 WARNING — no OIDC user in session to update.')
  }

  return newAccessToken
}

registerSilentRefreshCallback(async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
        const newToken = await refreshTokenViaBFF()
        processQueue(null, newToken)
    } catch (err) {
        processQueue(err, null)
    } finally {
        isRefreshing = false
    }
})


function applyDefaultHeaders(config: InternalAxiosRequestConfig) {
  const explicitEnvelopeHeader = config.headers.get('X-Response-Envelope')
  const url = typeof config.url === 'string' ? config.url : ''
  const pathname = (() => {
    if (!url) return ''
    try {
      return new URL(url, backendBaseUrl).pathname
    } catch {
      return url
    }
  })()

  // `/api/*` routes already return the Guideline envelope. Sending `X-Response-Envelope: true`
  // would cause the server's `EnvelopeMiddleware` to wrap again, resulting in a double envelope.
  const shouldRequestLegacyEnvelope =
    !explicitEnvelopeHeader && pathname && !pathname.startsWith('/api/')

  if (shouldRequestLegacyEnvelope) {
    config.headers.set('X-Response-Envelope', 'true')
  }
  if (backendApiKey) {
    config.headers.set('X-API-Key', backendApiKey)
  }
}

api.interceptors.request.use(async (config) => {
  applyDefaultHeaders(config)

  // const skipAuth = config.headers.get('X-Skip-Auth')?.trim().toLowerCase() === 'true'
  const skipAuth = String(config.headers.get('X-Skip-Auth') ?? '').trim().toLowerCase() === 'true'
  if (skipAuth) {
    config.headers.delete('X-Skip-Auth')
    config.headers.delete('Authorization')
    return config
  }

  let user = await userManager.getUser()
  if (!user?.access_token) {
    const token = getAuthNexusAccessToken()
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
  }

  if (user && (user.expired || (user.expires_at && user.expires_at - Date.now() / 1000 < 5))) {
    if (isRefreshing) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        if (token) config.headers.set('Authorization', `Bearer ${token}`)
        return config
      }).catch((err) => Promise.reject(err))
    }

    isRefreshing = true

    try {
      console.debug("[authNexus.api] REQUEST INTERCEPTOR: Token expired or expiring - calling refreshTokenViaBFF()");
      const newToken = await refreshTokenViaBFF()
      processQueue(null, newToken)
      user = await userManager.getUser()
    } catch (err) {
      console.error("[authNexus.api] REQUEST INTERCEPTOR: Failed to refresh token -", err);
      processQueue(err, null)
      clearAuthNexusAccessToken()
    } finally {
      isRefreshing = false
    }
  }

  if (user?.access_token) {
    config.headers.set('Authorization', `Bearer ${user.access_token}`)
  }

  return config
}, (error) => Promise.reject(error))

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (!originalRequest) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (token) originalRequest.headers.set('Authorization', `Bearer ${token}`)
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        console.debug("[authNexus.api] RESPONSE INTERCEPTOR: 401 error - calling refreshTokenViaBFF() to refresh");
        const newToken = await refreshTokenViaBFF()
        processQueue(null, newToken)
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`)
        return api(originalRequest)
      } catch (refreshError) {
        console.error("[authNexus.api] RESPONSE INTERCEPTOR: Failed to refresh token -", refreshError);
        console.debug("[authNexus.api] RESPONSE INTERCEPTOR: Calling removeUser() and redirecting to /login");
        processQueue(refreshError, null)
        await userManager.removeUser()
        clearAuthNexusAccessToken()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

function unwrapEnvelope<T>(response: AxiosResponse<ApiEnvelope<T> | T>): T {
  const body = response.data

  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'status' in body &&
    'data' in body
  ) {
    const envelope = body as ApiEnvelope<T>
    const statusValue = envelope.status
    const isError = statusValue === 'error' || statusValue === false
    if (isError) {
      const detail =
        envelope.error?.details ??
        envelope.error?.detail ??
        envelope.message ??
        `Request failed (${response.status}).`
      const err = new Error(detail) as Error & { statusCode?: number }
      err.statusCode = envelope.status_code ?? response.status
      throw err
    }
    return envelope.data as T
  }

  return body as T
}

function toErrorMessage(error: unknown, fallback: string): Error {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiEnvelope<unknown> | Record<string, unknown> | string | undefined

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if ('status' in data) {
        const envelope = data as ApiEnvelope<unknown>
        if (envelope.status === 'error' || envelope.status === false) {
          return new Error(envelope.error?.details ?? envelope.error?.detail ?? envelope.message ?? fallback)
        }
      }

      if ('detail' in data && typeof data.detail === 'string' && data.detail.trim()) {
        return new Error(data.detail)
      }

      if ('message' in data && typeof data.message === 'string' && data.message.trim()) {
        return new Error(data.message)
      }
    }

    if (typeof data === 'string' && data.trim()) {
      return new Error(data)
    }

    return new Error(error.message || fallback)
  }

  return error instanceof Error ? error : new Error(fallback)
}

/** Extract HTTP status code from an error thrown by requestBackend / api interceptors. */
export function getErrorStatusCode(error: unknown): number | undefined {
  if (error == null) return undefined
  // Augmented errors from toErrorMessage / unwrapEnvelope
  if (typeof (error as any).statusCode === 'number') return (error as any).statusCode
  // Raw AxiosError (e.g. 404 that didn't pass through unwrapEnvelope)
  if (axios.isAxiosError(error)) return error.response?.status
  return undefined
}

export async function requestBackend<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.request<ApiEnvelope<T> | T>(config)
    return unwrapEnvelope<T>(response)
  } catch (error) {
    throw toErrorMessage(error, 'Request failed.')
  }
}

export { backendBaseUrl }
export default api
