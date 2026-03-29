import type { CategoryRecord } from '../../api'

type Props = {
  categories: CategoryRecord[]
  loading: boolean
  error: string
  /** Current selection: category slug or 'other'. */
  selectedSlug: string | 'other'
  onSelectSlug: (slug: string | 'other') => void
  /**
   * `card` — title + multi-column grid (legacy full card).
   * `row` — one horizontal scroll row of chips (same page as form).
   */
  variant?: 'card' | 'row'
}

function tileGlyph(slug: string): string {
  const s = slug.toLowerCase()
  if (s.includes('laptop')) return '▭'
  if (s.includes('desktop')) return '▦'
  if (s.includes('mouse')) return '●'
  if (s.includes('keyboard')) return '▬'
  if (s.includes('sim')) return '▭'
  if (s.includes('monitor')) return '▢'
  if (s.includes('pen') || s.includes('drive') || s.includes('usb')) return '▯'
  if (s.includes('network') || s.includes('wifi') || s.includes('dongle')) return '◎'
  if (s.includes('headset')) return '◔'
  if (s.includes('printer')) return '▣'
  if (s.includes('server')) return '▤'
  if (s.includes('tablet')) return '▢'
  if (s.includes('phone')) return '◉'
  if (s.includes('furniture')) return '▱'
  return '◇'
}

function chipClasses(active: boolean, dashed?: boolean) {
  const base =
    'shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]'
  if (dashed) {
    return `${base} border-2 border-dashed ${active
        ? 'border-[color:var(--accent)] bg-surface-2 text-primary'
        : 'border-base bg-transparent text-primary hover:bg-surface-2 hover:border-[color:var(--accent)]'
      }`
  }
  return `${base} border ${active
      ? 'border-[color:var(--accent)] bg-accent/15 text-primary shadow-[0_0_0_1px_var(--accent-soft)]'
      : 'border-base bg-surface-2 text-primary hover:bg-surface-3 hover:border-[color:var(--accent-soft)]'
    }`
}

export default function CategoryPickerGrid({
  categories,
  loading,
  error,
  selectedSlug,
  onSelectSlug,
  variant = 'card',
}: Props) {
  if (variant === 'row') {
    return (
      <div className="w-full">
        {error ? <p className="text-sm text-accent mb-2">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-subtle py-2">Loading categories…</p>
        ) : (
          <div
            className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 pt-1 -mx-1 px-1 scrollbar-thin"
            role="group"
            aria-label="Asset category"
          >
            {categories.map((cat) => {
              const active = selectedSlug === cat.slug
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectSlug(cat.slug)}
                  className={chipClasses(active)}
                >
                  <span className="text-base text-muted select-none" aria-hidden>
                    {tileGlyph(cat.slug)}
                  </span>
                  <span>{cat.name}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => onSelectSlug('other')}
              className={chipClasses(selectedSlug === 'other', true)}
            >
              <span className="text-base font-light text-accent" aria-hidden>
                +
              </span>
              <span>Other</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl border border-base bg-surface p-6 sm:p-8 shadow-[0_18px_48px_var(--accent-shadow)]">
        <h1 className="text-xl sm:text-2xl font-semibold text-primary">Add new asset</h1>
        <p className="text-sm text-muted mt-2">
          Choose a category template or create a custom asset type.
        </p>

        {error ? <p className="text-sm text-accent mt-4">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-subtle mt-8 text-center py-12">Loading categories…</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectSlug(cat.slug)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-5 text-center transition hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] min-h-[100px] ${selectedSlug === cat.slug
                    ? 'border-[color:var(--accent)] bg-accent/15 shadow-[0_0_0_1px_var(--accent-soft)]'
                    : 'border-base bg-surface-2 hover:border-[color:var(--accent-soft)]'
                  }`}
              >
                <span className="text-2xl text-muted select-none" aria-hidden>
                  {tileGlyph(cat.slug)}
                </span>
                <span className="text-sm font-medium text-primary leading-tight">{cat.name}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => onSelectSlug('other')}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-5 text-center transition hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] min-h-[100px] ${selectedSlug === 'other'
                  ? 'border-[color:var(--accent)] bg-accent/10'
                  : 'border-base bg-transparent hover:border-[color:var(--accent)]'
                }`}
            >
              <span className="text-2xl font-light text-accent" aria-hidden>
                +
              </span>
              <span className="text-sm font-medium text-primary">Other</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
