const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export async function getLogForAsset(asset_id: string) {
  const res = await fetch(`${API_BASE}/logs/${asset_id}`)
  if (!res.ok) throw new Error('No QR found for this asset')
  return res.json()
}

export async function getAssets(search?: string) {
  const url = search
    ? `${API_BASE}/assets?search=${encodeURIComponent(search)}`
    : `${API_BASE}/assets`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch assets')
  return res.json()
}

export async function getAsset(asset_id: string) {
  const res = await fetch(`${API_BASE}/assets/${asset_id}`)
  if (!res.ok) throw new Error('Asset not found')
  return res.json()
}

export async function createAsset(data: Record<string, string>) {
  const res = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create asset')
  return res.json()
}

export async function createLog(asset_id: string, note: string) {
  const res = await fetch(`${API_BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id, note }),
  })
  if (!res.ok) throw new Error('Failed to create log')
  return res.json()
}

export async function scanAsset(asset_id: string) {
  const res = await fetch(`${API_BASE}/scan/${asset_id}`)
  if (!res.ok) throw new Error('Asset not found')
  return res.json()
}
