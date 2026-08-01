import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCustomFieldDefinitions,
  listCategories,
  type CategoryRecord,
  type CustomFieldDefinition,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import type { ExtraPair } from './useAssetForm'

type Options = {
  categorySlug: string
  isOther: boolean
  lockCategory: boolean
  prefillCustomFields: Record<string, unknown>
  onError: (message: string) => void
}

/**
 * Server-driven category metadata for the asset form: the selectable category list and the
 * per-category custom-field template. On the first load, template values are seeded from the
 * prefill and unknown keys are split into free-form extra pairs; on a user-driven category switch
 * the template values reset while extras are preserved. A custom ("Other") category has no template.
 */
export function useCategoryTemplates({
  categorySlug,
  isOther,
  lockCategory,
  prefillCustomFields,
  onError,
}: Options) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [customDefs, setCustomDefs] = useState<CustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [extraPairs, setExtraPairs] = useState<ExtraPair[]>([])

  // Tracks the last loaded category so we know whether this is the initial load or a user switch.
  const prevCategoryRef = useRef<string | null>(null)

  useEffect(() => {
    if (lockCategory) return
    let mounted = true
    void (async () => {
      try {
        const rows = await listCategories()
        if (!mounted) return
        setCategories(rows)
      } catch (err) {
        if (!mounted) return
        logDevError('assetForm.categories', err)
        onError(getUserFacingMessage(err, 'Unable to load categories right now.'))
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockCategory])

  useEffect(() => {
    if (isOther) {
      setCustomDefs([])
      setCustomValues({})
      return
    }
    if (!categorySlug) return
    let mounted = true
    void (async () => {
      try {
        const defs = await getCustomFieldDefinitions(categorySlug)
        if (!mounted) return
        setCustomDefs(defs)

        const templateKeys = new Set(defs.map((d) => d.field_key))
        const isFirstLoad = prevCategoryRef.current === null
        prevCategoryRef.current = categorySlug

        const templateInit: Record<string, string> = {}
        if (!isFirstLoad) {
          for (const d of defs) templateInit[d.field_key] = ''
          setCustomValues(templateInit)
          return
        }

        const extraInit: ExtraPair[] = []
        for (const d of defs) {
          const v = prefillCustomFields[d.field_key]
          templateInit[d.field_key] = v == null ? '' : String(v)
        }
        for (const [k, v] of Object.entries(prefillCustomFields)) {
          if (!templateKeys.has(k)) {
            extraInit.push({ id: crypto.randomUUID(), key: k, value: v == null ? '' : String(v) })
          }
        }
        setCustomValues(templateInit)
        setExtraPairs(extraInit)
      } catch (err) {
        if (!mounted) return
        logDevError('assetForm.customFields', err)
        onError(getUserFacingMessage(err, 'Unable to load custom fields right now.'))
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, isOther])

  // The DB "other" row is replaced by the explicit Other option in the picker.
  const selectableCategories = useMemo(
    () => categories.filter((c) => c.slug.toLowerCase() !== 'other'),
    [categories],
  )

  return {
    selectableCategories,
    customDefs,
    customValues,
    setCustomValues,
    extraPairs,
    setExtraPairs,
  }
}
