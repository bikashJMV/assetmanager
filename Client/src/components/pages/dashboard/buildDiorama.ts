import * as THREE from 'three'

import {
  buildAnalyticsWall,
  buildPodium,
  buildQrStation,
  buildSignWall,
  buildTiers,
} from './dioramaFloor'
import { buildFloaters, buildStaff, buildWalkPath, type Floater } from './dioramaActors'
import { buildProps } from './dioramaProps'
import { ResourceBin } from './dioramaResources'
import type { AnalyticsWallData } from './dioramaTextures'
import type { DioramaPalette } from './dioramaTheme'

export type Diorama = {
  world: THREE.Group
  lights: THREE.Group
  /** Advance ambient motion. `elapsed` is seconds since mount. */
  tick: (elapsed: number) => void
  dispose: () => void
}

const PATH_LOOP_SECONDS = 9

function buildLights(palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()

  group.add(
    new THREE.HemisphereLight(
      new THREE.Color(palette.hemiSky),
      new THREE.Color(palette.hemiGround),
      0.95,
    ),
  )

  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(9, 14, 7)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -16
  key.shadow.camera.right = 16
  key.shadow.camera.top = 16
  key.shadow.camera.bottom = -16
  key.shadow.camera.near = 1
  key.shadow.camera.far = 48
  group.add(key)

  const fill = new THREE.DirectionalLight(new THREE.Color(palette.fillLight), 0.35)
  fill.position.set(-8, 6, -6)
  group.add(fill)

  return group
}

/**
 * Pure scene construction — no renderer, no scroll, no React. Returns the
 * assembled world plus an ambient-motion tick and a full teardown.
 */
export function buildDiorama(
  palette: DioramaPalette,
  data: AnalyticsWallData,
  animate: boolean,
): Diorama {
  const bin = new ResourceBin()
  const world = new THREE.Group()
  world.name = 'world'

  world.add(buildTiers(bin, palette))
  world.add(buildSignWall(bin, palette))
  world.add(buildAnalyticsWall(bin, palette, data))
  world.add(buildProps(bin, palette))
  world.add(buildStaff(bin, palette))
  world.add(buildQrStation(bin, palette))

  const podium = buildPodium(bin, palette)
  world.add(podium.group)

  const path = buildWalkPath(bin, palette)
  world.add(path.group)

  const floaters = buildFloaters(bin, palette)
  world.add(floaters.group)

  const markerPoint = new THREE.Vector3()

  const tick = (elapsed: number): void => {
    if (!animate) return

    podium.cube.rotation.y = elapsed * 0.6
    podium.cube.position.y = 1.9 + Math.sin(elapsed * 1.4) * 0.14
    podium.light.position.copy(podium.cube.position)

    const t = (elapsed % PATH_LOOP_SECONDS) / PATH_LOOP_SECONDS
    path.curve.getPointAt(t, markerPoint)
    path.marker.position.copy(markerPoint)

    floaters.floaters.forEach((floater: Floater) => {
      floater.mesh.position.y = floater.baseY + Math.sin(elapsed * 0.9 + floater.phase) * 0.18
      floater.mesh.rotation.x = elapsed * 0.35 + floater.phase
      floater.mesh.rotation.y = elapsed * 0.5 + floater.phase
    })
  }

  // Park the animated pieces at their resting pose so reduced motion still
  // shows a composed scene rather than a marker stuck at the curve origin.
  path.curve.getPointAt(0, markerPoint)
  path.marker.position.copy(markerPoint)

  const dispose = (): void => {
    world.traverse((object) => {
      if (object instanceof THREE.PointLight || object instanceof THREE.DirectionalLight) {
        object.dispose()
      }
    })
    world.clear()
    bin.dispose()
  }

  return { world, lights: buildLights(palette), tick, dispose }
}
