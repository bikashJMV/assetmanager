import { Link } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { getDashboardStats, getPublicDashboardSummary, subscribeDashboardRealtime, type PublicDashboardSummary } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import Footer from '../common/Footer'
import AnimatedNavIcon from '../common/AnimatedNavIcon'

const heroWords = [
  { text: 'Meet', orange: false },
  { text: 'Asset', orange: true },
  { text: 'Manager', orange: true },
] as const

type HomeIconName =
  | 'home'
  | 'guide'
  | 'boxes'
  | 'scan'
  | 'users'
  | 'chart-column'
  | 'log-in'
  | 'refresh-cw'
  | 'settings'

type FeatureChip = { label: string; icon: HomeIconName; filled?: boolean }
type StoryTone = 'light' | 'dark' | 'accent'

type DashboardStats = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  activeEmployees: number
  totalEmployees: number
}

type StoryCardProps = {
  tone: StoryTone
  eyebrow: string
  title: string
  description: string
  className?: string
  children?: ReactNode
}

type StoryNoteProps = {
  label: string
  className?: string
  tone?: 'neutral' | 'accent'
  children: ReactNode
}

const featureChips: FeatureChip[] = [
  { label: 'Google Sign-In', icon: 'log-in', filled: true },
  { label: 'Asset Listing', icon: 'boxes' },
  { label: 'QR Scan', icon: 'scan', filled: true },
  { label: 'Employee Tracking', icon: 'users' },
  { label: 'Category Breakdown', icon: 'chart-column' },
  { label: 'Realtime Sync', icon: 'refresh-cw', filled: true },
  { label: 'Guide Page', icon: 'guide' },
  { label: 'Theme Preferences', icon: 'settings' },
] as const

const operationalAlerts = [
  'Warranties expiring in 30 days',
  'Inactive employees still holding assets',
  'Assets without QR code assigned',
  'Missing asset ownership details',
  'Low available stock by category',
] as const

const roleFootprints = [
  { role: 'Employee', detail: 'My Digital Footprint' },
  { role: 'Admin', detail: 'Efficiency Hub' },
  { role: 'IT Ops', detail: 'Health-First Management' },
] as const

