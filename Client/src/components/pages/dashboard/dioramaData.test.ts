import { describe, expect, it } from 'vitest'

import { normalizeBars, normalizeCounts } from './dioramaBars'
import { BAND_CAMERA, frustumHeightFor, CAMERA_FRUSTUM_HEIGHT } from './stages'

describe('normalizeBars', () => {
  it('returns an empty series when there are no points', () => {
    expect(normalizeBars([])).toEqual([])
  })

  it('scales counts against the peak month', () => {
    const bars = normalizeBars([
      { month: '2026-01', count: 5 },
      { month: '2026-02', count: 10 },
      { month: '2026-03', count: 0 },
    ])
    expect(bars).toEqual([0.5, 1, 0])
  })

  it('flattens to zero when every month is empty', () => {
    expect(normalizeBars([{ month: '2026-01', count: 0 }])).toEqual([0])
  })

  it('keeps only the twelve most recent months', () => {
    const points = Array.from({ length: 20 }, (_, index) => ({
      month: `m${index}`,
      count: index + 1,
    }))
    expect(normalizeBars(points)).toHaveLength(12)
  })
})

describe('normalizeCounts', () => {
  it('scales the category fallback against its own peak', () => {
    expect(normalizeCounts([2, 4, 1])).toEqual([0.5, 1, 0.25])
  })

  it('returns zeros when every category is empty', () => {
    expect(normalizeCounts([0, 0])).toEqual([0, 0])
  })
})

describe('frustumHeightFor', () => {
  it('keeps the base height on landscape viewports', () => {
    expect(frustumHeightFor(1.6)).toBe(CAMERA_FRUSTUM_HEIGHT)
  })

  it('widens the frustum on portrait viewports so the floor is not cropped', () => {
    const portrait = frustumHeightFor(0.46)
    expect(portrait).toBeGreaterThan(CAMERA_FRUSTUM_HEIGHT)
    // Horizontal extent must clear the minimum world width.
    expect(portrait * 0.46).toBeGreaterThanOrEqual(21.9)
  })

  it('falls back to the base height for a degenerate aspect', () => {
    expect(frustumHeightFor(0)).toBe(CAMERA_FRUSTUM_HEIGHT)
  })

  it('declares a valid band camera', () => {
    expect(BAND_CAMERA.zoom).toBeGreaterThan(0)
  })
})
