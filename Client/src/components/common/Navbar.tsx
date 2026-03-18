import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="w-full bg-[#0f0f0f] border-b border-[#f97316]/20 px-6 py-4 flex items-center justify-between">
      <Link to="/" className="text-[#f97316] font-bold text-xl tracking-tight">
        AMS
      </Link>
      <div className="flex gap-6">
        <Link
          to="/"
          className={`text-sm font-medium transition-colors ${
            pathname === '/' ? 'text-[#f97316]' : 'text-white/70 hover:text-white'
          }`}
        >
          Home
        </Link>
        <Link
          to="/assets"
          className={`text-sm font-medium transition-colors ${
            pathname.startsWith('/assets') ? 'text-[#f97316]' : 'text-white/70 hover:text-white'
          }`}
        >
          Assets
        </Link>
      </div>
    </nav>
  )
}
