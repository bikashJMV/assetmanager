const recycleCards = [
  {
    title: 'Soft-deleted records',
    detail: 'Hold removed assets and employees here until an admin decides to restore or purge.',
  },
  {
    title: 'Recovery window',
    detail: 'Show when an item was removed, by whom, and how long it remains restorable.',
  },
  {
    title: 'Audit alignment',
    detail: 'Pair deleted records with activity logs so disposal decisions stay traceable.',
  },
]

export default function RecycleBin() {
  return (
    <main className="min-h-screen bg-app text-primary px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="rounded-2xl border border-base bg-surface-2 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Recycle Bin</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Deleted records will land here
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">
            This placeholder reserves space for recovery workflows. Once soft-delete support is
            added in the API and database, this page can list pending restores and permanent
            cleanup actions without changing the sidebar structure.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {recycleCards.map((card) => (
            <article key={card.title} className="rounded-xl border border-base bg-surface p-5">
              <p className="text-sm font-semibold text-primary">{card.title}</p>
              <p className="mt-2 text-sm text-muted">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-base bg-surface-2 p-5">
          <p className="text-sm font-semibold text-primary">Recommended follow-up</p>
          <p className="mt-2 text-sm text-muted">
            Add soft-delete flags, restore endpoints, and retention rules before wiring real
            records into this page.
          </p>
        </section>
      </div>
    </main>
  )
}
