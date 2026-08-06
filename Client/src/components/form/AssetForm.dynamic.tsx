import type { CustomFieldDefinition } from '../../api'
import { AutoTextarea, Label } from './AssetForm.parts'
import { INPUT_CLASS } from './assetForm.styles'
import { dynamicFieldPlaceholder } from './assetForm.values'

export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <Label>{field.label}</Label>

      {field.data_type === 'boolean' ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Select yes or no…</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : field.data_type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Choose an option…</option>
          {field.options.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      ) : field.data_type === 'text' ? (
        <AutoTextarea
          value={value}
          onChange={onChange}
          placeholder={dynamicFieldPlaceholder(field)}
          ariaLabel={field.label}
        />
      ) : (
        <input
          aria-label={field.label}
          type={field.data_type === 'date' ? 'date' : field.data_type === 'number' ? 'number' : 'text'}
          value={value}
          placeholder={dynamicFieldPlaceholder(field)}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
        />
      )}
    </div>
  )
}
