import axios from 'axios'
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { clearAuthNexusAccessToken, getAuthNexusAccessToken, userManager } from './authService'

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

const backendBaseUrl = (() => {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  return raw ? raw.replace(/\/$/, '') : 'http://localhost:8000'
})()

const backendApiKey = (import.meta.env.VITE_BACKEND_API_KEY as string | undefined)?.trim() ?? ''

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
      console.log("[authNexus.api] REQUEST INTERCEPTOR: Token expired or expiring - calling signinSilent()");
      const newUser = await userManager.signinSilent()
      if (!newUser?.access_token) {
        throw new Error('No new token received')
      }

      console.log("[authNexus.api] REQUEST INTERCEPTOR: Token refreshed successfully");
      await userManager.storeUser(newUser)
      processQueue(null, newUser.access_token)
      user = newUser
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
        console.log("[authNexus.api] RESPONSE INTERCEPTOR: 401 error - calling signinSilent() to refresh");
        const newUser = await userManager.signinSilent()
        if (!newUser?.access_token) {
          throw new Error('No new token received')
        }

        console.log("[authNexus.api] RESPONSE INTERCEPTOR: Token refreshed successfully, retrying request");
        await userManager.storeUser(newUser)
        processQueue(null, newUser.access_token)
        originalRequest.headers.set('Authorization', `Bearer ${newUser.access_token}`)
        return api(originalRequest)
      } catch (refreshError) {
        console.error("[authNexus.api] RESPONSE INTERCEPTOR: Failed to refresh token -", refreshError);
        console.log("[authNexus.api] RESPONSE INTERCEPTOR: Calling removeUser() and redirecting to /login");
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
      throw new Error(detail)
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
