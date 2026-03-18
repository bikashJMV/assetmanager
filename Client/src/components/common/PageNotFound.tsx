export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center text-white">
      <h1 className="text-6xl font-bold text-[#f97316]">404</h1>
      <p className="mt-4 text-white/60 text-lg">Page not found</p>
      <a href="/" className="mt-6 text-[#f97316] underline text-sm">
        Go Home
      </a>
    </div>
  )
}
