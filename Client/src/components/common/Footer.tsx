export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mb-6 w-full min-w-0 shrink-0">
      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-7">
        <h1 className="block w-full text-right font-bold sm:text-3xl">Asset Manager</h1>
        <div className="mt-7 flex flex-col gap-2 border-t border-base pt-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>Built for accountability, easy handover and manage asset.</p>
          <p>
            Copyright {year} Asset Manager. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
