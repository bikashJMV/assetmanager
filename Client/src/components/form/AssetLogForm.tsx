import { useState } from 'react'
import { createAsset, createLog } from '../../api'

type Props = {
  prefill: Record<string, string>
  onClose: () => void
  onSuccess: (result: Record<string, string>) => void
}

// All fields (note is optional, asset_id is auto-filled if prefill provided)
const formFields: { key: string; label: string; required: boolean; type?: string }[] = [
  { key: 'asset_id', label: 'Asset ID', required: true },
  { key: 'asset_type', label: 'Asset Type', required: true },
  { key: 'brand', label: 'Brand', required: true },
  { key: 'model', label: 'Model', required: true },
  { key: 'processor', label: 'Processor', required: true },
  { key: 'ram', label: 'RAM', required: true },
  { key: 'storage', label: 'Storage', required: true },
  { key: 'serial_number', label: 'Serial Number', required: true },
  { key: 'purchase_date', label: 'Purchase Date', required: true, type: 'date' },
  { key: 'warranty_expiry', label: 'Warranty Expiry', required: true, type: 'date' },
  { key: 'assigned_to', label: 'Assigned To', required: true },
  { key: 'employee_email', label: 'Employee Email', required: true, type: 'email' },
  { key: 'department', label: 'Department', required: true },
  { key: 'location', label: 'Location', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'condition', label: 'Condition', required: true },
  { key: 'last_updated', label: 'Last Updated', required: true, type: 'date' },
]

export default function AssetLogForm({ prefill, onClose, onSuccess }: Props) {
  const isExisting = !!prefill.asset_id
  const [form, setForm] = useState<Record<string, string>>({ ...prefill })
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [qrResult, setQrResult] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let result
      if (isExisting) {
        result = await createLog(form.asset_id, note)
      } else {
        result = await createAsset({ ...form })
      }
      setQrResult(result.qr_code || null)
      onSuccess(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-10 px-4">
      <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">
            {isExisting ? `Log Asset — ${form.asset_id}` : 'Add New Asset'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
        </div>

        {qrResult ? (
          <div className="px-6 py-8 text-center">
            <p className="text-white/60 text-sm mb-4">QR Code Generated</p>
            <img src={qrResult} alt="QR Code" className="mx-auto w-48 h-48 rounded-xl" />
            <p className="text-white/40 text-xs mt-4">Scan this to view asset details</p>
            <button
              onClick={onClose}
              className="mt-6 bg-[#f97316] text-black font-semibold px-6 py-2 rounded-lg hover:bg-orange-400 transition text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formFields.map(({ key, label, required, type }) => (
                <div key={key}>
                  <label className="block text-white/50 text-xs mb-1">
                    {label} {required && <span className="text-[#f97316]">*</span>}
                  </label>
                  <input
                    type={type || 'text'}
                    value={form[key] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required={required}
                    readOnly={isExisting && key === 'asset_id'}
                    className={`w-full bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#f97316] transition ${
                      isExisting && key === 'asset_id' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Note field — always optional */}
            <div>
              <label className="block text-white/50 text-xs mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#f97316] transition resize-none"
                placeholder="Any additional notes..."
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-white/10 text-white/60 py-2.5 rounded-lg hover:bg-white/5 transition text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#f97316] text-black font-semibold py-2.5 rounded-lg hover:bg-orange-400 transition text-sm disabled:opacity-50"
              >
                {loading ? 'Saving...' : isExisting ? 'Generate QR' : 'Add Asset'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