function StoryCard({ tone, eyebrow, title, description, className = '', children }: StoryCardProps) {
  const cardTone =
    tone === 'dark'
      ? 'border border-[#1B1B1B] bg-[#0A0A0A] text-white shadow-[0_24px_44px_rgba(10,10,10,0.2)]'
      : tone === 'accent'
        ? 'border border-[#DB480D] bg-[#F04E0F] text-white shadow-[0_24px_44px_rgba(240,78,15,0.22)]'
        : 'border border-[#E8E4DC] bg-white text-[#0A0A0A] shadow-[0_24px_44px_rgba(10,10,10,0.08)]'

  const eyebrowTone =
    tone === 'light'
      ? 'text-[#888]'
      : tone === 'accent'
        ? 'text-white/65'
        : 'text-white/40'

  const bodyTone = tone === 'light' ? 'text-[#666]' : tone === 'accent' ? 'text-white/82' : 'text-white/58'

  return (
    <article className={`rounded-[28px] p-6 sm:p-8 ${cardTone} ${className}`}>
      {children ? <div className="mb-6">{children}</div> : null}
      <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${eyebrowTone}`}>{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-normal leading-tight sm:text-4xl">{title}</h2>
      <p className={`mt-3 text-sm leading-6 ${bodyTone}`}>{description}</p>
    </article>
  )
}

function StoryNote({ label, className = '', tone = 'neutral', children }: StoryNoteProps) {
  const noteTone =
    tone === 'accent'
      ? {
        shell: 'border-[#F1B28F] bg-[linear-gradient(180deg,#FFF7F1_0%,#FFF2E8_100%)]',
        chip: 'bg-[#F04E0F] text-white',
        dot: 'bg-[#F7A16B]',
        body: 'text-[#2E2019]',
        edge: 'border-l-[#F04E0F]',
      }
      : {
        shell: 'border-[#D9D0C4] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(252,249,245,0.98)_100%)]',
        chip: 'bg-[#0A0A0A] text-white',
        dot: 'bg-[#F04E0F]',
        body: 'text-[#252525]',
        edge: 'border-l-[#0A0A0A]',
      }

  return (
    <aside
      className={`rounded-[24px] border border-l-[5px] px-4 py-4 text-left shadow-[0_24px_40px_rgba(10,10,10,0.12)] ring-1 ring-white/70 backdrop-blur-sm sm:px-5 sm:py-5 ${noteTone.shell} ${noteTone.edge} ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${noteTone.chip}`}>
          {label}
        </span>
        <span className={`h-2.5 w-2.5 rounded-full ${noteTone.dot}`} />
      </div>
      <div className={`mt-3 text-[13px] font-medium leading-6 sm:text-[15px] sm:leading-7 ${noteTone.body}`}>{children}</div>
    </aside>
  )
}

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

  const overviewMetrics = [
    { label: 'Assets', icon: 'boxes' as const, accent: true, status: isAuthenticated ? 'Protected live snapshot' : 'Protected preview' },
    { label: 'Assigned Assets', icon: 'refresh-cw' as const, status: 'Lifecycle monitored' },
    { label: 'In Stock Assets', icon: 'home' as const, status: 'Stock health tracked' },
    { label: 'Active Employees', icon: 'users' as const, status: isAuthenticated ? 'Workspace synced' : 'Visible after sign-in' },
  ]

  const overviewCard = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {overviewMetrics.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border p-4 text-center ${item.accent ? 'border-[#0A0A0A] bg-[#0A0A0A]' : 'border-[#F0ECE5] bg-[#FAFAF8]'}`}
          >
            <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center ${item.accent ? 'text-white' : 'text-[#222]'}`}>
              <AnimatedNavIcon name={item.icon} />
            </div>
            <div className="flex justify-center">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${item.accent ? 'bg-white/14 text-white' : 'bg-[#ECE7DE] text-[#333]'
                  }`}
              >
                {item.status}
              </span>
            </div>
            <p className={`mt-1 text-xs font-semibold ${item.accent ? 'text-white/70' : 'text-[#777]'}`}>{item.label}</p>
          </div>
        ))}
      </div>

      {!isAuthenticated && publicSummary?.categoryBreakdown?.length ? (
        <div
          className="rounded-2xl border border-[#E8E4DC] bg-[#FAFAF8] px-4 py-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#888]">Top Categories</p>
            <span className="text-[11px] font-semibold text-[#666]">Protected mix</span>
          </div>
          <div className="space-y-2">
            {publicSummary.categoryBreakdown.slice(0, 3).map((item) => (
              <div key={item.category}>
                <div className="mb-1 flex items-center justify-between text-xs text-[#666]">
                  <span>{item.category}</span>
                  <span className="rounded-full bg-[#EEE7DD] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6F685F]">
                    tracked
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#EEE7DD]">
                  <div
                    className="h-2 rounded-full bg-[#F04E0F]"
                    style={{
                      width: `${38 + ((item.category.length * 7) % 37)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs leading-6 text-[#666]">
        {isAuthenticated
          ? 'Realtime dashboard signals refresh as assignments and inventory records change.'
          : 'Sign in to unlock protected operational insights, deeper category analysis, and asset detail views.'}
      </p>
    </div>
  )

  const lifecycleCard = (
    <div className="space-y-2">
      <div className="w-fit rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Asset Intake</div>
      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Assign</div>
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Track</div>
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Return</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">QR Scan</div>
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Lifecycle</div>
        <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Audit</div>
      </div>
      <div className="w-full max-w-md rounded-xl bg-[#F04E0F] px-5 py-2 text-center text-sm font-bold">Full Ownership History</div>
    </div>
  )

  const featureCard = (
    <>
      <div className="mb-5 flex justify-end gap-2">
        <div className="h-2 w-2 rounded-full border border-white/60" />
        <div className="h-2 w-2 rounded-full border border-white/60" />
        <div className="h-2 w-2 rounded-full border border-white/60" />
      </div>
      <div className="flex flex-wrap gap-2">
        {featureChips.map((chip) => (
          <div
            key={chip.label}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${chip.filled ? 'border-[#0A0A0A] bg-[#0A0A0A]' : 'border-white/40 bg-black/10'}`}
          >
            <AnimatedNavIcon name={chip.icon} />
            {chip.label}
          </div>
        ))}
      </div>
    </>
  )

  const alertsCard = (
    <div className="space-y-2">
      {operationalAlerts.map((msg, idx) => (
        <div key={msg} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className={`h-2 w-2 rounded-full ${idx < 3 ? 'bg-[#F04E0F]' : 'bg-white/30'}`} />
          <span className="text-xs text-white/70">{msg}</span>
        </div>
      ))}
    </div>
  )

  const roleAccessCard = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-2 rounded-lg bg-[#0A0A0A] px-4 py-2 text-xs font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F04E0F]" />
          Admin
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg bg-[#F04E0F] px-4 py-2 text-xs font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
          IT Ops
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[#E0DDD6] bg-[#F0ECE5] px-4 py-2 text-xs font-semibold text-[#0A0A0A]">
          <span className="h-1.5 w-1.5 rounded-full bg-black/40" />
          Employee
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {roleFootprints.map((item) => (
          <div key={item.role} className="rounded-xl border border-[#E8E4DC] bg-[#FAFAF8] px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#888]">{item.role}</p>
            <p className="mt-2 text-sm leading-6 text-[#333]">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <main className="min-h-screen  text-[#0A0A0A] mb-40">
        <header className="mx-auto flex w-full max-w-[1320px] flex-col items-center px-4 pb-8 pt-12 text-center sm:px-6 lg:px-7">
          <div className="mb-5 self-end rounded-full border border-[#f04e0f33] bg-[#f04e0f14] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#F04E0F]">
            Internal Platform
          </div>
          <div className="mb-2">
            <h1 className="text-5xl font-normal leading-none tracking-[-0.02em] sm:text-6xl md:text-7xl lg:text-8xl">
              {heroWords.map((word, wi) => (
                <span key={`${word.text}-${wi}`} className="inline-block whitespace-nowrap">
                  {word.text.split('').map((ch, ci) => (
                    <span
                      key={`${word.text}-${ci}`}
                      className={`${word.orange ? 'text-[#F04E0F]' : ''} inline-block`}
                    >
                      {ch}
                    </span>
                  ))}
                  {wi < heroWords.length - 1 ? <span>&nbsp;</span> : null}
                </span>
              ))}
            </h1>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#666] sm:text-lg">
            Asset Manager helps teams track inventory, monitor stock health, manage employee assignments, and act early on asset risks such as warranty expiry, missing ownership, and low stock availability.
          </p>
          {isAuthenticated ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/assets"
                className="rounded-full bg-[#0A0A0A] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1A1A1A]"
              >
                View Assets
              </Link>
              <Link
                to="/employee"
                className="rounded-full border border-[#D9D4CB] bg-white px-6 py-3 text-sm font-semibold text-[#0A0A0A] transition hover:bg-[#F8F3EC]"
              >
                View Employees
              </Link>
            </div>
          ) : null}
        </header>

        {error ? <p className="pb-3 text-center text-sm text-[#F04E0F]">{error}</p> : null}

        <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 sm:px-6 lg:px-7">
          <section className="hidden xl:block">
            <div className="relative min-h-[1280px]">
              <div className="pointer-events-none absolute inset-0 z-0">
                <svg viewBox="0 0 1200 1280" preserveAspectRatio="none" className="h-full w-full">
                  <defs>
                    <marker
                      id="storyArrow"
                      markerWidth="14"
                      markerHeight="14"
                      refX="11.4"
                      refY="7"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M0 0L0 14L14 7Z" fill="rgba(20,20,20,0.78)" />
                    </marker>
                  </defs>

                  <path
                    d="M 458 194
                       C 578 184, 670 216, 760 322"
                    fill="none"
                    stroke="rgba(20,20,20,0.72)"
                    strokeWidth="2.6"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />
                  <path
                    d="M 780 464
                       C 692 500, 592 546, 478 612
                       S 264 688, 238 724"
                    fill="none"
                    stroke="rgba(20,20,20,0.72)"
                    strokeWidth="2.6"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />
                  <path
                    d="M 560 792
                       C 666 798, 782 820, 902 868
                       S 968 924, 878 970"
                    fill="none"
                    stroke="rgba(20,20,20,0.72)"
                    strokeWidth="2.6"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />
                  <path
                    d="M 340 640
                       C 270 576, 220 510, 210 446"
                    fill="none"
                    stroke="rgba(20,20,20,0.62)"
                    strokeWidth="2.25"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />
                  <path
                    d="M 860 862
                       C 964 790, 1016 742, 1030 700"
                    fill="none"
                    stroke="rgba(20,20,20,0.62)"
                    strokeWidth="2.25"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />
                  <path
                    d="M 708 1004
                       C 576 1018, 484 1042, 404 1098"
                    fill="none"
                    stroke="rgba(20,20,20,0.72)"
                    strokeWidth="2"
                    strokeDasharray="3 12"
                    strokeLinecap="round"
                    markerEnd="url(#storyArrow)"
                  />

                  <circle cx="458" cy="194" r="5.5" fill="#F04E0F" />
                  <circle cx="760" cy="322" r="5.5" fill="#F04E0F" />
                  <circle cx="238" cy="724" r="5.5" fill="#F04E0F" />
                  <circle cx="878" cy="970" r="5.5" fill="#F04E0F" />
                  <circle cx="404" cy="1098" r="5.5" fill="#F04E0F" />
                  <circle cx="210" cy="446" r="5" fill="#F7A16B" />
                  <circle cx="1030" cy="700" r="5" fill="#F7A16B" />
                </svg>
              </div>

              <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border border-[#E2DED6] bg-white/85 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5B5B5B]">
                Dashboard Story Map
              </div>

              <div className="absolute left-[2.5%] top-[4%] z-20 w-[36%] max-w-[460px]">
                <StoryCard
                  tone="light"
                  eyebrow="Overview KPIs"
                  title="Know What Exists"
                  description="Live dashboard summaries turn scattered inventory into one view of assets, stock, and active employees."
                >
                  {overviewCard}
                </StoryCard>
              </div>

              <div className="absolute right-[7%] top-[17%] z-20 w-[34%] max-w-[430px]">
                <StoryCard
                  tone="dark"
                  eyebrow="Controlled Lifecycle"
                  title="Assign and Return"
                  description="Controlled assign and return flows keep handoffs auditable, traceable, and visible without manual checking."
                >
                  {lifecycleCard}
                </StoryCard>
              </div>

              {/* <StoryNote label="QR advantage" tone="accent" className="absolute left-[4.75%] top-[31.75%] z-30 w-[320px]">
                QR scanning keeps the lifecycle trail precise, reduces manual reconciliation, and makes handoffs easier to trust.
              </StoryNote> */}

              <div className="absolute left-[7%] top-[49%] z-20 w-[38%] max-w-[500px]">
                <StoryCard
                  tone="accent"
                  eyebrow="Current Features"
                  title="Ship Anything"
                  description="From secure Google Workspace sign-in to QR-based lookup, every feature is built to replace spreadsheets with one reliable system."
                >
                  {featureCard}
                </StoryCard>
              </div>

              {/* <StoryNote label="Why now" className="absolute right-[4%] top-[54.75%] z-30 w-[320px]">
                India&apos;s e-waste grew 72.5% in 5 years because devices are often discarded too early instead of being tracked and reused.
              </StoryNote> */}

              <div className="absolute right-[4%] top-[73%] z-20 w-[40%] max-w-[520px]">
                <StoryCard
                  tone="dark"
                  eyebrow="Operational Alerts"
                  title="Act Before It Breaks"
                  description="Catch warranty expiry, missing ownership, overdue returns, and low stock before they become operational problems."
                >
                  {alertsCard}
                </StoryCard>
              </div>

              <div className="absolute left-[3%] top-[82%] z-20 w-[42%] max-w-[520px]">
                <StoryCard
                  tone="light"
                  eyebrow="Role-Based Access"
                  title="Right Access, Right People"
                  description="Admins, IT Ops, and Employees each see only what they need. Secure sign-in keeps records protected and identity verified at every step."
                >
                  {roleAccessCard}
                </StoryCard>
              </div>
            </div>
          </section>

          <section className="space-y-4 xl:hidden">
            <StoryCard
              tone="light"
              eyebrow="Overview KPIs"
              title="Know What Exists"
              description="Live dashboard summaries turn scattered inventory into one view of assets, stock, and active employees."
            >
              {overviewCard}
            </StoryCard>

            <StoryCard
              tone="dark"
              eyebrow="Controlled Lifecycle"
              title="Assign and Return"
              description="Controlled assign and return flows keep handoffs auditable, traceable, and visible without manual checking."
            >
              {lifecycleCard}
            </StoryCard>

            <StoryNote label="QR advantage" tone="accent">
              QR scanning keeps the lifecycle trail precise, reduces manual reconciliation, and makes handoffs easier to trust.
            </StoryNote>

            <StoryCard
              tone="accent"
              eyebrow="Current Features"
              title="Ship Anything"
              description="From secure Google Workspace sign-in to QR-based lookup, every feature is built to replace spreadsheets with one reliable system."
            >
              {featureCard}
            </StoryCard>

            <StoryNote label="Why now">
              India&apos;s e-waste grew 72.5% in 5 years because devices are often discarded too early instead of being tracked and reused.
            </StoryNote>

            <StoryCard
              tone="dark"
              eyebrow="Operational Alerts"
              title="Act Before It Breaks"
              description="Catch warranty expiry, missing ownership, overdue returns, and low stock before they become operational problems."
            >
              {alertsCard}
            </StoryCard>

            <StoryCard
              tone="light"
              eyebrow="Role-Based Access"
              title="Right Access, Right People"
              description="Admins, IT Ops, and Employees each see only what they need. Secure sign-in keeps records protected and identity verified at every step."
            >
              {roleAccessCard}
            </StoryCard>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
