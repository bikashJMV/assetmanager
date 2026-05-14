/**
 * Feature flags — toggled by build environment.
 * Add VITE_ENABLE_RECYCLE_BIN=true to .env.development to enable.
 */
export const FEATURES = {
  RECYCLE_BIN: import.meta.env.VITE_ENABLE_RECYCLE_BIN === 'true',
} as const
