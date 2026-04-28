import { useEffect, useState } from 'react'
import { hasActiveAdminAccess, hasActiveItOpsAccess } from '../../api'
import OverviewAnalysis from './Overview.Analysis'
import LogViewer from './LogViewer'

type AnalysisSection = 'overview' | 'logs'

export default function Analysis() {
  const [canViewOverview, setCanViewOverview] = useState(false)
  const [canViewLogs, setCanViewLogs] = useState(false)
  const [activeSection, setActiveSection] = useState<AnalysisSection>('overview')

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [overview, logs] = await Promise.all([
        hasActiveAdminAccess(),
        hasActiveItOpsAccess(),
      ])
      if (!mounted) return
      setCanViewOverview(overview)
      setCanViewLogs(logs)
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-app px-3 text-primary sm:px-4 sm:py-2 lg:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-2 sm:space-y-6">
        <header className="rounded-2xl border border-base bg-surface-2 px-2 pb-2 sm:p-6">
          <div className=" flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {activeSection === 'overview' ? 'Overview Analysis' : 'Live Telemetry Logs'}
              </h1>
              <p className="max-w-2xl text-sm text-muted sm:text-base">
                {activeSection === 'overview'
                  ? 'Operational asset and employee metrics.'
                  : 'Real-time application logs from Loki.'}
              </p>
            </div>

            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:justify-end">
              {canViewLogs && (
                <div
                  className="inline-flex w-fit flex-wrap gap-2 rounded-xl border border-base bg-surface sm:w-auto"
                  role="tablist"
                >
                  <SectionButton
                    active={activeSection === 'overview'}
                    label="Overview"
                    description="Asset metrics"
                    onClick={() => setActiveSection('overview')}
                  />
                  <SectionButton
                    active={activeSection === 'logs'}
                    label="Logs"
                    description="Live stream"
                    onClick={() => setActiveSection('logs')}
                  />
                </div>
              )}

              {canViewLogs && (
                <div className="flex items-center">
                  <a
                    href={import.meta.env.VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover sm:w-auto"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <path d="M18 17V9" />
                      <path d="M13 17V5" />
                      <path d="M8 17v-3" />
                    </svg>
                    Grafana Dashboard
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 opacity-70">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={{ display: activeSection === 'overview' ? 'block' : 'none' }}>
          {canViewOverview && <OverviewAnalysis />}
        </div>
        <div style={{ display: activeSection === 'logs' ? 'block' : 'none' }}>
          {canViewLogs && <LogViewer />}
        </div>
      </div>
    </main>
  )
}

function SectionButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-w-[7rem] rounded-lg px-4 py-2 text-left transition sm:min-w-[8rem] ${
        active
          ? 'bg-accent text-white shadow-sm'
          : 'bg-transparent text-primary hover:bg-surface-3'
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={`mt-0.5 block text-xs ${active ? 'text-white/80' : 'text-subtle'}`}>{description}</span>
    </button>
  )
}

