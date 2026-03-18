// Static dummy stats — no API call needed
const stats = [
  { label: 'Total Assets', value: '10+' },
  { label: 'Departments', value: '6' },
  { label: 'Active', value: '100%' },
  { label: 'QR Enabled', value: '✓' },
]

const steps = [
  { num: '01', title: 'Add Asset', desc: 'Log a new device or equipment into the system with full details.' },
  { num: '02', title: 'Generate QR', desc: 'A unique QR code is created and linked to the asset automatically.' },
  { num: '03', title: 'Scan & Track', desc: 'Anyone scans the QR code to instantly view asset details on any device.' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          Asset Management <span className="text-[#f97316]">System</span>
        </h1>
        <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
          Track every asset in your organization. Generate QR codes. Scan from any device.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a
            href="/assets"
            className="bg-[#f97316] text-black font-semibold px-6 py-3 rounded-lg hover:bg-orange-400 transition"
          >
            View Assets
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 py-12 bg-[#161616] border-t border-b border-white/10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-[#f97316]">{s.value}</p>
              <p className="mt-1 text-white/50 text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="bg-[#161616] border border-white/10 rounded-xl p-6">
              <p className="text-[#f97316] text-4xl font-bold">{s.num}</p>
              <h3 className="mt-3 font-semibold text-lg">{s.title}</h3>
              <p className="mt-2 text-white/50 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
