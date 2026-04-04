import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Minimum time the intro stays visible before `onComplete` (ms). */
const INTRO_MIN_VISIBLE_MS = 5_000

interface Particle {
  x: number
  y: number
  tx: number
  ty: number
  ox: number
  oy: number
  vx: number
  vy: number
  size: number
  alpha: number
  charIndex: number
  interactive: boolean
}

const TEXT = 'Asset Manager'
const LETTER_STAGGER = 160
const ASSEMBLE_SETTLE = 2000
const DWELL = 400
const FRICTION = 0.88
const EASE = 0.045
const RETURN_FRICTION = 0.82
const RETURN_EASE = 0.06
const REPEL_FORCE = 5.5

type Phase = 'assemble' | 'dwell' | 'interact'

function offScreenSpawn(W: number, H: number): { x: number; y: number } {
  const edge = Math.floor(Math.random() * 4)
  if (edge === 0) return { x: Math.random() * W, y: -20 }
  if (edge === 1) return { x: W + 20, y: Math.random() * H }
  if (edge === 2) return { x: Math.random() * W, y: H + 20 }
  return { x: -20, y: Math.random() * H }
}

/** Tighter grid on small screens = fewer particles; wider on desktop. */
function layoutForViewport(cssW: number, cssH: number) {
  const narrow = cssW < 480
  const medium = cssW >= 480 && cssW < 1024
  const gridStep = narrow ? 6 : medium ? 5 : 4
  const maxParticles = narrow ? 720 : medium ? 1050 : 1400
  const repelRadius = Math.max(48, Math.min(88, Math.min(cssW, cssH) * 0.12))
  const particleSize = narrow ? 1.65 : medium ? 1.55 : 1.5
  return { gridStep, maxParticles, repelRadius, particleSize }
}

function measureFittedFont(mCtx: CanvasRenderingContext2D, W: number, H: number): number {
  const maxW = W * 0.92
  let fontSize = Math.min(W / 7, H * 0.18, 46)
  fontSize = Math.max(14, fontSize)
  for (let i = 0; i < 16; i++) {
    mCtx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
    if (mCtx.measureText(TEXT).width <= maxW) break
    fontSize *= 0.9
  }
  return Math.max(12, fontSize)
}

