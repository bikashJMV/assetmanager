import { describe, it, expect } from 'vitest'
import { usableAvatarSrc, validateAvatarFile, AVATAR_MAX_BYTES } from './avatar'

describe('usableAvatarSrc', () => {
  it('builds a data URI from a stored avatar', () => {
    const src = usableAvatarSrc({ image_base64: 'AAAA', mime_type: 'image/png' })
    expect(src).toBe('data:image/png;base64,AAAA')
  })

  it('returns null when no avatar is set', () => {
    expect(usableAvatarSrc(null)).toBeNull()
    expect(usableAvatarSrc(undefined)).toBeNull()
  })

  it('returns null for a record with an empty payload', () => {
    expect(usableAvatarSrc({ image_base64: '', mime_type: 'image/png' })).toBeNull()
    expect(usableAvatarSrc({ image_base64: '   ', mime_type: 'image/png' })).toBeNull()
  })
})

describe('validateAvatarFile', () => {
  it('accepts a png at exactly the 50 KB limit', () => {
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toEqual({ ok: true })
  })

  it('accepts jpeg and webp', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 10 * 1024 })).toEqual({ ok: true })
    expect(validateAvatarFile({ type: 'image/webp', size: 10 * 1024 })).toEqual({ ok: true })
  })

  it('rejects an image larger than 50 KB', () => {
    const result = validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/50 KB or smaller/i)
  })

  it('rejects a non-image file', () => {
    const result = validateAvatarFile({ type: 'application/pdf', size: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/PNG, JPEG, or WebP/i)
  })

  it('rejects an unsupported image type (gif)', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 1024 }).ok).toBe(false)
  })

  it('limit is 50 KB', () => {
    expect(AVATAR_MAX_BYTES).toBe(50 * 1024)
  })
})
