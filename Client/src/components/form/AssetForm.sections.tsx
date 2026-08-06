import { AutoTextarea, DateField, IconInput, Label, Section } from './AssetForm.parts'
import { CustomFieldTable } from './AssetForm.customFieldTable'
import type { ExtraPair, FormState } from './useAssetForm'

type SetForm = React.Dispatch<React.SetStateAction<FormState>>

export function LocationSection({
  form,
  setForm,
  suggestions,
}: {
  form: FormState
  setForm: SetForm
  suggestions: string[]
}) {
  return (
    <Section icon="location" title="Location">
      <Label htmlFor="asset-form-location-name">Office location</Label>
      <IconInput
        icon="location"
        id="asset-form-location-name"
        list="asset-location-suggestions"
        value={form.location_name}
        onChange={(e) => setForm((c) => ({ ...c, location_name: e.target.value }))}
        placeholder="Building A • Floor 2 • Room 205"
        autoComplete="off"
      />
      <datalist id="asset-location-suggestions">
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </Section>
  )
}

export function WarrantySection({ form, setForm }: { form: FormState; setForm: SetForm }) {
  return (
    <Section icon="calendar" title="Warranty">
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
        <DateField
          label="Purchase date"
          value={form.purchase_date}
          onChange={(v) => setForm((c) => ({ ...c, purchase_date: v }))}
        />
        <DateField
          label="Warranty expiry"
          value={form.warranty_expiry}
          onChange={(v) => setForm((c) => ({ ...c, warranty_expiry: v }))}
        />
      </div>
    </Section>
  )
}

export function AdditionalSection({
  form,
  setForm,
  extraPairs,
  addExtraPair,
  updateExtraPair,
  removeExtraPair,
}: {
  form: FormState
  setForm: SetForm
  extraPairs: ExtraPair[]
  addExtraPair: () => void
  updateExtraPair: (id: string, patch: Partial<ExtraPair>) => void
  removeExtraPair: (id: string) => void
}) {
  return (
    <Section
      icon="edit"
      title="Additional information"
      action={
        <button
          type="button"
          onClick={addExtraPair}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-base bg-app px-3 text-xs font-semibold text-primary transition hover:border-[color:var(--accent-soft)] hover:text-accent"
        >
          <span aria-hidden>+</span> Add field
        </button>
      }
    >
      <Label htmlFor="asset-form-notes">Notes</Label>
      <AutoTextarea
        id="asset-form-notes"
        value={form.notes}
        onChange={(v) => setForm((c) => ({ ...c, notes: v }))}
        placeholder="Procurement notes, references, remarks…"
        minRows={2}
      />

      <CustomFieldTable pairs={extraPairs} updatePair={updateExtraPair} removePair={removeExtraPair} />
    </Section>
  )
}
