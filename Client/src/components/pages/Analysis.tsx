import { useSearchParams } from 'react-router-dom'
import OverviewAnalysis from './Overview.Analysis'
import TelemetryAnalysis from './Telemetry.Analysis'

type AnalysisSection = 'overview' | 'telemetry'

const SECTION_COPY: Record<AnalysisSection, { title: string; description: string }> = {
  overview: {
    title: 'Overview Analysis',
    description: 'Operational asset and employee metrics for admins and IT Ops.',
  },
  telemetry: {
    title: 'Telemetry Analysis',
    description: 'Recent platform telemetry feeds for IT Ops investigation and diagnostics.',
  },
}

export default function Analysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection = searchParams.get('section') === 'telemetry' ? 'telemetry' : 'overview'
  const activeCopy = SECTION_COPY[activeSection]

  const switchSection = (section: AnalysisSection) => {
    const nextParams = new URLSearchParams(searchParams)
    if (section === 'overview') {
      nextParams.delete('section')
    } else {
      nextParams.set('section', section)
    }
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <main className="min-h-screen bg-app px-4 py-10 text-primary sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-2xl border border-base bg-surface-2 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Analysis</p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{activeCopy.title}</h1>
              <p className="max-w-2xl text-sm text-muted sm:text-base">{activeCopy.description}</p>
            </div>

            <div
              className="inline-flex w-full flex-wrap gap-2 rounded-xl border border-base bg-surface p-2 lg:w-auto"
              role="tablist"
              aria-label="Analysis sections"
            >
              <SectionButton
                active={activeSection === 'overview'}
                label="Overview"
                description="Asset and employee KPIs"
                onClick={() => switchSection('overview')}
              />
              <SectionButton
                active={activeSection === 'telemetry'}
                label="Telemetry"
                description="IT Ops event feed"
                onClick={() => switchSection('telemetry')}
              />
            </div>
          </div>
        </header>

        {activeSection === 'overview' ? <OverviewAnalysis /> : <TelemetryAnalysis />}
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
      className={`min-w-[11rem] rounded-lg px-4 py-3 text-left transition ${
        active
          ? 'bg-accent text-white shadow-sm'
          : 'bg-transparent text-primary hover:bg-surface-3'
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={`mt-1 block text-xs ${active ? 'text-white/80' : 'text-subtle'}`}>{description}</span>
    </button>
  )
}
