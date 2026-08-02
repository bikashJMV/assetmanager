/** Camera placement for the isometric floor band. */

export const CAMERA_ORBIT_RADIUS = 30
export const CAMERA_HEIGHT = 21.6
export const CAMERA_BASE_ANGLE = Math.PI * 0.25
export const CAMERA_FRUSTUM_HEIGHT = 17

/**
 * Minimum horizontal extent, in world units, the camera must keep in frame.
 * Portrait viewports would otherwise crop the floor to a sliver, since an
 * orthographic frustum derives its width from the height times the aspect.
 */
export const CAMERA_MIN_FRUSTUM_WIDTH = 22

export type CameraState = {
  tx: number
  ty: number
  tz: number
  zoom: number
  orbit: number
}

/** Fixed vantage point: the whole floor, slightly above centre. */
export const BAND_CAMERA: CameraState = {
  tx: 0,
  ty: 1.3,
  tz: 0.2,
  zoom: 1,
  orbit: 0,
}

export function frustumHeightFor(aspect: number): number {
  if (aspect <= 0) return CAMERA_FRUSTUM_HEIGHT
  return Math.max(CAMERA_FRUSTUM_HEIGHT, CAMERA_MIN_FRUSTUM_WIDTH / aspect)
}
