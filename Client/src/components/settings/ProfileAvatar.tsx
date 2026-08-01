import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppIcon } from '../ui'
import { useToast } from '../../hooks/useToast'
import { usableAvatarSrc, validateAvatarFile } from '../../utils/avatar'
import { putMyAvatar } from '../../services/avatarService'
import { avatarQueryKeys, useMyAvatarQuery } from '../../queries/avatar'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

const MEMBER_SINCE = "ASSET MANAGER SINCE APR'26"

/** Editable profile picture. Reads the shared avatar query (same cache as the top
 * bar) and invalidates it after an upload so both update from one request. */
export default function ProfileAvatar({ name }: { name: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const avatarQuery = useMyAvatarQuery()
  // Optimistic src for the just-picked file, so the preview doesn't wait on a refetch.
  const [pendingSrc, setPendingSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const src = pendingSrc ?? usableAvatarSrc(avatarQuery.data)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const check = validateAvatarFile(file)
    if (!check.ok) {
      showToast({ variant: 'warning', message: check.error })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      void (async () => {
        const dataUrl = String(reader.result)
        const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
        try {
          await putMyAvatar(base64, file.type)
          setPendingSrc(dataUrl)
          // Refresh the shared cache so the top bar picks the new image up too.
          await queryClient.invalidateQueries({ queryKey: avatarQueryKeys.me() })
          showToast({ variant: 'success', message: 'Profile image updated.' })
        } catch (err) {
          logDevError('avatar.upload', err)
          showToast({ variant: 'warning', message: getUserFacingMessage(err, 'Unable to update profile image.') })
        }
      })()
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="relative flex h-60 w-60 items-center justify-center">
      {/* Circular typography ring around the avatar (SVG textPath) — phrase twice, spans full 360°. */}
      <svg viewBox="0 0 240 240" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <path id="ams-avatar-ring" fill="none" d="M 120,120 m -104,0 a 104,104 0 1,1 208,0 a 104,104 0 1,1 -208,0" />
        </defs>
        <text style={{ fontSize: '9px', fontWeight: 700, fill: 'hsl(var(--primary))' }}>
          <textPath href="#ams-avatar-ring" startOffset="0" textLength="653" lengthAdjust="spacing">
            {`${MEMBER_SINCE} • ${MEMBER_SINCE} • `}
          </textPath>
        </text>
      </svg>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Change profile image"
        title="Change profile image (max 50 KB)"
        className="group relative h-48 w-48 shrink-0 overflow-hidden rounded-full border border-line transition hover:opacity-90"
        style={{ backgroundColor: 'hsl(var(--primary) / 0.10)' }}
      >
        {src && !failed ? (
          <img
            src={src}
            alt={`${name} profile`}
            className="h-full w-full rounded-full object-cover"
            onError={() => setFailed(true)}
            onLoad={(event) => {
              // A 1x1 placeholder loads fine but paints nothing — treat it as no avatar.
              const img = event.currentTarget
              if (img.naturalWidth <= 1 && img.naturalHeight <= 1) setFailed(true)
            }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ color: 'hsl(var(--primary) / 0.55)' }}>
            <AppIcon name="profile" size={72} />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          <AppIcon name="edit" size={11} /> Edit
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  )
}
