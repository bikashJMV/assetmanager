import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '../dioramaTheme'

const DURATION_MS = 700

/**
 * Counts a metric up to its value once. Returns the target immediately when the
 * viewer prefers reduced motion, so nothing animates for them.
 */
export function useCountUp(value: number): number {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0))
  const frameRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value)
      return
    }

    const start = performance.now()
    const from = 0

    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / DURATION_MS)
      // easeOutCubic — fast start, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value])

  return display
}
