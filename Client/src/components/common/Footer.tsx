export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full bg-orange-500 text-white">
      <div className="mx-auto flex flex-col gap-2 px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
        
        {/* Left */}
        <h1 className="text-left text-xl font-bold sm:text-base">
          Asset Manager
        </h1>

        {/* Center */}
        <p className="text-center flex-1 sm:text-center">
          © {year} Asset Manager. All rights reserved.
        </p>

        {/* Right */}
        <p className="text-right">
          Built for accountability, easy handover and manage asset.
        </p>

      </div>
    </footer>
  )
}
