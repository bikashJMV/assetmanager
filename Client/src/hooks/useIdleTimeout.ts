import { useEffect, useRef, useState } from 'react'

const CHANNEL_NAME = 'ams-activity'
const WARN_TIME = 480000 // 8 minutes 480000
const IDLE_TIME = 600000 // 10 minutes 600000
const WARNING_GRACE_TIME = IDLE_TIME - WARN_TIME
const ACTIVITY_THROTTLE_MS = 1000

type IdleChannelMessage = 'activity' | 'warn' | 'stay' | 'logout'

export function useIdleTimeout({
  onWarn,
  onIdle,
  isAuthenticated,
}: {
  onWarn: () => void
  onIdle: () => void
  isAuthenticated: boolean
}) {
  const [isWarning, setIsWarning] = useState(false)
  const warnTimeoutRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastActiveRef = useRef<number>(Date.now())
  const isWarningRef = useRef(false)
  const onWarnRef = useRef(onWarn)
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onWarnRef.current = onWarn
  }, [onWarn])

  useEffect(() => {
    onIdleRef.current = onIdle
  }, [onIdle])

  const clearWarnTimeout = () => {
    if (warnTimeoutRef.current) {
      clearTimeout(warnTimeoutRef.current)
      warnTimeoutRef.current = null
    }
  }

  const clearIdleTimeout = () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current)
      idleTimeoutRef.current = null
    }
  }

  const clearTimers = () => {
    clearWarnTimeout()
    clearIdleTimeout()
  }

  const setWarningState = (next: boolean) => {
    if (isWarningRef.current === next) return
    isWarningRef.current = next
    setIsWarning(next)

    if (next) {
      onWarnRef.current()
    }
  }

  const postMessage = (message: IdleChannelMessage) => {
    channelRef.current?.postMessage(message)
  }

  const triggerIdle = (broadcast: boolean) => {
    clearTimers()
    setWarningState(false)
    if (broadcast) {
      postMessage('logout')
    }
    onIdleRef.current()
  }

  const scheduleIdleTimeout = (delay: number, broadcastOnIdle: boolean) => {
    clearIdleTimeout()
    idleTimeoutRef.current = window.setTimeout(() => {
      triggerIdle(broadcastOnIdle)
    }, delay)
  }

  const openWarning = (broadcast: boolean) => {
    clearWarnTimeout()
    setWarningState(true)
    scheduleIdleTimeout(WARNING_GRACE_TIME, broadcast)

    if (broadcast) {
      postMessage('warn')
    }
  }

  const startIdleCycle = (broadcastMessage?: IdleChannelMessage) => {
    clearTimers()
    setWarningState(false)

    warnTimeoutRef.current = window.setTimeout(() => {
      openWarning(true)
    }, WARN_TIME)

    scheduleIdleTimeout(IDLE_TIME, true)

    if (broadcastMessage) {
      postMessage(broadcastMessage)
    }
  }

  const handleUserActivity = () => {
    if (isWarningRef.current) return

    const now = Date.now()
    if (now - lastActiveRef.current <= ACTIVITY_THROTTLE_MS) return

    lastActiveRef.current = now
    startIdleCycle('activity')
  }

  const stayLoggedIn = () => {
    lastActiveRef.current = Date.now()
    startIdleCycle('stay')
  }

  const logoutNow = () => {
    triggerIdle(true)
  }

  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers()
      setWarningState(false)
      channelRef.current?.close()
      channelRef.current = null
      return
    }

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null
    channelRef.current = channel

    if (channel) {
      channel.onmessage = (e) => {
        if (e.data === 'activity') {
          if (isWarningRef.current) return
          lastActiveRef.current = Date.now()
          startIdleCycle()
        } else if (e.data === 'warn') {
          openWarning(false)
        } else if (e.data === 'stay') {
          lastActiveRef.current = Date.now()
          startIdleCycle()
        } else if (e.data === 'logout') {
          triggerIdle(false)
        }
      }
    }

    lastActiveRef.current = Date.now()
    startIdleCycle()

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const listener = () => handleUserActivity()

    events.forEach((evt) => window.addEventListener(evt, listener, { passive: true }))

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, listener))
      clearTimers()
      channel?.close()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  return { isWarning, stayLoggedIn, logoutNow, channelRef }
}
