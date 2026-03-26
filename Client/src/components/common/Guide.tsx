const quickStart = [
  { step: '01', title: 'Open Home', detail: 'See a quick overview of the system.' },
  { step: '02', title: 'Sign in', detail: 'Sign in to view or manage records.' },
  { step: '03', title: 'Use Assets or Employees', detail: 'Find and update records using clear screens and filters.' },
  { step: '04', title: 'Scan QR', detail: 'Scan a QR code for quick asset lookup.' },
]

const quickTips = [
  'Use search and filters first to find records quickly.',
  'If something needs correction, create a ticket request from your workflow.',
  'Keep location and status updated so everyone sees the latest information.',
]

export default function Guide() {
  return (
    <main className="min-h-screen bg-app text-primary py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="bg-surface-2 border border-base rounded-2xl p-6 sm:p-8 space-y-3">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Guide</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Asset Manager made <span className="text-accent">simple</span>
          </h1>
          <p className="text-muted text-sm sm:text-base">
            Manage company assets with easy tracking, scanning, and employee assignment.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What this system does</h2>
          <div className="bg-surface-2 border border-base rounded-xl p-5">
            <p className="text-muted text-sm sm:text-base">
              This system helps your team track assets, see who is holding them, and keep records organized in one place.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How to use it</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickStart.map((item) => (
              <article key={item.step} className="bg-surface-2 border border-base rounded-xl p-5 flex gap-4 items-start">
                <div className="h-10 w-10 rounded-lg bg-accent text-on-accent font-black flex items-center justify-center shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted text-sm mt-1">{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Employee vs Admin</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <article className="bg-surface-2 border border-base rounded-xl p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-subtle">Employee</p>
              <h3 className="text-lg font-semibold mt-1">View and follow</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>View assigned assets.</li>
                <li>Use scan for quick lookup.</li>
                <li>View employee information in read-only mode.</li>
                <li>Create a ticket request when an update is needed.</li>
              </ul>
            </article>

            <article className="bg-surface-2 border border-base rounded-xl p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-subtle">Admin</p>
              <h3 className="text-lg font-semibold mt-1">Manage and update</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Add and edit assets.</li>
                <li>Add and edit employees.</li>
                <li>Manage assignment and return actions.</li>
                <li>Create ticket requests and action them.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Public access</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <article className="bg-surface-2 border border-base rounded-xl p-4">
              <p className="text-sm font-semibold">Home</p>
              <p className="text-xs text-muted mt-1">Anyone can open the system overview page.</p>
            </article>
            <article className="bg-surface-2 border border-base rounded-xl p-4">
              <p className="text-sm font-semibold">Guide</p>
              <p className="text-xs text-muted mt-1">Anyone can read these steps without sign-in.</p>
            </article>
            <article className="bg-surface-2 border border-base rounded-xl p-4">
              <p className="text-sm font-semibold">QR Scan page</p>
              <p className="text-xs text-muted mt-1">Anyone with the link or QR can view basic asset details.</p>
            </article>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Quick tips</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickTips.map((tip) => (
              <article key={tip} className="bg-surface-2 border border-base rounded-xl p-4">
                <p className="text-sm text-muted">{tip}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-surface-2 border border-base rounded-xl p-5">
          <h2 className="text-lg font-semibold">Ticket requests</h2>
          <p className="text-sm text-muted mt-2">
            Both employees and admins can create a ticket request if they need an update, correction, or support action.
          </p>
          <p className="text-sm text-muted mt-1">
            Use tickets when details are missing, assignments look incorrect, or a new action is required.
          </p>
        </section>
      </div>
    </main>
  )
}
