import { useEffect, useMemo, useState } from 'react'
import { getSession, hasActiveItOpsAccess } from '../../api'

export default function Analysis() {
  return (
    <main className="min-h-screen bg-app text-primary px-4 py-10 sm:px-6">
      <AnalysisInner />
    </main>
  )
}

type TelemetryEventRow = {
  table_source?: string
  id?: number
  source?: string
  event_id?: string
  event_name?: string
  environment?: string
  priority?: string
  route_pattern?: string | null
  method?: string | null
  status_code?: number | null
  duration_ms?: number | null
  error_category?: string | null
  operation_name?: string | null
  table_or_rpc?: string | null
  actor_role?: string | null
  session_id?: string | null
  request_id?: string | null
  trace_id?: string | null
  sample_rate?: number | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

function AnalysisInner() {
  const backendBase = useMemo(() => {
    const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
    return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : 'http://localhost:8000'
  }, [])

  const pageSize = 50
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<TelemetryEventRow[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const allowed = await hasActiveItOpsAccess()
        if (!allowed) {
          if (!mounted) return
          setError('IT Ops access required.')
          setEvents([])
          setHasMore(false)
          return
        }

        const session = await getSession()
        const token = session?.access_token?.trim()
        if (!token) {
          if (!mounted) return
          setError('Missing session token.')
          setEvents([])
          setHasMore(false)
          return
        }

        const resp = await fetch(`${backendBase}/analysis?limit=${pageSize}&offset=0`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(text || `Request failed: ${resp.status}`)
        }

        const data = (await resp.json()) as { events?: TelemetryEventRow[] }
        const next = Array.isArray(data.events) ? data.events : []

        if (!mounted) return
        setEvents(next)
        setOffset(0)
        setHasMore(next.length === pageSize)
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : 'Failed to load telemetry data.')
        setEvents([])
        setHasMore(false)
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [backendBase])

  const loadMore = async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError(null)
    try {
      const session = await getSession()
      const token = session?.access_token?.trim()
      if (!token) throw new Error('Missing session token.')

      const nextOffset = offset + pageSize
      const resp = await fetch(`${backendBase}/analysis?limit=${pageSize}&offset=${nextOffset}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `Request failed: ${resp.status}`)
      }

      const data = (await resp.json()) as { events?: TelemetryEventRow[] }
      const next = Array.isArray(data.events) ? data.events : []

      setEvents((prev) => [...prev, ...next])
      setOffset(nextOffset)
      setHasMore(next.length === pageSize)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more telemetry data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
        <div className="">
          <h1>Logs and Telemetry Analysis</h1>
          <p className=" max-w-2xl text-muted sm:text-base">
           Note: IT Ops can review recent telemetry events across success/error/general feeds.
          </p>
        </div>

        {error ? (
          <section className="rounded-xl border border-base bg-surface-2 px-5 py-2">
            <p className="text-sm font-semibold text-accent">Access / load failed</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </section>
        ) : null}

        <section className="rounded-xl border border-base bg-surface-2 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-primary">
              Events ({events.length})
            </p>
            <div className="text-xs text-subtle">
              {loading ? 'Loading...' : hasMore ? 'More available' : 'End'}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-subtle">
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Table</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2 pr-3">Env</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Event ID</th>
                  <th className="py-2">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-muted">
                      No telemetry events returned for the current feed page.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => {
                    const created = ev.created_at ?? ''
                    const meta = ev.metadata ? JSON.stringify(ev.metadata) : ''
                    return (
                      <tr key={ev.event_id ?? String(ev.id ?? Math.random())} className="border-t border-base">
                        <td className="py-3 pr-3 whitespace-nowrap text-subtle">{created}</td>
                        <td className="py-3 pr-3 whitespace-nowrap">{ev.table_source ?? '-'}</td>
                        <td className="py-3 pr-3 whitespace-nowrap">{ev.source ?? '-'}</td>
                        <td className="py-3 pr-3">
                          <div className="font-medium">{ev.event_name ?? '-'}</div>
                        </td>
                        <td className="py-3 pr-3">{ev.route_pattern ?? '-'}</td>
                        <td className="py-3 pr-3">{ev.environment ?? '-'}</td>
                        <td className="py-3 pr-3">{ev.priority ?? '-'}</td>
                        <td className="py-3 pr-3 font-mono text-xs">{ev.event_id ?? '-'}</td>
                        <td className="py-3">
                          <pre className="max-w-[360px] overflow-auto whitespace-pre-wrap break-words text-xs text-muted">{meta}</pre>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading || !hasMore}
              className="bg-accent text-white font-semibold px-4 py-2 rounded-lg hover:bg-accent-hover transition disabled:opacity-60"
            >
              {loading ? 'Loading...' : hasMore ? 'Load more' : 'No more data'}
            </button>
            <div className="text-xs text-subtle">
              Page size: {pageSize} • Offset: {offset}
            </div>
          </div>
        </section>
    </div>
  )
}
