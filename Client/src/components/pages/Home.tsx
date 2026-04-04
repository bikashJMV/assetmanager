import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getPublicDashboardSummary, type PublicDashboardSummary } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import Footer from '../common/Footer'
import ActBeforeItBreaksBox from '../home/ActBeforeItBreaksBox'
import AssignReturnBox from '../home/AssignReturnBox'
import HomeHero from '../home/HomeHero'
import OverviewKpisBox from '../home/OverviewKpisBox'
import QuickFactsRow from '../home/QuickFactsRow'
import RightAccessBox from '../home/RightAccessBox'
import ShipAnythingBox from '../home/ShipAnythingBox'
import ParticleIntroLoader from '../common/ParticleIntroLoader'

export default function Home({
  isAuthenticated = false,
  userId = null,
  wantPostSignInIntro = false,
  onPostSignInIntroConsumed,
}: {
  isAuthenticated?: boolean
  userId?: string | null
  /** Set from App on Supabase `SIGNED_IN` (OAuth lands on `/`, not `/login`). */
  wantPostSignInIntro?: boolean
  onPostSignInIntroConsumed?: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const postSignInIntroFromNavigate =
    typeof location.state === 'object' &&
    location.state !== null &&
    'showPostSignInIntro' in location.state &&
    Boolean((location.state as { showPostSignInIntro?: boolean }).showPostSignInIntro)
  const postSignInIntro = postSignInIntroFromNavigate || wantPostSignInIntro

  const [publicSummary, setPublicSummary] = useState<PublicDashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [showIntro, setShowIntro] = useState(false)
  const [showDashboard, setShowDashboard] = useState(true)

  const quickFacts = {
    overview: 'One dashboard view helps teams understand stock posture without exposing sensitive inventory counts.',
    lifecycle: 'Structured handoffs preserve ownership history, reduce confusion, and make returns easier to verify.',
    features: 'QR-led workflows replace spreadsheet follow-ups with faster, more reliable operational actions.',
    alerts: 'Early warnings help extend asset life and reduce avoidable repair or replacement cost.',
    access: 'Role-based visibility protects sensitive records while still keeping the right people informed.',
  } as const

  useEffect(() => {
    if (isAuthenticated) {
      setPublicSummary(null)
      setError('')
      return
    }

    let mounted = true
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

  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setShowIntro(false)
      setShowDashboard(true)
      return
    }
    /** Wait for user id before showing intro; avoids flashing dashboard. */
    if (!userId) {
      setShowIntro(false)
      setShowDashboard(false)
      return
    }

    /** Every successful sign-in: `/login` redirects with `state.showPostSignInIntro` (see App.tsx). */
    if (postSignInIntro) {
      setShowIntro(true)
      setShowDashboard(false)
      return
    }

    setShowIntro(false)
    setShowDashboard(true)
  }, [isAuthenticated, userId, postSignInIntro])

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false)
    setShowDashboard(true)
    onPostSignInIntroConsumed?.()
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
  }, [navigate, location.pathname, location.search, onPostSignInIntroConsumed])

  return (
    <>
      {showIntro ? <ParticleIntroLoader onComplete={handleIntroComplete} /> : null}

      {showDashboard ? (
        <>
          <main className="min-h-screen  text-[#0A0A0A] mb-10">
            <HomeHero isAuthenticated={isAuthenticated} />

            {error ? <p className="pb-3 text-center text-sm text-[#F04E0F]">{error}</p> : null}

            <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-7">
              <section className="hidden xl:block">
                <div className="mx-auto max-w-[1180px] space-y-6">
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 gap-6 items-center">
                      <OverviewKpisBox isAuthenticated={isAuthenticated} publicSummary={publicSummary} />
                    </div>

                    <div className="grid grid-cols-1 gap-6 items-center">
                      <AssignReturnBox />
                    </div>

                    <div className="grid grid-cols-1 gap-6 items-center">
                      <ShipAnythingBox />
                    </div>

                    <div className="grid grid-cols-1 gap-6 items-center">
                      <ActBeforeItBreaksBox />
                    </div>

                    <div className="grid grid-cols-1 gap-6 items-center">
                      <RightAccessBox />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 xl:hidden">
                <OverviewKpisBox isAuthenticated={isAuthenticated} publicSummary={publicSummary} />
                <AssignReturnBox />
                <ShipAnythingBox />
                <ActBeforeItBreaksBox />
                <RightAccessBox />
              </section>

              <QuickFactsRow
                facts={[
                  quickFacts.overview,
                  quickFacts.lifecycle,
                  quickFacts.features,
                  quickFacts.alerts,
                  quickFacts.access,
                ]}
              />
            </div>
          </main>
          <Footer />
        </>
      ) : null}
    </>
  )
}
