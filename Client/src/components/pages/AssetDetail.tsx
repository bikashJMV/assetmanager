import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAsset } from '../../api'
import AssetLogForm from '../form/AssetLogForm'

type Asset = Record<string, string>

const fields: [string, string][] = [
  ['asset_id', 'Asset ID'],
  ['asset_type', 'Type'],
  ['brand', 'Brand'],
  ['model', 'Model'],
  ['processor', 'Processor'],
  ['ram', 'RAM'],
  ['storage', 'Storage'],
  ['serial_number', 'Serial Number'],
  ['purchase_date', 'Purchase Date'],
  ['warranty_expiry', 'Warranty Expiry'],
  ['assigned_to', 'Assigned To'],
  ['employee_email', 'Email'],
  ['department', 'Department'],
  ['location', 'Location'],
  ['status', 'Status'],
  ['condition', 'Condition'],
  ['last_updated', 'Last Updated'],
  ['notes', 'Notes'],
]

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [error, setError] = useState('')
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!id) return
    getAsset(id)
      .then(setAsset)
      .catch(() => setError('Asset not found'))
  }, [id])

  if (error) return (
    <main className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </main>
  )

  if (!asset) return (
    <main className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
      <p className="text-white/40">Loading...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header Bar - Full Width */}
      <div className="flex items-center gap-4 bg-[#161616] px-6 py-6 border-b border-white/10">
        <button
          onClick={() => navigate('/assets')}
          className="text-white/40 hover:text-white text-sm transition"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold ml-4">
          <span className="text-[#f97316]">{asset.asset_id}</span> <span className="text-white/30 px-2">/</span> {asset.brand} {asset.model}
        </h1>
        <button
          onClick={() => setShowLog(true)}
          className="ml-auto bg-[#f97316] text-black font-semibold px-5 py-2 rounded-lg hover:bg-orange-400 transition text-sm"
        >
          Log Asset
        </button>
      </div>

      {/* Content Area - Full Width Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 border-b border-white/10">
        {fields.map(([key, label]) => (
          asset[key] ? (
            <div key={key} className="bg-[#0f0f0f] border-r border-b border-white/10 p-6 hover:bg-[#161616] transition">
              <p className="text-[#f97316] text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
              <p className="text-white/90 font-medium text-sm break-words">{asset[key]}</p>
            </div>
          ) : null
        ))}
      </div>

      {showLog && (
        <AssetLogForm
          prefill={asset}
          onClose={() => setShowLog(false)}
          onSuccess={() => setShowLog(false)}
        />
      )}
    </main>
  )
}
