import * as THREE from 'three'

import { box, outline, standard, type ResourceBin, type Vec3 } from './dioramaResources'
import type { DioramaPalette } from './dioramaTheme'


type StaffSpec = { x: number; z: number; accent: boolean }

const STAFF: readonly StaffSpec[] = [
  { x: -2.4, z: 1.9, accent: false },
  { x: 2.5, z: 2.0, accent: false },
  { x: -3.6, z: 5.5, accent: true },
  { x: 4.4, z: 3.9, accent: false },
]

function buildStaffMember(
  bin: ResourceBin,
  palette: DioramaPalette,
  spec: StaffSpec,
): THREE.Group {
  const group = new THREE.Group()
  group.position.set(spec.x, 0, spec.z)

  const bodyColor = spec.accent ? palette.staffAccent : palette.staffPrimary
  const body = standard(bin, bodyColor, { roughness: 0.8 })
  const skin = standard(bin, palette.crate, { roughness: 0.9 })
  const hair = standard(bin, palette.staffPrimary, { roughness: 0.9 })

  group.add(box(bin, [0.2, 0.7, 0.2], [-0.14, 0.35, 0], body))
  group.add(box(bin, [0.2, 0.7, 0.2], [0.14, 0.35, 0], body))
  group.add(box(bin, [0.56, 0.72, 0.34], [0, 1.06, 0], body))

  const head = new THREE.Mesh(bin.geo(new THREE.SphereGeometry(0.24, 18, 18)), skin)
  head.position.set(0, 1.62, 0)
  head.castShadow = true
  group.add(head)

  const hairMesh = new THREE.Mesh(
    bin.geo(new THREE.SphereGeometry(0.26, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2)),
    hair,
  )
  hairMesh.position.set(0, 1.64, 0)
  group.add(hairMesh)

  const arm = box(bin, [0.16, 0.56, 0.16], [0.34, 1.12, 0.16], body)
  arm.rotation.x = -0.9
  group.add(arm)

  const tablet = box(bin, [0.34, 0.02, 0.46], [0.34, 1.16, 0.44], standard(bin, palette.screen, {
    emissive: new THREE.Color(palette.screen),
    emissiveIntensity: 1.0,
  }))
  tablet.rotation.x = -0.35
  group.add(tablet)

  return group
}

export function buildStaff(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  for (const spec of STAFF) group.add(buildStaffMember(bin, palette, spec))
  return group
}

export type WalkPath = {
  group: THREE.Group
  curve: THREE.CatmullRomCurve3
  marker: THREE.Mesh
}

export function buildWalkPath(bin: ResourceBin, palette: DioramaPalette): WalkPath {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.4, 0.06, 5.6),
    new THREE.Vector3(-1.6, 0.06, 5.2),
    new THREE.Vector3(1.2, 0.06, 3.6),
    new THREE.Vector3(3.6, 0.06, 4.2),
    new THREE.Vector3(5.6, 0.06, 2.2),
    new THREE.Vector3(5.4, 0.06, -0.2),
  ])

  const group = new THREE.Group()
  const glow = standard(bin, palette.accent, {
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 1.5,
    roughness: 0.4,
  })
  group.add(new THREE.Mesh(bin.geo(new THREE.TubeGeometry(curve, 160, 0.085, 8, false)), glow))

  const marker = new THREE.Mesh(bin.geo(new THREE.SphereGeometry(0.16, 16, 16)), glow)
  group.add(marker)

  return { group, curve, marker }
}

export type Floater = { mesh: THREE.LineSegments; phase: number; baseY: number }

const FLOATER_POSITIONS: readonly Vec3[] = [
  [-3.2, 2.6, -1.6],
  [2.9, 3.0, 0.9],
  [-0.6, 3.3, 2.6],
]

export function buildFloaters(
  bin: ResourceBin,
  palette: DioramaPalette,
): { group: THREE.Group; floaters: Floater[] } {
  const group = new THREE.Group()
  const floaters: Floater[] = []
  const geometry = bin.geo(new THREE.BoxGeometry(0.62, 0.62, 0.62))

  FLOATER_POSITIONS.forEach((position, index) => {
    const mesh = outline(bin, geometry, palette.accentGlow, 0.85)
    mesh.position.set(position[0], position[1], position[2])
    group.add(mesh)
    floaters.push({ mesh, phase: index * 2.1, baseY: position[1] })
  })

  return { group, floaters }
}
