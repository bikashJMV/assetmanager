import { useEffect, useState } from 'react'
import type { AvatarData } from '../../services/avatarService'
import { usableAvatarSrc } from '../../utils/avatar'
import { AppIcon } from '../ui'

/** Circular user avatar: the uploaded image when usable, otherwise the default
 * profile glyph. Purely presentational — callers own the click behaviour. */
export default function UserAvatar({
  avatar,
  size,
  alt,
  className = '',
}: {
  avatar: AvatarData | null | undefined
  /** rendered diameter in px */
  size: number
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = usableAvatarSrc(avatar)

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line ${className}`}
      style={{ width: size, height: size, backgroundColor: 'hsl(var(--primary) / 0.10)' }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(event) => {
            const img = event.currentTarget
            if (img.naturalWidth <= 1 && img.naturalHeight <= 1) setFailed(true)
          }}
        />
      ) : (
        <span className="flex items-center justify-center" style={{ color: 'hsl(var(--primary) / 0.55)' }}>
          <AppIcon name="profile" size={Math.round(size * 0.6)} aria-label={alt} />
        </span>
      )}
    </span>
  )
}
