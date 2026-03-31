type LoaderProps = {
  /**
   * Use inside an existing layout (e.g. a page that already has `<main>`).
   * Centers content in the available vertical space without wrapping in `<main>`.
   */
  embedded?: boolean
}

export default function Loader({ embedded = false }: LoaderProps) {
  const label = (
    <p className="text-subtle text-sm sm:text-base" aria-hidden>
      Loading...
    </p>
  )

  if (embedded) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading"
        className="flex w-full min-h-[min(28rem,calc(100dvh-12rem))] items-center justify-center py-12"
      >
        {label}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary flex items-center justify-center">
      {label}
    </main>
  )
}
