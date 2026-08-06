import * as THREE from 'three'

import { createQrTexture } from './dioramaQrTexture'
import { createAnalyticsTexture, createSignTexture } from './dioramaTextures'
import type { AnalyticsWallData } from './dioramaTextures'
import { box, outline, standard, type ResourceBin, type Vec3 } from './dioramaResources'
import type { DioramaPalette } from './dioramaTheme'

type Tier = { size: Vec3; position: Vec3; tone: 'floorTop' | 'floorLip' | 'plinth' }

const TIERS: readonly Tier[] = [
  { size: [15, 1.0, 15], position: [0, -0.5, 0], tone: 'floorTop' },
  { size: [15.4, 0.35, 15.4], position: [0, -1.15, 0], tone: 'floorLip' },
  { size: [7.6, 1.1, 4.4], position: [-1.8, 0.55, -4.6], tone: 'plinth' },
  { size: [5.6, 0.9, 4.0], position: [4.6, 0.45, -4.4], tone: 'plinth' },
  { size: [3.4, 0.85, 3.4], position: [-5.0, 0.42, 0.6], tone: 'plinth' },
  { size: [3.0, 1.5, 3.0], position: [5.0, 0.75, -0.6], tone: 'plinth' },
  { size: [3.2, 0.7, 2.8], position: [3.4, 0.35, 2.9], tone: 'plinth' },
  { size: [3.4, 0.8, 3.4], position: [-1.6, 0.4, 4.6], tone: 'plinth' },
]

export function buildTiers(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  const materials = {
    floorTop: standard(bin, palette.floorTop),
    floorLip: standard(bin, palette.floorLip),
    plinth: standard(bin, palette.plinth),
  }
  for (const tier of TIERS) {
    group.add(box(bin, tier.size, tier.position, materials[tier.tone]))
  }
  return group
}

export function buildSignWall(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.add(box(bin, [7.2, 3.1, 0.5], [-1.8, 2.65, -6.2], standard(bin, palette.panelShell)))

  const texture = createSignTexture(palette)
  if (!texture) return group
  bin.tex(texture)

  const panel = new THREE.Mesh(
    bin.geo(new THREE.PlaneGeometry(6.9, 2.85)),
    bin.mat(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })),
  )
  panel.position.set(-1.8, 2.65, -5.93)
  group.add(panel)
  return group
}

export function buildAnalyticsWall(
  bin: ResourceBin,
  palette: DioramaPalette,
  data: AnalyticsWallData,
): THREE.Group {
  const group = new THREE.Group()
  group.position.set(4.6, 2.6, -5.4)
  group.rotation.y = -0.26
  group.add(box(bin, [5.2, 3.4, 0.35], [0, 0, 0], standard(bin, palette.analyticsShell)))

  const texture = createAnalyticsTexture(palette, data)
  if (!texture) return group
  bin.tex(texture)

  const panel = new THREE.Mesh(
    bin.geo(new THREE.PlaneGeometry(4.9, 3.15)),
    bin.mat(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })),
  )
  panel.position.set(0, 0, 0.19)
  group.add(panel)
  return group
}

export type PodiumHandles = {
  group: THREE.Group
  cube: THREE.Group
  light: THREE.PointLight
}

export function buildPodium(bin: ResourceBin, palette: DioramaPalette): PodiumHandles {
  const group = new THREE.Group()

  const base = new THREE.Mesh(
    bin.geo(new THREE.CylinderGeometry(1.75, 1.9, 0.55, 48)),
    standard(bin, palette.plinth),
  )
  base.position.set(0, 0.28, 0.4)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const ring = new THREE.Mesh(
    bin.geo(new THREE.TorusGeometry(1.5, 0.055, 12, 64)),
    standard(bin, palette.accent, {
      emissive: new THREE.Color(palette.accent),
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.58, 0.4)
  group.add(ring)

  const cube = new THREE.Group()
  cube.position.set(0, 1.9, 0.4)
  const cubeGeometry = bin.geo(new THREE.BoxGeometry(1.05, 1.05, 1.05))
  const cubeMesh = new THREE.Mesh(
    cubeGeometry,
    standard(bin, palette.accent, {
      emissive: new THREE.Color(palette.accentDeep),
      emissiveIntensity: 0.6,
      roughness: 0.5,
    }),
  )
  cubeMesh.castShadow = true
  cube.add(cubeMesh)
  cube.add(outline(bin, cubeGeometry, palette.accentGlow, 0.9))
  group.add(cube)

  const light = new THREE.PointLight(new THREE.Color(palette.accentGlow), 2.2, 7)
  light.position.copy(cube.position)
  group.add(light)

  return { group, cube, light }
}

export function buildQrStation(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(-1.6, 1.55, 4.6)
  group.rotation.y = 0.5

  const geometry = bin.geo(new THREE.BoxGeometry(1.3, 1.3, 1.3))
  const texture = createQrTexture(palette)
  const material = texture
    ? standard(bin, '#ffffff', { map: bin.tex(texture), roughness: 0.6 })
    : standard(bin, palette.panelInk)

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  group.add(mesh)
  group.add(outline(bin, geometry, palette.accent, 0.95))
  group.add(new THREE.PointLight(new THREE.Color(palette.accentGlow), 1.6, 6))

  return group
}