export default function ParticleIntro({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const phaseRef = useRef<Phase>('assemble')
  const startTimeRef = useRef(0)
  const rafRef = useRef(0)
  const mouseRef = useRef({ x: -999, y: -999, inside: false })
  const assembleTotalRef = useRef(0)
  const wallClockStartRef = useRef(0)
  const completeFiredRef = useRef(false)
  /** Browser timer id (`number`); avoid `NodeJS.Timeout` from Node + DOM `setTimeout` overload clash. */
  const completeTimeoutRef = useRef<number | null>(null)
  const layoutRef = useRef({ gridStep: 4, maxParticles: 1400, repelRadius: 70, particleSize: 1.5 })
  const dimensionsRef = useRef({ W: 0, H: 0 })

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  const scheduleIntroComplete = useCallback(() => {
    if (completeFiredRef.current) return
    if (completeTimeoutRef.current !== null) return
    const elapsed = performance.now() - wallClockStartRef.current
    const delay = Math.max(0, INTRO_MIN_VISIBLE_MS - elapsed)
    completeTimeoutRef.current = window.setTimeout(() => {
      if (completeFiredRef.current) return
      completeFiredRef.current = true
      onCompleteRef.current()
      completeTimeoutRef.current = null
    }, delay)
  }, [])

  const sampleText = useCallback((canvas: HTMLCanvasElement, cssW: number, cssH: number) => {
    const { gridStep, maxParticles } = layoutRef.current
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr

    const measureEl = document.createElement('canvas')
    measureEl.width = W
    measureEl.height = H
    const mCtx = measureEl.getContext('2d')!
    const fontSize = measureFittedFont(mCtx, cssW, cssH)
    const font = `600 ${fontSize}px Inter, system-ui, sans-serif`

    mCtx.font = font
    const totalWidth = mCtx.measureText(TEXT).width
    const startX = (W - totalWidth) / 2
    const centerY = H / 2

    const charBounds: { left: number; right: number }[] = []
    let cursorX = startX
    for (const char of TEXT) {
      const cw = mCtx.measureText(char).width
      charBounds.push({ left: cursorX, right: cursorX + cw })
      cursorX += cw
    }

    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const oCtx = off.getContext('2d', { willReadFrequently: true })!
    oCtx.font = font
    oCtx.textAlign = 'left'
    oCtx.textBaseline = 'middle'
    oCtx.fillStyle = '#000'
    oCtx.fillText(TEXT, startX, centerY)

    const { data } = oCtx.getImageData(0, 0, W, H)
    const points: { x: number; y: number; charIndex: number }[] = []

    for (let y = 0; y < H; y += gridStep) {
      for (let x = 0; x < W; x += gridStep) {
        const idx = (y * W + x) * 4
        if (data[idx + 3] > 128) {
          let charIndex = 0
          for (let c = 0; c < charBounds.length; c++) {
            if (x >= charBounds[c].left && x < charBounds[c].right) {
              charIndex = c
              break
            }
          }
          points.push({ x, y, charIndex })
        }
      }
    }

    if (points.length > maxParticles) {
      const step = Math.ceil(points.length / maxParticles)
      return points.filter((_, i) => i % step === 0)
    }
    return points
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const r = el.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      setViewport((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }

    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.w < 1 || viewport.h < 1) return

    const layout = layoutForViewport(viewport.w, viewport.h)
    layoutRef.current = layout

    const dpr = window.devicePixelRatio || 1
    const W = viewport.w
    const H = viewport.h
    dimensionsRef.current = { W, H }

    canvas.width = W * dpr
    canvas.height = H * dpr

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const points = sampleText(canvas, W, H)
    particlesRef.current = points.map((p) => {
      const spawn = offScreenSpawn(W, H)
      return {
        x: spawn.x,
        y: spawn.y,
        tx: p.x,
        ty: p.y,
        ox: p.x,
        oy: p.y,
        vx: 0,
        vy: 0,
        size: layout.particleSize,
        alpha: 0,
        charIndex: p.charIndex,
        interactive: false,
      }
    })

    assembleTotalRef.current = TEXT.length * LETTER_STAGGER + ASSEMBLE_SETTLE
    phaseRef.current = 'assemble'
    startTimeRef.current = performance.now()
    wallClockStartRef.current = performance.now()
    completeFiredRef.current = false
    if (completeTimeoutRef.current !== null) {
      clearTimeout(completeTimeoutRef.current)
      completeTimeoutRef.current = null
    }

    const repelR = layout.repelRadius

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current
      const phase = phaseRef.current
      const particles = particlesRef.current
      const { x: mx, y: my, inside } = mouseRef.current
      const { W: cW, H: cH } = dimensionsRef.current

      if (phase === 'assemble' && elapsed > assembleTotalRef.current) {
        phaseRef.current = 'dwell'
        startTimeRef.current = now
      } else if (phase === 'dwell' && elapsed > DWELL) {
        phaseRef.current = 'interact'
        particles.forEach((p) => {
          p.interactive = true
        })
        scheduleIntroComplete()
      }

      ctx.clearRect(0, 0, cW, cH)

      for (const p of particles) {
        if (phaseRef.current === 'assemble' || phase === 'assemble') {
          const letterStart = p.charIndex * LETTER_STAGGER
          const letterElapsed = elapsed - letterStart

          if (letterElapsed > 0) {
            const lp = Math.min(letterElapsed / ASSEMBLE_SETTLE, 1)
            const dynEase = EASE * (0.2 + lp * 2.5)
            p.vx += (p.tx - p.x) * dynEase
            p.vy += (p.ty - p.y) * dynEase
            p.vx *= FRICTION
            p.vy *= FRICTION
            p.x += p.vx
            p.y += p.vy
            p.alpha = Math.min(1, 0.3 + lp * 0.7)
          }
        } else if (phase === 'dwell') {
          p.vx += (p.tx - p.x) * RETURN_EASE
          p.vy += (p.ty - p.y) * RETURN_EASE
          p.vx *= RETURN_FRICTION
          p.vy *= RETURN_FRICTION
          p.x += p.vx
          p.y += p.vy
          p.alpha = 1
        } else if (phase === 'interact') {
          const dx = p.x - mx
          const dy = p.y - my
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (inside && dist < repelR) {
            const force = (repelR - dist) / repelR
            const angle = Math.atan2(dy, dx)
            p.vx += Math.cos(angle) * force * REPEL_FORCE
            p.vy += Math.sin(angle) * force * REPEL_FORCE
            p.alpha = 0.5 + force * 0.5
          } else {
            p.alpha = 1
          }

          p.vx += (p.ox - p.x) * RETURN_EASE
          p.vy += (p.oy - p.y) * RETURN_EASE
          p.vx *= RETURN_FRICTION
          p.vy *= RETURN_FRICTION
          p.x += p.vx
          p.y += p.vy
        }

        if (p.alpha <= 0) continue

        ctx.globalAlpha = p.alpha
        ctx.fillStyle = '#f97316'
        ctx.shadowBlur = inside && phase === 'interact' ? 4 : 0
        ctx.shadowColor = '#ea580c'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    const syncPointer = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: clientX - r.left,
        y: clientY - r.top,
        inside: true,
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      syncPointer(e.clientX, e.clientY)
    }
    const handleMouseLeave = () => {
      mouseRef.current.inside = false
    }

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const t = e.touches[0]
      syncPointer(t.clientX, t.clientY)
    }
    const handleTouchEnd = () => {
      mouseRef.current.inside = false
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('touchstart', handleTouch, { passive: true })
    canvas.addEventListener('touchmove', handleTouch, { passive: true })
    canvas.addEventListener('touchend', handleTouchEnd)
    canvas.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (completeTimeoutRef.current !== null) {
        clearTimeout(completeTimeoutRef.current)
        completeTimeoutRef.current = null
      }
      particlesRef.current = []
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('touchstart', handleTouch)
      canvas.removeEventListener('touchmove', handleTouch)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [sampleText, scheduleIntroComplete, viewport.w, viewport.h])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex min-h-[100dvh] w-full touch-none items-center justify-center bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ minHeight: '100dvh' }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full max-h-[100dvh] max-w-[100vw]"
        style={{ display: 'block', cursor: 'none' }}
      />
    </div>
  )
}
