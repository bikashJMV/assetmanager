import type { CategoryRecord } from '../../api'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import { AppIcon } from '../ui'
import { CategoryLocked, CategorySelect } from './AssetForm.category'
import { getCategoryLabelFromSlug } from './assetForm.categoryMeta'
import { Field, Label, Section } from './AssetForm.parts'
import { INPUT_CLASS } from './assetForm.styles'
import type { FormState } from './useAssetForm'

type SetForm = React.Dispatch<React.SetStateAction<FormState>>

export function CoreSection({
  form,
  setForm,
  statusOptions,
  isStatusDisabled,
  showAssetTag,
  isEditing,
  categories,
  isOther,
  lockCategory,
  lockedCategoryLabel,
  customCategoryName,
  setCustomCategoryName,
  onPickCategory,
}: {
  form: FormState
  setForm: SetForm
  statusOptions: FilterSelectOption[]
  isStatusDisabled: boolean
  showAssetTag: boolean
  isEditing: boolean
  categories: CategoryRecord[]
  isOther: boolean
  lockCategory: boolean
  lockedCategoryLabel?: string
  customCategoryName: string
  setCustomCategoryName: (value: string) => void
  onPickCategory: (value: string) => void
}) {
  return (
    <Section icon="assets" title="Core information">
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Serial number"
          required
          value={form.serial_number}
          placeholder="e.g. SN-ABC12345678"
          onChange={(v) => setForm((c) => ({ ...c, serial_number: v }))}
        />
        <Field
          label="Manufacturer"
          value={form.manufacturer_name}
          placeholder="e.g. Dell, Lenovo"
          onChange={(v) => setForm((c) => ({ ...c, manufacturer_name: v }))}
        />
        <Field
          label="Model"
          value={form.model}
          placeholder="e.g. Latitude 5540"
          onChange={(v) => setForm((c) => ({ ...c, model: v }))}
        />
        <div>
          <Label htmlFor="asset-form-status" required>Inventory status</Label>
          <FilterSelect
            label="Inventory Status"
            ariaLabel="Select inventory status"
            value={form.status}
            options={statusOptions}
            onChange={(v) => setForm((c) => ({ ...c, status: v }))}
            hideLabel
            dense
            triggerId="asset-form-status"
            disabled={isStatusDisabled}
            title={isStatusDisabled ? 'Cannot change status while asset is assigned and in edit mode' : undefined}
          />
        </div>

        {/* Category + Asset Tag on the same row */}
        <div>
          <Label required>Category</Label>
          {lockCategory ? (
            <CategoryLocked
              slug={form.category_slug}
              label={lockedCategoryLabel || getCategoryLabelFromSlug(form.category_slug) || form.category_slug}
            />
          ) : (
            <CategorySelect options={categories} value={form.category_slug} isOther={isOther} onPick={onPickCategory} />
          )}
        </div>

        {showAssetTag ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Label className="mb-0">Asset tag</Label>
              <span
                className="inline-flex text-muted"
                title="Asset tag is automatically generated after saving."
                aria-label="Asset tag is automatically generated after saving."
              >
                <AppIcon name="info" size={13} />
              </span>
            </div>
            <input
              value={isEditing ? form.asset_tag : ''}
              placeholder={isEditing ? 'JMV-LAP-00001' : 'Auto generated'}
              disabled
              aria-label="Asset tag"
              className={INPUT_CLASS}
            />
          </div>
        ) : null}

        {isOther && !lockCategory ? (
          <div className="sm:col-span-2">
            <Label htmlFor="asset-form-category-name" required>Category name</Label>
            <input
              id="asset-form-category-name"
              value={customCategoryName}
              onChange={(e) => setCustomCategoryName(e.target.value)}
              placeholder="e.g. Router, CCTV Camera, Projector, UPS"
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </div>
        ) : null}
      </div>
    </Section>
  )
}