import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getLogForAsset, createLog } from '../../api'
import AssetLogForm from '../form/AssetLogForm'

type Asset = Record<string, string>

export default function Feature() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrModal, setQrModal] = useState<{ assetId: string; qrCode: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [newAssetForm, setNewAssetForm] = useState(false)
  const [logModal, setLogModal] = useState<Asset | null>(null)
  const [logNote, setLogNote] = useState('')
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logQr, setLogQr] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const fetchAssets = (q: string) => {
    setLoading(true)
    getAssets(q || undefined)
      .then(setAssets)
      .catch(() => setError('Failed to load assets'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAssets('') }, [])

  const handleSearch = (val: string) => {
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchAssets(val), 300)
  }

  const handleViewQR = async (e: React.MouseEvent, asset_id: string) => {
    e.stopPropagation()
    setQrLoading(true)
    try {
      const log = await getLogForAsset(asset_id)
      setQrModal({ assetId: asset_id, qrCode: log.qr_code })
    } catch {
      alert('No QR found for this asset.')
    } finally {
      setQrLoading(false)
    }
  }

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logModal) return
    setLogSubmitting(true)
    try {
      const result = await createLog(logModal.asset_id, logNote)
      setLogQr(result.qr_code || null)
    } catch {
      alert('Failed to create log.')
    } finally {
      setLogSubmitting(false)
    }
  }

  const closeLogModal = () => {
    setLogModal(null)
    setLogNote('')
    setLogQr(null)
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Assets</h1>
        <button
          onClick={() => setNewAssetForm(true)}
          className="bg-[#f97316] text-black font-semibold px-4 py-2 rounded-lg hover:bg-orange-400 transition text-sm"
        >
          + Add New Asset
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, brand, model..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full bg-[#161616] border border-white/10 text-white placeholder-white/30 rounded-lg px-4 py-3 text-sm mb-6 outline-none focus:border-[#f97316] transition"
      />

      {loading && <p className="text-white/40 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#161616] text-white/50 text-xs uppercase">
              <tr>
                {['Asset ID', 'Type', 'Brand', 'Model', 'Assigned To', 'Department', 'Status', 'Condition', ''].map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr
                  key={a.asset_id}
                  className="border-t border-white/5 hover:bg-[#1a1a1a] transition cursor-pointer"
                  onClick={() => navigate(`/assets/${a.asset_id}`)}
                >
                  <td className="px-4 py-3 text-[#f97316] font-medium">{a.asset_id}</td>
                  <td className="px-4 py-3 text-white/70">{a.asset_type}</td>
                  <td className="px-4 py-3 text-white/70">{a.brand}</td>
                  <td className="px-4 py-3 text-white/70">{a.model}</td>
                  <td className="px-4 py-3">{a.assigned_to}</td>
                  <td className="px-4 py-3 text-white/70">{a.department}</td>
                  <td className="px-4 py-3">
                    <span className="bg-green-900/40 text-green-400 px-2 py-0.5 rounded text-xs">{a.status}</span>
                  </td>
                  <td className="px-4 py-3 text-white/50">{a.condition}</td>
                  <td className="px-4 py-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleViewQR(e, a.asset_id)}
                      disabled={qrLoading}
                      className="text-xs text-[#f97316] border border-[#f97316]/40 px-3 py-1 rounded hover:bg-[#f97316]/10 transition disabled:opacity-40 whitespace-nowrap"
                    >
                      View QR
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setLogModal(a) }}
                      className="text-xs text-white/60 border border-white/20 px-3 py-1 rounded hover:bg-white/5 transition whitespace-nowrap"
                    >
                      Log
                    </button>
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-white/30">No assets found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* View QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-8 text-center w-full max-w-sm">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Asset QR Code</p>
            <p className="text-[#f97316] font-bold text-lg mb-4">{qrModal.assetId}</p>
            <img src={qrModal.qrCode} alt="QR Code" className="mx-auto w-48 h-48 rounded-xl" />
            <p className="text-white/30 text-xs mt-4">Scan to view asset details on any device</p>
            <button
              onClick={() => setQrModal(null)}
              className="mt-6 bg-[#f97316] text-black font-semibold px-6 py-2 rounded-lg hover:bg-orange-400 transition text-sm w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Log Existing Asset Modal */}
      {logModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="font-semibold text-white">Log — {logModal.asset_id}</h2>
              <button onClick={closeLogModal} className="text-white/40 hover:text-white text-xl">✕</button>
            </div>
            {logQr ? (
              <div className="px-6 py-8 text-center">
                <p className="text-white/60 text-sm mb-4">New QR Generated</p>
                <img src={logQr} alt="QR Code" className="mx-auto w-48 h-48 rounded-xl" />
                <button onClick={closeLogModal} className="mt-6 bg-[#f97316] text-black font-semibold px-6 py-2 rounded-lg hover:bg-orange-400 transition text-sm">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogSubmit} className="px-6 py-6 space-y-4">
                <div className="bg-[#0f0f0f] border border-white/10 rounded-lg px-4 py-3">
                  <p className="text-white/40 text-xs">Asset</p>
                  <p className="text-white font-medium mt-1">{logModal.asset_id} — {logModal.brand} {logModal.model}</p>
                </div>
                <div>
                  <label className="block text-white/50 text-xs mb-1">Note <span className="text-white/30">(optional)</span></label>
                  <textarea
                    value={logNote}
                    onChange={(e) => setLogNote(e.target.value)}
                    rows={3}
                    className="w-full bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#f97316] transition resize-none"
                    placeholder="e.g. Issued for Q2 project..."
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={closeLogModal} className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-lg hover:bg-white/5 transition text-sm">Cancel</button>
                  <button type="submit" disabled={logSubmitting} className="flex-1 bg-[#f97316] text-black font-semibold py-2.5 rounded-lg hover:bg-orange-400 transition text-sm disabled:opacity-50">
                    {logSubmitting ? 'Logging...' : 'Create Log + New QR'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add New Asset Modal */}
      {newAssetForm && (
        <AssetLogForm
          prefill={{}}
          onClose={() => setNewAssetForm(false)}
          onSuccess={() => { setNewAssetForm(false); fetchAssets(search) }}
        />
      )}
    </main>
  )
}
