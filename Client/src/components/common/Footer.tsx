export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mb-6 px-6">
      <h1 className="block w-full text-right font-bold sm:text-3xl">
        Asset Manager
      </h1>
      <div className="mt-7 pt-4 border-t border-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-subtle">
        <p>Copyright {year} Asset Manager. All rights reserved.</p>
        <p>Built for clarity, speed, and accountability.</p>
      </div>
    </footer>
  )
}
