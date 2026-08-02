import * as THREE from 'three'

import { box, standard, type ResourceBin, type Vec3 } from './dioramaResources'
import type { DioramaPalette } from './dioramaTheme'

const RACK_LED_COUNT = 7

function screenMaterial(bin: ResourceBin, palette: DioramaPalette): THREE.MeshStandardMaterial {
  return standard(bin, palette.screen, {
    emissive: new THREE.Color(palette.screen),
    emissiveIntensity: 1.1,
    roughness: 0.35,
  })
}

function buildLaptop(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(0.1, 1.15, -3.4)

  const shell = standard(bin, palette.staffPrimary, { roughness: 0.7 })
  group.add(box(bin, [1.5, 0.08, 1.0], [0, 0, 0], shell))

  const lid = box(bin, [1.5, 0.9, 0.07], [0, 0.45, -0.48], shell)
  lid.rotation.x = -0.28
  group.add(lid)

  const screen = box(bin, [1.34, 0.76, 0.02], [0, 0.45, -0.43], screenMaterial(bin, palette))
  screen.rotation.x = -0.28
  group.add(screen)

  return group
}

function buildMonitor(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(-5.0, 0.85, 0.6)

  const shell = standard(bin, palette.staffPrimary, { roughness: 0.7 })
  group.add(box(bin, [0.9, 0.08, 0.6], [0, 0, 0], shell))
  group.add(box(bin, [0.16, 0.6, 0.16], [0, 0.34, 0], shell))
  group.add(box(bin, [2.0, 1.2, 0.12], [0, 1.2, 0], shell))
  group.add(box(bin, [1.82, 1.02, 0.02], [0, 1.2, 0.08], screenMaterial(bin, palette)))

  return group
}

function buildServerRack(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(5.0, 1.5, -0.6)
  group.add(box(bin, [1.4, 2.6, 1.15], [0, 0, 0], standard(bin, palette.panelShell, { roughness: 0.8 })))

  const ledGeometry = bin.geo(new THREE.BoxGeometry(1.02, 0.1, 0.04))
  const warm = standard(bin, palette.accent, {
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 1.6,
  })
  const cool = standard(bin, palette.fillLight, {
    emissive: new THREE.Color(palette.fillLight),
    emissiveIntensity: 1.2,
  })

  for (let index = 0; index < RACK_LED_COUNT; index += 1) {
    const led = new THREE.Mesh(ledGeometry, index % 2 === 0 ? warm : cool)
    led.position.set(0, 1.0 - index * 0.32, 0.6)
    group.add(led)
  }

  return group
}

function buildPrinter(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(3.4, 0.7, 2.9)
  const shell = standard(bin, palette.plinth, { roughness: 0.85 })
  group.add(box(bin, [1.7, 0.7, 1.4], [0, 0, 0], shell))
  group.add(box(bin, [1.4, 0.35, 1.2], [0, 0.52, 0], shell))
  return group
}

function buildChair(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(2.0, 0, -2.4)
  const shell = standard(bin, palette.staffPrimary, { roughness: 0.8 })
  group.add(box(bin, [0.9, 0.14, 0.9], [0, 0.7, 0], shell))
  group.add(box(bin, [0.9, 1.0, 0.14], [0, 1.25, -0.4], shell))
  group.add(box(bin, [0.16, 0.6, 0.16], [0, 0.35, 0], shell))
  group.add(box(bin, [1.0, 0.1, 1.0], [0, 0.06, 0], shell))
  return group
}

function buildPlant(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.position.set(6.4, 0.25, 1.9)

  const pot = new THREE.Mesh(
    bin.geo(new THREE.CylinderGeometry(0.36, 0.28, 0.5, 20)),
    standard(bin, palette.crate, { roughness: 0.9 }),
  )
  pot.castShadow = true
  group.add(pot)

  const leafGeometry = bin.geo(new THREE.IcosahedronGeometry(0.34, 0))
  const leafMaterial = standard(bin, palette.foliage, { roughness: 0.8 })
  const offsets: Vec3[] = [
    [0, 0.62, 0],
    [0.24, 0.44, 0.12],
    [-0.2, 0.5, -0.14],
  ]
  for (const offset of offsets) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial)
    leaf.position.set(offset[0], offset[1], offset[2])
    leaf.castShadow = true
    group.add(leaf)
  }

  return group
}

function buildCrate(bin: ResourceBin, palette: DioramaPalette): THREE.Mesh {
  const crate = box(bin, [1.0, 1.0, 1.0], [-5.4, 0.5, 3.4], standard(bin, palette.crate, { roughness: 0.9 }))
  crate.rotation.y = 0.34
  return crate
}

export function buildProps(bin: ResourceBin, palette: DioramaPalette): THREE.Group {
  const group = new THREE.Group()
  group.add(buildLaptop(bin, palette))
  group.add(buildMonitor(bin, palette))
  group.add(buildServerRack(bin, palette))
  group.add(buildPrinter(bin, palette))
  group.add(buildChair(bin, palette))
  group.add(buildPlant(bin, palette))
  group.add(buildCrate(bin, palette))
  return group
}
