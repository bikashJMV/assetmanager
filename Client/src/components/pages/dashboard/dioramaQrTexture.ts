import type * as THREE from 'three'

import { createContext, toTexture } from './dioramaCanvas'
import type { DioramaPalette } from './dioramaTheme'

const QR_MODULES = 21
const QR_PX = 512

/** Deterministic PRNG so the decorative QR pattern is stable across renders. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function isFinderModule(row: number, col: number): boolean {
  const inEye = (r0: number, c0: number): boolean =>
    row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7
  return inEye(0, 0) || inEye(0, QR_MODULES - 7) || inEye(QR_MODULES - 7, 0)
}

function drawFinderEye(
  ctx: CanvasRenderingContext2D,
  unit: number,
  row: number,
  col: number,
  ink: string,
  paper: string,
): void {
  ctx.fillStyle = ink
  ctx.fillRect(col * unit, row * unit, unit * 7, unit * 7)
  ctx.fillStyle = paper
  ctx.fillRect((col + 1) * unit, (row + 1) * unit, unit * 5, unit * 5)
  ctx.fillStyle = ink
  ctx.fillRect((col + 2) * unit, (row + 2) * unit, unit * 3, unit * 3)
}

/** Decorative QR-style grid — not a scannable code. */
export function createQrTexture(palette: DioramaPalette): THREE.CanvasTexture | null {
  const ctx = createContext(QR_PX, QR_PX)
  if (!ctx) return null

  const unit = QR_PX / QR_MODULES
  const paper = palette.panelInk
  const ink = palette.panelSurface

  ctx.fillStyle = paper
  ctx.fillRect(0, 0, QR_PX, QR_PX)

  const random = seededRandom(20260802)
  ctx.fillStyle = ink
  for (let row = 0; row < QR_MODULES; row += 1) {
    for (let col = 0; col < QR_MODULES; col += 1) {
      if (isFinderModule(row, col)) continue
      if (random() > 0.52) ctx.fillRect(col * unit, row * unit, unit, unit)
    }
  }

  drawFinderEye(ctx, unit, 0, 0, ink, paper)
  drawFinderEye(ctx, unit, 0, QR_MODULES - 7, ink, paper)
  drawFinderEye(ctx, unit, QR_MODULES - 7, 0, ink, paper)

  return toTexture(ctx)
}
