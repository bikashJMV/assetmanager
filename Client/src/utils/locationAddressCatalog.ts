import catalog from '../data/address.json'

export type AddressRecord = {
  company?: string
  line1?: string
  city?: string
  district?: string
  state?: string
  pincode?: string
  state_code?: string
} & Record<string, string | undefined>

function formatAddressEntry(row: AddressRecord): string {
  const line2 = row.city?.trim() || row.district?.trim() || ''
  const parts = [row.company, row.line1, line2, row.state, row.pincode].map((p) => (p ?? '').trim()).filter(Boolean)
  return parts.join(', ')
}

const rows: AddressRecord[] = (catalog as { address?: AddressRecord[] }).address ?? []

/** One label per catalog row for datalist / suggestions (location name in AMS). */
export function getCatalogLocationLabels(): string[] {
  return rows.map(formatAddressEntry).filter((s) => s.length > 0)
}
