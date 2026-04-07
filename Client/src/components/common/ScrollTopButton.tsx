
import { useEffect, useState, type RefObject } from 'react'
import AnimatedNavIcon from './AnimatedNavIcon'


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
      setVisible(scrollTop > 240)
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

  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <button
      type="button"
      onClick={() => {
        if (scrollContainerRef?.current?.scrollTop) {
          scrollContainerRef.current.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
          })
        }

        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }}
      className="
        fixed bottom-16 right-3 z-30
        flex items-center justify-center
        h-12 w-12 rounded-full
        bg-orange-500 text-white
        shadow-lg backdrop-blur-sm
        transition-all duration-200
        hover:bg-orange-600 hover:scale-110
        active:scale-95
        focus-visible:outline-none
      "
      aria-label="Back to top"
      title="Back to top"
    >
      <AnimatedNavIcon name="chevron-up" className="h-6 w-6" />
    </button>
  )
}

