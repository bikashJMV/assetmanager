import { useEffect, useState } from 'react'
import AnimatedNavIcon from './AnimatedNavIcon'

const SHOW_AFTER = 500

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <button
      type="button"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      }}
      className="fixed bottom-10 right-1 h-12 w-12 rounded-full text-accent hover:text-accent focus-visible:outline-none focus-visible:ring-0 z-30"
      aria-label="Back to top"
      title="Back to top"
    >
      <AnimatedNavIcon name="chevron-up" className="h-7 w-7" />
    </button>
  )
}
