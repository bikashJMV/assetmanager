import type { CategoryRecord } from '../api'

/**
 * Category slugs omitted from the Add new asset (`/assets/new`) chip row only.
 * Rows may still exist in `asset_categories` for legacy assets, filters, and bulk import.
 */
export const NEW_ASSET_HIDDEN_CATEGORY_SLUGS: readonly string[] = ['sim']

export function filterCategoriesForNewAssetPicker(categories: CategoryRecord[]): CategoryRecord[] {
  const hidden = new Set(NEW_ASSET_HIDDEN_CATEGORY_SLUGS.map((s) => s.toLowerCase()))
  return categories.filter((c) => !hidden.has(c.slug.toLowerCase()))
}
