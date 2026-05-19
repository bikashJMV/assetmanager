import LogViewer from './LogViewer'

export default function LogsPage() {
  return (
    <main className="min-h-screen bg-app px-3 text-primary sm:px-4 sm:py-2 lg:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-2 sm:space-y-6">
        <header className="rounded-2xl border border-base bg-surface-2 px-2 pb-2 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Live Telemetry Logs
              </h1>
              <p className="max-w-2xl text-sm text-muted sm:text-base">
                Real-time application logs from Loki.
              </p>
            </div>
            <div className="flex items-center">
              <a
                href={import.meta.env.VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover sm:w-auto"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 3v18h18" />
                  <path d="M18 17V9" />
                  <path d="M13 17V5" />
                  <path d="M8 17v-3" />
                </svg>
                Grafana Dashboard
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-1 opacity-70"
                  aria-hidden="true"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        </header>

        <LogViewer />
      </div>
    </main>
  )
}
