export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-10 px-6">
      <h2 className="inline-block w-fit sm:text-3xl font-bold mt-2">
        Asset Manager
      </h2>
      <div className="mt-7 pt-4 border-t border-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-subtle">
        <p>Copyright {year} Asset Management. All rights reserved.</p>
        <p>Built for clarity, speed, and accountability.</p>
      </div>
    </footer>
  )
}
