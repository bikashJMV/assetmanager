import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { scanAsset } from '../../api'

type Asset = Record<string, string>

const fields: [string, string][] = [
  ['asset_id', 'Asset ID'],
  ['asset_type', 'Type'],
  ['brand', 'Brand'],
  ['model', 'Model'],
  ['assigned_to', 'Assigned To'],
  ['employee_email', 'Email'],
  ['department', 'Department'],
  ['location', 'Location'],
  ['status', 'Status'],
  ['condition', 'Condition'],
  ['serial_number', 'Serial Number'],
  ['purchase_date', 'Purchase Date'],
  ['warranty_expiry', 'Warranty Expiry'],
  ['notes', 'Notes'],
]

export default function ScanPage() {
  const { id } = useParams()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    scanAsset(id)
      .then(setAsset)
      .catch(() => setError('Asset not found'))
  }, [id])

  if (error) return (
    <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[#f97316] text-5xl font-bold">404</p>
        <p className="mt-2 text-white/50">Asset not found</p>
      </div>
    </main>
  )

  if (!asset) return (
    <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <p className="text-white/40">Loading asset...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-[#f97316] text-xs uppercase tracking-widest mb-1">Asset Details</p>
        <h1 className="text-2xl font-bold">{asset.brand} {asset.model}</h1>
        <p className="text-white/40 text-sm mt-1">{asset.asset_id}</p>
      </div>

      {/* Status badge */}
      <div className="flex justify-center mb-8">
        <span className="bg-green-900/40 text-green-400 border border-green-700/40 px-4 py-1.5 rounded-full text-sm font-medium">
          {asset.status} · {asset.condition}
        </span>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-3 max-w-lg mx-auto">
        {fields.map(([key, label]) => (
          asset[key] ? (
            <div key={key} className="bg-[#161616] border border-white/10 rounded-xl px-4 py-3 flex justify-between items-start">
              <span className="text-white/40 text-xs uppercase">{label}</span>
              <span className="text-white text-sm font-medium text-right ml-4">{asset[key]}</span>
            </div>
          ) : null
        ))}
      </div>

      <p className="text-center text-white/20 text-xs mt-10">Powered by AMS</p>
    </main>
  )
}
