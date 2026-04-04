import { useEffect, useState, type RefObject } from 'react'
import AnimatedNavIcon from './AnimatedNavIcon'

const SHOW_AFTER = 240

type ScrollTopButtonProps = {
  scrollContainerRef?: RefObject<HTMLElement | null>
}

export default function ScrollTopButton({ scrollContainerRef }: ScrollTopButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current
    const onScroll = () => {
      const containerScrollTop = scrollContainer?.scrollTop ?? 0
      const scrollTop = Math.max(containerScrollTop, window.scrollY)
      setVisible(scrollTop > SHOW_AFTER)
    }

    onScroll()

    window.addEventListener('scroll', onScroll, { passive: true })
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    }

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', onScroll)
      }
    }
  }, [scrollContainerRef])

  if (!visible) return null

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <button
      type="button"
      onClick={() => {
        if (scrollContainerRef?.current?.scrollTop) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
        }

        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      }}
      className="fixed bottom-10 right-1 h-12 w-12 rounded-full text-accent hover:text-accent focus-visible:outline-none focus-visible:ring-0 z-30"
      aria-label="Back to top"
      title="Back to top"
    >
      <AnimatedNavIcon name="chevron-up" className="h-10 w-10" />
    </button>
  )
}
