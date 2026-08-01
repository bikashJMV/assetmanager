import { useEffect, useState, type RefObject } from 'react'
import AnimatedNavIcon from './AnimatedNavIcon'

type ScrollTopButtonProps = {
  scrollContainerRef?: RefObject<HTMLElement | null>
}

export default function ScrollTopButton({ scrollContainerRef }: ScrollTopButtonProps) {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current
    const onScroll = () => {
      const containerTop = scrollContainer?.scrollTop ?? 0
      const scrollTop = Math.max(containerTop, window.scrollY)
      const containerRange = scrollContainer ? scrollContainer.scrollHeight - scrollContainer.clientHeight : 0
      const windowRange = document.documentElement.scrollHeight - window.innerHeight
      const range = Math.max(containerRange, windowRange)
      setVisible(scrollTop > 240)
      setProgress(range > 0 ? Math.min(1, scrollTop / range) : 0)
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

  const scrollToTop = () => {
    if (scrollContainerRef?.current?.scrollTop) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <div
      className="fixed bottom-16 right-3 z-30 rounded-full p-[3px] shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
      style={{ background: `conic-gradient(hsl(var(--primary)) ${Math.round(progress * 360)}deg, hsl(var(--border-strong) / 0.5) 0deg)` }}
    >
      <button
        type="button"
        onClick={scrollToTop}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-primary backdrop-blur-sm transition-colors hover:bg-surface-hover focus-visible:outline-none"
        aria-label="Back to top"
        title="Back to top"
      >
        <AnimatedNavIcon name="chevron-up" className="h-6 w-6" />
      </button>
    </div>
  )
}
