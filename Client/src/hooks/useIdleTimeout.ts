import { useCallback, useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
const RESET_THROTTLE_MS = 1000

type IdleParams = {
  enabled: boolean
  idleMs: number
  warningMs: number
  onTimeout: () => void
}

/**
 * Inactivity detector. After `idleMs` of no user activity → shows a warning; if the user does
 * not respond within `warningMs` → calls onTimeout (auto-logout).
 *
 * Performance: activity listeners are PASSIVE and throttled to at most one timer-reset per second
 * (a timestamp compare, nothing else). Only ONE idle setTimeout runs at a time. The 1s countdown
 * interval exists ONLY while the warning is visible (bounded by warningMs) — never during normal
 * use — so idle detection adds effectively zero steady-state cost.
 *
 * onTimeout is held in a ref so its (typically unstable) identity does not re-run the wiring
 * effect; the countdown re-render must NOT reset the logout timer.
 */
export function useIdleTimeout({ enabled, idleMs, warningMs, onTimeout }: IdleParams) {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(warningMs / 1000))
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastReset = useRef(0)
  const warningRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)

  useEffect(() => { onTimeoutRef.current = onTimeout }, [onTimeout])

  const clearAll = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    if (countdown.current) clearInterval(countdown.current)
  }, [])

  const startIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      warningRef.current = true
      setWarning(true)
      setSecondsLeft(Math.ceil(warningMs / 1000))
      countdown.current = setInterval(() => setSecondsLeft((s) => (s > 1 ? s - 1 : 0)), 1000)
      logoutTimer.current = setTimeout(() => onTimeoutRef.current(), warningMs)
    }, idleMs)
  }, [idleMs, warningMs])

  const stay = useCallback(() => {
    warningRef.current = false
    setWarning(false)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    if (countdown.current) clearInterval(countdown.current)
    startIdleTimer()
  }, [startIdleTimer])

  useEffect(() => {
    if (!enabled) {
      clearAll()
      setWarning(false)
      warningRef.current = false
      return
    }

    const onActivity = () => {
      if (warningRef.current) return // during the warning, only "Stay" resets
      const now = Date.now()
      if (now - lastReset.current < RESET_THROTTLE_MS) return
      lastReset.current = now
      startIdleTimer()
    }

    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, onActivity, { passive: true })
    startIdleTimer()

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, onActivity)
      clearAll()
    }
  }, [enabled, startIdleTimer, clearAll])

  return { warning, secondsLeft, stay }
}
