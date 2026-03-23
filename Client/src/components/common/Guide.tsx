const steps = [
  {
    title: 'Add a new asset',
    detail: 'Go to Assets and create inventory records with category, manufacturer, location, custom fields, and inventory status.',
  },
  {
    title: 'Track inventory vs ERP separately',
    detail: 'Asset inventory status (assigned, in_stock, retired, etc.) is separate from employee ERP/HR active or inactive status.',
  },
  {
    title: 'Assign and return with RPC',
    detail: 'All assignment changes happen through backend RPCs (`fn_assign_asset` and `fn_return_asset`) to keep status logic centralized.',
  },
  {
    title: 'Use filters and QR',
    detail: 'Use Inventory and Employee filters to find records quickly, and use QR view/scan for fast asset lookup.',
  },
]

export default function Guide() {
  return (
    <main className="min-h-screen bg-app text-primary py-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-subtle">Guide</p>
          <h1 className="text-3xl font-bold tracking-tight">
            How to use <span className="text-accent">AMS</span>
          </h1>
          <p className="text-muted">
            A quick walkthrough for V2 inventory workflows, ERP-aware employee management, and RPC-driven assignment tracking.
          </p>
        </header>

        <section className="grid gap-4">
          {steps.map((s, i) => (
            <article
              key={s.title}
              className="bg-surface-2 border border-base rounded-xl p-5 flex gap-4 items-start"
            >
              <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-accent text-on-accent font-black">
                {(i + 1).toString().padStart(2, '0')}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="text-muted text-sm mt-1">{s.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="bg-surface-2 border border-base rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-semibold">Tips</h2>
          <ul className="list-disc list-inside text-muted text-sm space-y-1">
            <li>Use Assets filters for inventory status/category and Employees filters for ERP status/department/role.</li>
            <li>If a holder is ERP-inactive, treat it as an audit signal; asset inventory status still follows assignment state.</li>
            <li>Keep warranty, purchase date, and component details updated for lifecycle planning.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
