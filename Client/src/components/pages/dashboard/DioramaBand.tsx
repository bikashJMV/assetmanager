import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildDiorama } from './buildDiorama'
import { DIORAMA_LABELS } from './dioramaLabels'
import { prefersReducedMotion, resolvePalette, watchTheme } from './dioramaTheme'
import type { AnalyticsWallData } from './dioramaTextures'
import {
  BAND_CAMERA,
  CAMERA_BASE_ANGLE,
  CAMERA_HEIGHT,
  CAMERA_ORBIT_RADIUS,
  frustumHeightFor,
} from './stages'

export type DioramaBandProps = {
  wall: AnalyticsWallData
  onReady: () => void
  onUnsupported: () => void
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    return renderer
  } catch {
    return null
  }
}

/**
 * Compact fixed-angle view of the office floor. It sits between the hero and
 * the KPI grid as a visual bridge, so it deliberately does not pin or scrub —
 * the dashboard's job is to hand the reader its numbers quickly.
 */
export default function DioramaBand({ wall, onReady, onUnsupported }: DioramaBandProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wallRef = useRef(wall)
  const [supported, setSupported] = useState(true)

  wallRef.current = wall

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    const renderer = createRenderer(canvas)
    if (!renderer) {
      setSupported(false)
      onUnsupported()
      return
    }

    const reduced = prefersReducedMotion()
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    const target = new THREE.Vector3(BAND_CAMERA.tx, BAND_CAMERA.ty, BAND_CAMERA.tz)

    let diorama = buildDiorama(resolvePalette(), wallRef.current, !reduced)
    scene.add(diorama.world, diorama.lights)

    const angle = CAMERA_BASE_ANGLE + BAND_CAMERA.orbit
    camera.position.set(
      target.x + Math.cos(angle) * CAMERA_ORBIT_RADIUS,
      target.y + CAMERA_HEIGHT,
      target.z + Math.sin(angle) * CAMERA_ORBIT_RADIUS,
    )
    camera.lookAt(target)

    const resize = (): void => {
      const { clientWidth, clientHeight } = host
      if (clientWidth === 0 || clientHeight === 0) return
      const aspect = clientWidth / clientHeight
      const half = frustumHeightFor(aspect) / 2
      camera.left = -half * aspect
      camera.right = half * aspect
      camera.top = half
      camera.bottom = -half
      camera.zoom = BAND_CAMERA.zoom
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight, false)
    }
    resize()

    const rebuildScene = (): void => {
      scene.remove(diorama.world, diorama.lights)
      diorama.dispose()
      diorama = buildDiorama(resolvePalette(), wallRef.current, !reduced)
      scene.add(diorama.world, diorama.lights)
    }

    const clock = new THREE.Clock()
    let frame = 0
    let announced = false

    const loop = (): void => {
      frame = requestAnimationFrame(loop)
      diorama.tick(clock.getElapsedTime())
      renderer.render(scene, camera)
      if (announced) return
      announced = true
      onReady()
    }
    frame = requestAnimationFrame(loop)

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const stopThemeWatch = watchTheme(rebuildScene)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      stopThemeWatch()
      scene.remove(diorama.world, diorama.lights)
      diorama.dispose()
      renderer.dispose()
    }
  }, [onReady, onUnsupported])

  if (!supported) return null

  return (
    <div
      ref={hostRef}
      className="relative h-[34vh] min-h-[220px] w-full overflow-hidden sm:h-[38vh] sm:min-h-[260px]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        title={DIORAMA_LABELS.sectionAriaLabel}
        className="block h-full w-full"
      />
    </div>
  )
}
