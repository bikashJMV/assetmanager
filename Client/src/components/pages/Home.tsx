import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getDashboardStats, getPublicDashboardSummary, subscribeDashboardRealtime, type PublicDashboardSummary } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import Footer from '../common/Footer'

type DashboardStats = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  activeEmployees: number
  totalEmployees: number
}

const steps = [
  { num: '01', title: 'Inventory', desc: 'Track assets using inventory statuses like assigned, in_stock, and retired.' },
  { num: '02', title: 'ERP Profiles', desc: 'Manage employee ERP/HR active/inactive state separately from asset inventory.' },
  { num: '03', title: 'Assign/Return RPC', desc: 'Assignment changes only through fn_assign_asset and fn_return_asset.' },
]

export default function Home({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [publicSummary, setPublicSummary] = useState<PublicDashboardSummary | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const rows = await getDashboardStats()
      setStats(rows)
      setError('')
    } catch (err) {
      logDevError('home.stats', err)
      setError(getUserFacingMessage(err, 'Unable to load dashboard right now.'))
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      setPublicSummary(null)
      void load()
      const unsubscribe = subscribeDashboardRealtime(() => {
        void load()
      })

      return () => {
        unsubscribe()
      }
    }

    let mounted = true
    setStats(null)
    void (async () => {
      try {
        const summary = await getPublicDashboardSummary()
        if (!mounted) return
        setPublicSummary(summary)
        setError('')
      } catch (err) {
        if (!mounted) return
        logDevError('home.publicSummary', err)
        setError(getUserFacingMessage(err, 'Unable to load public summary right now.'))
      }
    })()

    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  return (
    <>
      <main className="min-h-screen bg-app text-primary">
        <section className="px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight">
            Asset  <span className="text-accent">Manager</span>
          </h1>
          <p className="mt-4 text-muted text-base sm:text-lg max-w-2xl mx-auto">
            Live inventory with Supabase Auth, RLS, realtime updates, and RPC-driven assignment lifecycle.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link
              to={isAuthenticated ? '/assets' : '/login'}
              className="bg-accent text-on-accent font-semibold px-6 py-3 rounded-lg hover:bg-accent-hover transition shadow-accent"
            >
              {isAuthenticated ? 'View Assets' : 'Sign in'}
            </Link>
            {isAuthenticated ? (
              <Link
                to="/employee"
                className="border border-base bg-surface text-primary font-semibold px-6 py-3 rounded-lg hover:bg-surface-3 transition"
              >
                View Employees
              </Link>
            ) : null}
          </div>
        </section>

        {error && <p className="text-accent text-sm text-center pb-3">{error}</p>}
        {!isAuthenticated && (
          <p className="text-subtle text-sm text-center pb-3">Sign in to see live counts.</p>
        )}

        <section className="px-4 sm:px-6 py-10 sm:py-12 bg-surface-2 border-y border-base">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6">
            <StatCard label="Total Assets" value={stats?.totalAssets ?? publicSummary?.totalAssets ?? 0} />
            <StatCard label="Assigned" value={stats?.assignedAssets ?? publicSummary?.assignedAssets ?? 0} />
            <StatCard label="In Stock" value={stats?.inStockAssets ?? publicSummary?.inStockAssets ?? 0} />
            <StatCard label="ERP Active" value={stats?.activeEmployees ?? 0} />
            <StatCard label="Employees" value={stats?.totalEmployees ?? 0} />
          </div>
        </section>

        {!isAuthenticated && (
          <section className="px-4 sm:px-6 py-10 sm:py-12">
            <h2 className="text-2xl font-bold text-center mb-8">Category Breakdown</h2>
            {publicSummary?.categoryBreakdown?.length ? (
              <div className="max-w-3xl mx-auto space-y-3">
                {publicSummary.categoryBreakdown.map((item) => {
                  const width = publicSummary.totalAssets > 0
                    ? Math.max(4, Math.round((item.count / publicSummary.totalAssets) * 100))
                    : 0
                  const widthBucket = Math.min(100, Math.ceil(width / 10) * 10)
                  return (
                    <div key={item.category} className="rounded-xl border border-base bg-surface-2 p-3">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-primary">{item.category}</span>
                        <span className="text-subtle">{item.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface">
                        <div className={`h-2 rounded-full bg-accent category-bar category-bar--${widthBucket}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-subtle text-sm text-center">No category summary available right now.</p>
            )}
          </section>
        )}

        <section className="px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.num} className="bg-surface-2 border border-base rounded-xl p-6">
                <p className="text-accent text-4xl font-bold">{s.num}</p>
                <h3 className="mt-3 font-semibold text-lg">{s.title}</h3>
                <p className="mt-2 text-subtle text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center bg-surface border border-base rounded-xl p-4">
      <p className="text-2xl sm:text-3xl font-bold text-accent">{value}</p>
      <p className="mt-1 text-subtle text-xs sm:text-sm">{label}</p>
    </div>
  )
}
