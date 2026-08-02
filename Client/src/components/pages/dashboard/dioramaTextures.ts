import type * as THREE from 'three'

import { createContext, toTexture } from './dioramaCanvas'
import { DIORAMA_LABELS } from './dioramaLabels'
import type { DioramaPalette } from './dioramaTheme'

/** Canvas-drawn textures. Every colour comes from the resolved token palette. */

const SIGN_W = 1024
const SIGN_H = 424
const WALL_W = 1024
const WALL_H = 660

export function createSignTexture(palette: DioramaPalette): THREE.CanvasTexture | null {
  const ctx = createContext(SIGN_W, SIGN_H)
  if (!ctx) return null

  ctx.fillStyle = palette.panelSurface
  ctx.fillRect(0, 0, SIGN_W, SIGN_H)

  const brand = ctx.createLinearGradient(0, 40, 0, 300)
  brand.addColorStop(0, palette.accentGlow)
  brand.addColorStop(1, palette.accentDeep)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = brand
  ctx.font = '800 250px Inter, system-ui, sans-serif'
  ctx.fillText(DIORAMA_LABELS.signTitle, SIGN_W / 2, 170)

  ctx.fillStyle = palette.panelInk
  ctx.font = '800 92px Inter, system-ui, sans-serif'
  ctx.fillText(DIORAMA_LABELS.signSubtitle, SIGN_W / 2, 330)

  return toTexture(ctx)
}

export type AnalyticsWallData = {
  /** Normalized 0–1 monthly counts, left to right. */
  bars: number[]
  /** 0–1 share of assets currently assigned. */
  utilization: number
  /** True when the account has no assets yet — draws a flat baseline. */
  isEmpty: boolean
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  palette: DioramaPalette,
  bars: number[],
  isEmpty: boolean,
): void {
  const left = 60
  const bottom = WALL_H - 90
  const areaW = 560
  const areaH = 380
  const count = Math.max(bars.length, 1)
  const slot = areaW / count
  const barW = Math.max(10, slot * 0.55)

  ctx.strokeStyle = palette.panelInk
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, bottom)
  ctx.lineTo(left + areaW, bottom)
  ctx.stroke()
  ctx.globalAlpha = 1

  if (isEmpty) return

  bars.forEach((value, index) => {
    const height = Math.max(6, Math.min(1, value) * areaH)
    const x = left + index * slot + (slot - barW) / 2
    const gradient = ctx.createLinearGradient(0, bottom - height, 0, bottom)
    gradient.addColorStop(0, palette.accentGlow)
    gradient.addColorStop(1, palette.accentDeep)
    ctx.fillStyle = gradient
    ctx.fillRect(x, bottom - height, barW, height)
  })
}

function drawDonut(
  ctx: CanvasRenderingContext2D,
  palette: DioramaPalette,
  utilization: number,
): void {
  const cx = 810
  const cy = 300
  const radius = 130
  const start = -Math.PI / 2
  const sweep = Math.max(0, Math.min(1, utilization)) * Math.PI * 2

  ctx.lineWidth = 42
  ctx.lineCap = 'round'

  ctx.strokeStyle = palette.panelInk
  ctx.globalAlpha = 0.16
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1

  if (sweep > 0) {
    ctx.strokeStyle = palette.accent
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + sweep)
    ctx.stroke()
  }

  ctx.fillStyle = palette.panelInk
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 96px Inter, system-ui, sans-serif'
  ctx.fillText(`${Math.round(utilization * 100)}%`, cx, cy - 6)
  ctx.font = '600 34px Inter, system-ui, sans-serif'
  ctx.globalAlpha = 0.72
  ctx.fillText(DIORAMA_LABELS.utilizationLabel.toUpperCase(), cx, cy + 62)
  ctx.globalAlpha = 1
}

export function createAnalyticsTexture(
  palette: DioramaPalette,
  data: AnalyticsWallData,
): THREE.CanvasTexture | null {
  const ctx = createContext(WALL_W, WALL_H)
  if (!ctx) return null

  ctx.fillStyle = palette.analyticsShell
  ctx.fillRect(0, 0, WALL_W, WALL_H)

  ctx.fillStyle = palette.panelInk
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '800 44px Inter, system-ui, sans-serif'
  ctx.fillText(DIORAMA_LABELS.wallHeading.toUpperCase(), 60, 88)

  drawBars(ctx, palette, data.bars, data.isEmpty)
  drawDonut(ctx, palette, data.isEmpty ? 0 : data.utilization)

  return toTexture(ctx)
}

