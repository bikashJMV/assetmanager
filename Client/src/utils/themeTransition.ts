import type { ThemeMode } from './theme'

let lastPointer = { x: 0, y: 0 }

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY }
    },
    true,
  )
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> }
}

const REVEAL_DURATION_MS = 450

/**
 * Swap the theme with a circular reveal expanding from the last pointer position
 * (View Transitions API). The theme attribute is set synchronously so the snapshot
 * is correct; `commit` keeps React state in sync. Falls back to an instant swap when
 * the API is unavailable or the user prefers reduced motion.
 */
export function applyThemeWithReveal(next: ThemeMode, commit: (theme: ThemeMode) => void): void {
  const doc = document as ViewTransitionDocument
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || reduceMotion) {
    document.documentElement.dataset.theme = next
    commit(next)
    return
  }

  const { x, y } = lastPointer
  const transition = doc.startViewTransition(() => {
    document.documentElement.dataset.theme = next
    commit(next)
  })

  void revealAfterReady(transition, x, y)
}

async function revealAfterReady(
  transition: { ready: Promise<void> },
  x: number,
  y: number,
): Promise<void> {
  await transition.ready
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: REVEAL_DURATION_MS,
      easing: 'ease-in-out',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}
