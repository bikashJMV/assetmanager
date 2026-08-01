import { useQuery } from '@tanstack/react-query'

import { getMyAvatar, type AvatarData } from '../services/avatarService'

export const avatarQueryKeys = {
  all: ['avatar'] as const,
  me: () => [...avatarQueryKeys.all, 'me'] as const,
}

/** Current user's avatar, or null when none is set. Cached so the top bar and the
 * settings profile don't each hit the endpoint. */
export function useMyAvatarQuery() {
  return useQuery<AvatarData | null>({
    queryKey: avatarQueryKeys.me(),
    queryFn: () => getMyAvatar(),
    staleTime: 5 * 60 * 1000,
  })
}
