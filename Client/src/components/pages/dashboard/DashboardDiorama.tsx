import { lazy, Suspense, useCallback, useEffect, useState } from 'react'

import { DIORAMA_LABELS } from './dioramaLabels'
import { useDioramaData } from './useDioramaData'

// Lazy so three.js only downloads once the dashboard actually mounts.
const DioramaBand = lazy(() => import('./DioramaBand'))

const SKELETON_DELAY_MS = 200

/**
 * Visual band between the hero and the dashboard numbers. Purely decorative:
 * every figure the scene draws also appears as text in the sections below, so
 * losing WebGL costs the reader nothing.
 */
export default function DashboardDiorama({ isAuthenticated }: { isAuthenticated: boolean }) {
  const facts = useDioramaData(isAuthenticated)
  const [ready, setReady] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(false)

  const handleReady = useCallback(() => setReady(true), [])
  const handleUnsupported = useCallback(() => setUnsupported(true), [])

  useEffect(() => {
    if (ready) return
    const timer = window.setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [ready])

  if (unsupported) return null

  return (
    <section aria-hidden="true" className="relative w-full">
      <Suspense fallback={<div className="h-[34vh] min-h-[220px] w-full" />}>
        <DioramaBand
          wall={facts.wall}
          onReady={handleReady}
          onUnsupported={handleUnsupported}
        />
      </Suspense>
      {!ready && showSkeleton ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted">{DIORAMA_LABELS.preparing}</p>
        </div>
      ) : null}
    </section>
  )
}
