import * as THREE from 'three'

/** Shared 2D-canvas helpers for the diorama's generated textures. */

export function createContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.getContext('2d')
}

export function toTexture(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(ctx.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}
