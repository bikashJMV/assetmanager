const analysisCards = [
  {
    title: 'Utilization',
    detail: 'Track assigned vs in-stock devices by department, category, and status.',
  },
  {
    title: 'Lifecycle',
    detail: 'Surface assets approaching retirement, repair loops, or prolonged inactivity.',
  },
  {
    title: 'Ownership',
    detail: 'Spot unassigned hardware, duplicate holders, and risky gaps in handoff history.',
  },
]

export default function Analysis() {
  return (
    <main className="min-h-screen bg-app text-primary px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="rounded-2xl border border-base bg-surface-2 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Analysis</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Workspace analytics is being prepared
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">
            This page will become the reporting view for inventory health, assignment trends,
            and operational insights. The sidebar link is ready so we can grow into it without
            changing the navigation again.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {analysisCards.map((card) => (
            <article key={card.title} className="rounded-xl border border-base bg-surface p-5">
              <p className="text-sm font-semibold text-primary">{card.title}</p>
              <p className="mt-2 text-sm text-muted">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-base bg-surface-2 p-5">
          <p className="text-sm font-semibold text-primary">Next implementation step</p>
          <p className="mt-2 text-sm text-muted">
            Connect dashboard queries and chart cards here once the metrics contract is finalized.
          </p>
        </section>
      </div>
    </main>
  )
}
