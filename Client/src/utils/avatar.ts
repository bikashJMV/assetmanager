/** Structural shape of a stored avatar. Declared here rather than imported from the
 * service so this module stays free of the API/auth chain (it is imported by tests
 * and by presentation code that must not pull in a browser-only auth client). */
type StoredAvatar = { image_base64: string; mime_type: string }

/** Profile-image constraints. A signed-in user sets their own avatar (persisted server-side). */
export const AVATAR_MAX_BYTES = 50 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type AvatarValidation = { ok: true } | { ok: false; error: string }

/**
 * Displayable data URI for a stored avatar, or null when there is nothing usable
 * to show — no record, or a record whose payload is empty. Callers fall back to
 * the default profile glyph on null.
 */
export function usableAvatarSrc(avatar: StoredAvatar | null | undefined): string | null {
  if (!avatar || !avatar.image_base64.trim()) return null
  return `data:${avatar.mime_type};base64,${avatar.image_base64}`
}

/** Validate a picked profile image: PNG/JPEG/WebP and at most AVATAR_MAX_BYTES (50 KB). */
export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): AvatarValidation {
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: 'Please choose a PNG, JPEG, or WebP image.' }
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: 'Profile image must be 50 KB or smaller.' }
  return { ok: true }
}
