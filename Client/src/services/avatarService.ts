import { apiRequest } from '../api/apiClient'
import { getErrorStatusCode } from '../utils/authNexus.api'

export type AvatarData = {
  image_base64: string
  mime_type: string
  updated_at: string | null
}

/** Fetch the current user's avatar, or null when none is set (server answers 200/data:null). */
export async function getMyAvatar(): Promise<AvatarData | null> {
  try {
    return await apiRequest<AvatarData>({ method: 'GET', url: '/api/v1/employees/me/avatar' })
  } catch (err) {
    if (getErrorStatusCode(err) === 404) return null
    throw err
  }
}

/** Upsert the current user's avatar (base64 without the data: prefix). */
export async function putMyAvatar(imageBase64: string, mimeType: string): Promise<void> {
  await apiRequest({
    method: 'PUT',
    url: '/api/v1/employees/me/avatar',
    data: { image_base64: imageBase64, mime_type: mimeType },
  })
}

export async function deleteMyAvatar(): Promise<void> {
  await apiRequest({ method: 'DELETE', url: '/api/v1/employees/me/avatar' })
}

/** Build a displayable data URI from the API payload. */
export function avatarDataUri(a: AvatarData): string {
  return `data:${a.mime_type};base64,${a.image_base64}`
}
