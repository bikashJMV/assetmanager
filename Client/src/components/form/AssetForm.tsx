import type { AssetWriteInput } from '../../api'
import { LOADING } from '../../constants/loading'
import { getCategoryLabelFromSlug } from './assetForm.categoryMeta'
import { CoreSection } from './AssetForm.core'
import { DynamicField } from './AssetForm.dynamic'
import { Section } from './AssetForm.parts'
import {
  AdditionalSection,
  LocationSection,
  WarrantySection,
} from './AssetForm.sections'
import { useAssetForm } from './useAssetForm'

type Props = {
  prefill?: Partial<AssetWriteInput>
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'
  categoryLocked?: boolean
  lockedCategoryLabel?: string
  qr_reservation_id?: string
  isStatusDisabled?: boolean
  /** Notified whenever the effective category changes, so a host page can mirror the selection. */
  onCategoryChange?: (slug: string) => void
}

export default function AssetForm({
  prefill = {},
  onClose,
  onSuccess,
  variant = 'modal',
  categoryLocked = false,
  lockedCategoryLabel,
  qr_reservation_id,
  isStatusDisabled = false,
  onCategoryChange,
}: Props) {
  const isPanel = variant === 'panel'
  const f = useAssetForm({ prefill, onSuccess, categoryLocked, qr_reservation_id, onCategoryChange })

  const templateLabel = f.isOther
    ? f.customCategoryName.trim() || 'Custom'
    : getCategoryLabelFromSlug(f.form.category_slug)

  const content = (
    <div className="mx-auto w-full max-w-[1080px] rounded-2xl border border-base bg-app shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-base px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-primary sm:text-lg">
            {f.isEditing ? `Edit asset ${prefill.asset_tag}` : 'Create asset'}
          </h2>
          {!f.isEditing ? (
            <p className="mt-0.5 text-xs text-muted">
              Fields marked <span className="text-red-500">*</span> are required.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-xl leading-none text-muted hover:text-primary"
        >
          ×
        </button>
      </div>

      <form onSubmit={f.handleSubmit} className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        <CoreSection
          form={f.form}
          setForm={f.setForm}
          statusOptions={f.inventoryStatusOptions}
          isStatusDisabled={isStatusDisabled}
          showAssetTag={f.isEditing || !qr_reservation_id}
          isEditing={f.isEditing}
          categories={f.selectableCategories}
          isOther={f.isOther}
          lockCategory={f.lockCategory}
          lockedCategoryLabel={lockedCategoryLabel}
          customCategoryName={f.customCategoryName}
          setCustomCategoryName={f.setCustomCategoryName}
          onPickCategory={f.pickCategory}
        />

        {f.customDefs.length > 0 && (
          <Section title={`${templateLabel} details`} icon="assets">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {f.customDefs.map((field) => (
                <DynamicField
                  key={field.id}
                  field={field}
                  value={f.customValues[field.field_key] || ''}
                  onChange={(v) => f.setCustomValues((c) => ({ ...c, [field.field_key]: v }))}
                />
              ))}
            </div>
          </Section>
        )}

        <LocationSection form={f.form} setForm={f.setForm} suggestions={f.locationSuggestions} />
        <WarrantySection form={f.form} setForm={f.setForm} />
        <AdditionalSection
          form={f.form}
          setForm={f.setForm}
          extraPairs={f.extraPairs}
          addExtraPair={f.addExtraPair}
          updateExtraPair={f.updateExtraPair}
          removeExtraPair={f.removeExtraPair}
        />

        {f.error && <p className="text-sm text-accent">{f.error}</p>}

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-base bg-app/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base bg-surface px-5 py-2 text-sm text-primary transition hover:bg-surface-2 sm:min-w-[120px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={f.loading}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-on-accent shadow-accent transition hover:bg-accent-hover disabled:opacity-60 sm:min-w-[160px]"
          >
            {f.loading ? LOADING.SAVING : f.isEditing ? 'Save changes' : 'Create asset'}
          </button>
        </div>
      </form>
    </div>
  )

  if (isPanel) return content

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm">
      {content}
    </div>
  )
}
