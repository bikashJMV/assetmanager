const PAGE_SIZE_STORAGE_PREFIX = 'ams-page-size:'

export function getStoredPageSize({
  storageKey,
  defaultValue,
  allowed,
}: {
  storageKey: string
  defaultValue: number
  allowed: readonly number[]
}): number {
  try {
    const raw = localStorage.getItem(`${PAGE_SIZE_STORAGE_PREFIX}${storageKey}`)
    if (!raw) return defaultValue
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return defaultValue
    if (!allowed.includes(parsed)) return defaultValue
    return parsed
  } catch {
    return defaultValue
  }
}

export function setStoredPageSize(storageKey: string, value: number) {
  try {
    localStorage.setItem(`${PAGE_SIZE_STORAGE_PREFIX}${storageKey}`, String(value))
  } catch {
    // ignore
  }
}

