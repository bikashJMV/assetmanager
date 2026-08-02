import * as THREE from 'three'

/**
 * Tracks every GPU resource the scene creates so unmount can release all of
 * them. three.js does not dispose children automatically when a group is
 * removed, so anything not registered here would leak.
 */
export class ResourceBin {
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly textures: THREE.Texture[] = []

  geo<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  mat<T extends THREE.Material>(material: T): T {
    this.materials.push(material)
    return material
  }

  tex<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture)
    return texture
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    for (const texture of this.textures) texture.dispose()
    this.geometries.length = 0
    this.materials.length = 0
    this.textures.length = 0
  }
}

export type Vec3 = [number, number, number]

export function box(
  bin: ResourceBin,
  size: Vec3,
  position: Vec3,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(bin.geo(new THREE.BoxGeometry(size[0], size[1], size[2])), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function standard(
  bin: ResourceBin,
  color: string,
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return bin.mat(new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options }))
}

export function outline(
  bin: ResourceBin,
  geometry: THREE.BufferGeometry,
  color: string,
  opacity = 0.85,
): THREE.LineSegments {
  const edges = bin.geo(new THREE.EdgesGeometry(geometry))
  const material = bin.mat(
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
  return new THREE.LineSegments(edges, material)
}
