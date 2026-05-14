import { useState } from 'react'
import { useCreateQrBatchMutation } from '../../queries/qr'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { useToast } from '../../hooks/useToast'

export default function GenerateBatchModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [count, setCount] = useState<number | ''>('')
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const createMutation = useCreateQrBatchMutation()

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    const parsedCount = Number(count)
    if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 1000) {
      setError('Please enter a valid count between 1 and 1000.')
      return
    }

    const idempotencyKey = crypto.randomUUID()

    createMutation.mutate(
      { count: parsedCount, idempotencyKey },
      {
        onSuccess: () => {
          showToast({ message: `Successfully generated ${parsedCount} QR reservations.`, variant: 'success' })
          setCount('')
          onClose()
        },
        onError: (err) => {
          logDevError('qr.generateBatch', err)
          setError(getUserFacingMessage(err, 'Failed to generate batch.'))
        },
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-app border border-base rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-base bg-surface flex justify-between items-center">
          <h2 className="text-lg font-semibold text-primary">Generate QR Batch</h2>
          <button onClick={onClose} className="text-muted hover:text-primary transition text-xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Number of QRs to Generate
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              required
              value={count}
              onChange={(e) => setCount(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 50"
              className="w-full bg-surface border border-base text-primary rounded-lg px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] transition"
            />
            <p className="text-xs text-subtle mt-1">Maximum 1,000 per batch.</p>
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface border border-base text-primary py-2 rounded-lg font-medium hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-accent text-white py-2 rounded-lg font-medium hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
