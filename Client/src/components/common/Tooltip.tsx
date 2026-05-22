import { useState, type ReactNode } from 'react'

type Props = {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

export default function Tooltip({ content, children, position = 'top' }: Props) {
  const [visible, setVisible] = useState(false)

  const posClass =
    position === 'bottom'
      ? 'top-[calc(100%+6px)]'
      : 'bottom-[calc(100%+6px)]'

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content ? (
        <div
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 ${posClass} whitespace-nowrap rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white dark:bg-neutral-700`}
          style={{ animation: 'tooltip-in 0.1s ease forwards' }}
        >
          {content}
        </div>
      ) : null}
    </div>
  )
}
