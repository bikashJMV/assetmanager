import { AppIcon } from '../ui'
import { AutoTextarea } from './AssetForm.parts'
import { INPUT_CLASS } from './assetForm.styles'
import type { ExtraPair } from './useAssetForm'

/** Compact editable Key | Value | Remove table for free-form custom fields. */
export function CustomFieldTable({
  pairs,
  updatePair,
  removePair,
}: {
  pairs: ExtraPair[]
  updatePair: (id: string, patch: Partial<ExtraPair>) => void
  removePair: (id: string) => void
}) {
  if (pairs.length === 0) return null
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-base">
      <div className="hidden grid-cols-[1fr_1.5fr_auto] gap-2 border-b border-base bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
        <span>Key</span>
        <span>Value</span>
        <span className="sr-only">Remove</span>
      </div>
      <div className="divide-y divide-[color:var(--border)]">
        {pairs.map((pair) => (
          <div
            key={pair.id}
            className="grid grid-cols-1 items-start gap-2 px-3 py-2 sm:grid-cols-[1fr_1.5fr_auto]"
          >
            <input
              value={pair.key}
              onChange={(e) => updatePair(pair.id, { key: e.target.value })}
              placeholder="e.g. WiFi SSID"
              className={INPUT_CLASS}
              aria-label="Custom field key"
            />
            <AutoTextarea
              value={pair.value}
              onChange={(v) => updatePair(pair.id, { value: v })}
              placeholder="e.g. Office-5G"
              ariaLabel="Custom field value"
              minRows={1}
            />
            <button
              type="button"
              onClick={() => removePair(pair.id)}
              className="inline-flex h-10 w-10 items-center justify-center self-start rounded-lg border border-base text-muted transition hover:border-red-400 hover:text-red-500"
              aria-label="Remove custom field"
              title="Remove"
            >
              <AppIcon name="delete" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
