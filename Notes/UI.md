# AMS UI Design System — v2.0

> Premium interface for the JMV Asset Management System.
> Inspiration: **Docker Desktop** (calm density, dark sidebar anchor, quiet surfaces) + **Hugging Face** (friendly warmth, pill badges, readable data, generous cards).
> Audience: **non-technical users**. Zero hardcoded values. Zero jank. Light/Dark. Fully responsive (mobile → 4K).

---

## 1. Design Philosophy

| Principle | Rule |
|---|---|
| **Token-first** | Every color, radius, shadow, spacing, font-size comes from a CSS variable. Hardcoded hex/px in a component = PR rejected. |
| **Calm density** | Docker feel: one accent hue, quiet neutral surfaces, dense-but-breathing tables. |
| **Friendly clarity** | HF feel: rounded pills for statuses, warm hover states, human copy ("Save changes", never "Persist entity"). |
| **Icon + label** | Icons never appear alone for primary/destructive actions. Icon-only allowed only in toolbars **with tooltip**. |
| **One icon = one meaning** | Icon registry (§10) is the single source of truth. Duplicate semantics forbidden. |
| **Zero lag** | Animate only `transform` and `opacity`. Never `width/height/top/left/box-shadow`. Skeletons appear for anything > 200 ms. |
| **Non-tech safe** | Plain English, verb-specific buttons, confirm dialog before every destructive action, 44 px min touch targets. |

---

## 2. Global CSS Tokens — `src/styles/tokens.css`

All colors are **HSL triplets** so opacity variants stay free: `hsl(var(--primary) / 0.1)`.

```css
/* =========================================================
   AMS DESIGN TOKENS — single source of truth
   Components NEVER use raw values. Tailwind maps to these.
   ========================================================= */

:root {
  /* ---------- Brand hue anchor (one hue, whole app) ---------- */
  --hue-brand: 217;                       /* Docker-blue family */

  /* ---------- Light theme (default) ---------- */
  --background:        var(--hue-brand) 20% 98%;
  --surface:           0 0% 100%;          /* cards, panels */
  --surface-hover:     var(--hue-brand) 30% 96%;
  --surface-sunken:    var(--hue-brand) 20% 95%;  /* table headers, wells */
  --border:            var(--hue-brand) 15% 89%;
  --border-strong:     var(--hue-brand) 15% 80%;

  --foreground:        var(--hue-brand) 25% 12%;
  --muted-foreground:  var(--hue-brand) 10% 42%;
  --faint-foreground:  var(--hue-brand) 8% 60%;

  --primary:           var(--hue-brand) 91% 53%;   /* #1d63ed family */
  --primary-hover:     var(--hue-brand) 91% 47%;
  --primary-active:    var(--hue-brand) 91% 42%;
  --primary-foreground: 0 0% 100%;
  --primary-soft:      var(--hue-brand) 91% 53% / 0.10;  /* tinted bg */

  /* ---------- Semantic ---------- */
  --success:           152 60% 38%;
  --success-soft:      152 60% 38% / 0.12;
  --warning:           38 92% 44%;
  --warning-soft:      38 92% 44% / 0.14;
  --danger:            0 72% 51%;
  --danger-soft:       0 72% 51% / 0.10;
  --info:              199 89% 44%;
  --info-soft:         199 89% 44% / 0.12;

  /* ---------- Status (asset lifecycle) ---------- */
  --status-available:      152 60% 38%;   /* green   */
  --status-in-department:  199 89% 44%;   /* cyan    */
  --status-assigned:       var(--hue-brand) 91% 53%; /* blue */
  --status-maintenance:    38 92% 44%;    /* amber   */
  --status-retired:        var(--hue-brand) 8% 55%;  /* gray */

  /* ---------- Sidebar (dark anchor in BOTH themes, Docker-style) ---------- */
  --sidebar-bg:        var(--hue-brand) 30% 11%;
  --sidebar-fg:        var(--hue-brand) 15% 78%;
  --sidebar-fg-active: 0 0% 100%;
  --sidebar-item-hover: var(--hue-brand) 30% 16%;
  --sidebar-item-active: var(--hue-brand) 91% 53% / 0.18;
  --sidebar-border:    var(--hue-brand) 30% 18%;

  /* ---------- Typography ---------- */
  --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Consolas", monospace;   /* asset tags, IDs */

  --text-xs:   0.75rem;   /* 12 — meta, timestamps */
  --text-sm:   0.8125rem; /* 13 — table body, labels (Docker density) */
  --text-base: 0.875rem;  /* 14 — default UI text */
  --text-md:   1rem;      /* 16 — form inputs (prevents iOS zoom) */
  --text-lg:   1.125rem;  /* 18 — card titles */
  --text-xl:   1.375rem;  /* 22 — page titles */
  --text-2xl:  1.75rem;   /* 28 — dashboard KPI numbers */

  --leading-tight: 1.25;
  --leading-normal: 1.5;

  /* ---------- Spacing (4px scale) ---------- */
  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;     --space-5: 1.25rem; --space-6: 1.5rem;
  --space-8: 2rem;     --space-10: 2.5rem; --space-12: 3rem;

  /* ---------- Radius ---------- */
  --radius-sm: 6px;    /* inputs, badges */
  --radius-md: 8px;    /* buttons, dropdowns */
  --radius-lg: 12px;   /* cards, modals */
  --radius-full: 9999px; /* pills, avatars — HF signature */

  /* ---------- Elevation (composited, never animated) ---------- */
  --shadow-sm: 0 1px 2px hsl(var(--hue-brand) 30% 10% / 0.06);
  --shadow-md: 0 4px 12px hsl(var(--hue-brand) 30% 10% / 0.08);
  --shadow-lg: 0 12px 32px hsl(var(--hue-brand) 30% 10% / 0.14);
  --shadow-focus: 0 0 0 3px hsl(var(--primary) / 0.25);

  /* ---------- Motion ---------- */
  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast:   120ms;   /* hover, press */
  --dur-base:   180ms;   /* dropdowns, tooltips */
  --dur-slow:   260ms;   /* modals, drawers, page transitions */

  /* ---------- Layout ---------- */
  --sidebar-width: 240px;
  --sidebar-width-collapsed: 64px;
  --topbar-height: 56px;
  --bottombar-height: 64px;      /* mobile tab bar */
  --content-max: 1440px;         /* clamp on big screens */
  --touch-target: 44px;

  /* ---------- Z-index scale ---------- */
  --z-dropdown: 40; --z-sticky: 50; --z-drawer: 60;
  --z-modal: 70;    --z-toast: 80;  --z-tooltip: 90;
}

/* ---------- Dark theme ---------- */
:root[data-theme="dark"] {
  --background:        var(--hue-brand) 25% 8%;
  --surface:           var(--hue-brand) 22% 11%;
  --surface-hover:     var(--hue-brand) 22% 14%;
  --surface-sunken:    var(--hue-brand) 25% 9%;
  --border:            var(--hue-brand) 18% 19%;
  --border-strong:     var(--hue-brand) 18% 28%;

  --foreground:        var(--hue-brand) 15% 92%;
  --muted-foreground:  var(--hue-brand) 10% 62%;
  --faint-foreground:  var(--hue-brand) 8% 45%;

  --primary:           var(--hue-brand) 91% 60%;
  --primary-hover:     var(--hue-brand) 91% 66%;
  --primary-active:    var(--hue-brand) 91% 55%;

  --success: 152 55% 45%;  --warning: 38 92% 55%;
  --danger:  0 72% 58%;    --info: 199 89% 55%;

  --sidebar-bg:        var(--hue-brand) 28% 7%;
  --sidebar-border:    var(--hue-brand) 25% 14%;

  --shadow-sm: 0 1px 2px hsl(0 0% 0% / 0.3);
  --shadow-md: 0 4px 12px hsl(0 0% 0% / 0.4);
  --shadow-lg: 0 12px 32px hsl(0 0% 0% / 0.5);
}
```

---

## 3. Theme Switch — Zero Flash (FOUC-proof)

**Rule:** theme resolves *before* first paint via inline script in `index.html`, then React syncs with `useSyncExternalStore`.

```html
<!-- index.html — MUST be first thing in <head>, before any CSS -->
<script>
  (function () {
    var t = localStorage.getItem("ams-theme");
    if (t !== "light" && t !== "dark") {
      t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.dataset.theme = t;
  })();
</script>
```

```ts
// src/lib/theme.ts
type Theme = "light" | "dark";
const KEY = "ams-theme";
const listeners = new Set<() => void>();

export const themeStore = {
  get: (): Theme => (document.documentElement.dataset.theme as Theme) ?? "light",
  set(t: Theme) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(KEY, t);
    listeners.forEach((l) => l());
  },
  toggle() { themeStore.set(themeStore.get() === "dark" ? "light" : "dark"); },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

export const useTheme = () =>
  useSyncExternalStore(themeStore.subscribe, themeStore.get);
```

- Toggle lives in topbar: `Sun`/`Moon` icon button with tooltip "Switch to dark/light theme".
- Suppress transition flash on switch: add `.theme-switching { * { transition: none !important; } }` for one frame.

---

## 4. Responsive Breakpoints

| Token | Width | Layout behavior |
|---|---|---|
| `mobile` | < 640px | Bottom tab bar (5 items max), tables → cards, full-screen modals become sheets, single column forms |
| `tablet` | 640–1023 | Collapsed icon-only sidebar (64px) with tooltips, 2-col forms, tables horizontal-scroll with sticky first column |
| `laptop` | 1024–1439 | Full sidebar (240px), standard tables |
| `desktop` | 1440–1919 | Content clamped to `--content-max`, extra whitespace |
| `big` | ≥ 1920 | Content stays clamped + centered; dashboards may use 4-col KPI grid |

Rules:
- **Never** hide functionality on mobile — relocate it (overflow `⋯` menu, bottom sheet).
- All interactive elements ≥ `--touch-target` (44px) on mobile.
- `--text-md` (16px) on all inputs — prevents iOS auto-zoom.
- Table → Card transform at `< 640px`: each row becomes a card with label/value pairs; primary action becomes full-width button at card bottom.

---

## 5. Layout Anatomy (Docker Desktop pattern)

```
┌──────────┬─────────────────────────────────────────┐
│          │  Topbar (56px): breadcrumb · search ·   │
│  Dark    │  theme toggle · user avatar             │
│  Sidebar ├─────────────────────────────────────────┤
│  (240px) │                                         │
│          │  Content (bg: --background)             │
│  logo    │   ┌───────────────────────────────┐     │
│  nav     │   │ Page header: title + primary  │     │
│  items   │   │ action button (top-right)     │     │
│  ...     │   ├───────────────────────────────┤     │
│          │   │ Cards / tables on --surface   │     │
│  ────    │   └───────────────────────────────┘     │
│  settings│                                         │
└──────────┴─────────────────────────────────────────┘
```

- Sidebar is **dark in both themes** (Docker signature): `--sidebar-bg`.
- Active nav item: `--sidebar-item-active` tinted bg + 3px left accent bar (`--primary`) + icon and label in `--sidebar-fg-active`.
- Sidebar nav item: icon (20px) + label, `--space-3` gap, radius `--radius-md`, hover = `--sidebar-item-hover` (bg only, `--dur-fast`).
- Mobile: sidebar removed → bottom tab bar: Dashboard, Assets, Scan (center FAB), Departments, More.

---

## 6. Buttons

| Variant | Background | Text | Use |
|---|---|---|---|
| `primary` | `--primary` → `--primary-hover` | `--primary-foreground` | One per view. "Add asset", "Save changes" |
| `secondary` | `--surface` + `--border` | `--foreground` | "Cancel", secondary actions |
| `ghost` | transparent → `--surface-hover` | `--muted-foreground` | Toolbars, icon buttons |
| `danger` | `--danger` | white | "Delete asset" — always behind confirm dialog |
| `soft` | `--primary-soft` | `--primary` | HF-style tinted chips/actions ("View QR") |

Anatomy & motion:
```css
.btn {
  height: 36px;                       /* 44px on mobile */
  padding-inline: var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  display: inline-flex; align-items: center; gap: var(--space-2);
  transition: background-color var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.btn:hover  { /* bg swap only */ }
.btn:active { transform: scale(0.97); }     /* GPU press — never height */
.btn:focus-visible { box-shadow: var(--shadow-focus); outline: none; }
.btn[data-loading] { pointer-events: none; }
.btn[data-loading] .btn-icon { display: none; }
.btn[data-loading]::before { /* 14px spinner, currentColor */ }
```

- Loading button keeps its **width** (reserve with `min-width`) — no layout shift.
- Icon (16px) always left of label. Destructive buttons: icon + label mandatory.

---

## 7. Loaders — Zero-Lag Contract

| Wait time | Response |
|---|---|
| < 200 ms | Nothing. Showing a loader here *causes* perceived lag. |
| 200 ms – 1 s | **Skeleton** in-place (shimmer via `transform: translateX` on gradient overlay). |
| > 1 s | Skeleton + top progress bar (2px, `--primary`, indeterminate). |
| Mutation in flight | Button spinner (§6) + disable form. Optimistic update where safe (TanStack Query). |

```css
.skeleton {
  background: hsl(var(--surface-sunken));
  border-radius: var(--radius-sm);
  overflow: hidden; position: relative;
}
.skeleton::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent,
              hsl(var(--foreground) / 0.05), transparent);
  animation: shimmer 1.4s var(--ease-inout) infinite;
}
@keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
```

- Skeletons mirror real layout (table rows = row skeletons, cards = card skeletons). Never a centered lone spinner on full pages.
- Every TanStack Query screen renders exactly one of: `skeleton | error | empty | data`.

---

## 8. Hover & Micro-interactions

| Element | Hover | Duration |
|---|---|---|
| Table row | bg → `--surface-hover`; row actions (`⋯`, QR, edit icons) fade in `opacity 0→1` | `--dur-fast` |
| Card | `transform: translateY(-2px)` + `--shadow-md` (shadow pre-rendered on pseudo-element, opacity-animated) | `--dur-base` |
| Nav item | bg swap only | `--dur-fast` |
| Icon button | bg circle fade-in + icon `--muted-foreground → --foreground` | `--dur-fast` |
| Link | color → `--primary`, underline appears | `--dur-fast` |
| Tooltip | show after 400ms hover intent; `opacity + translateY(4px→0)` | `--dur-base` |

Global rule: `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition-duration: 0.01ms !important; } }`

---

## 9. Toasts (sonner)

| Type | Icon | Duration | Placement |
|---|---|---|---|
| success | `CheckCircle2` | 3.5 s | bottom-right (desktop), top-center (mobile) |
| error | `XCircle` | **sticky** until dismissed | same |
| warning | `AlertTriangle` | 5 s | same |
| info | `Info` | 4 s | same |

- Copy mirrors the action verb: "Publish" button → "Asset published" toast.
- Error toasts include a plain-English fix hint + optional "Retry" action.
- Max 3 stacked; older collapse.
- Style via tokens: `--surface`, `--radius-lg`, `--shadow-lg`, semantic left border 3px.

---

## 10. Icon Registry (lucide-react) — one icon = one meaning

| Meaning | Icon | Forbidden alternatives |
|---|---|---|
| Dashboard | `LayoutDashboard` | `Home`, `Gauge` |
| Assets | `Package` | `Box`, `Archive` |
| Departments | `Building2` | `Landmark`, `Factory` |
| Employees | `Users` | `User`, `Contact` |
| Assign | `UserPlus` | `ArrowRight`, `Send` |
| Return | `Undo2` | `ArrowLeft`, `CornerUpLeft` |
| QR / Scan | `QrCode` / `ScanLine` | `Camera`, `Maximize` |
| Edit | `Pencil` | `Edit3`, `PenSquare` |
| Delete | `Trash2` | `X`, `Minus` |
| View details | `Eye` | `Search`, `Info` |
| Search | `Search` | `Filter` |
| Filter | `SlidersHorizontal` | `Funnel`, `Filter` |
| Export | `Download` | `Share`, `FileDown` |
| Settings | `Settings` | `Cog`, `Wrench` |
| Theme | `Sun` / `Moon` | — |
| Audit history | `History` | `Clock`, `List` |
| Success / Error / Warn / Info | `CheckCircle2` / `XCircle` / `AlertTriangle` / `Info` | — |

Enforcement: typed `<AppIcon name="assign" />` wrapper; raw lucide imports in pages fail lint (`no-restricted-imports`).

---

## 11. Status Badges (colorblind-safe: color + icon + text)

```
● Available        pill: --status-available soft bg, CheckCircle2
● In Department    --status-in-department, Building2
● Assigned         --status-assigned, UserCheck
● Maintenance      --status-maintenance, Wrench
● Retired          --status-retired, Archive
```

- Pill: `--radius-full`, `--text-xs` 600 weight, 6px dot or 12px icon + label. Never color alone.
- Asset tags (`JMV-LAP-00001`): `--font-mono`, `--surface-sunken` chip, copy-on-click with "Copied" tooltip.

---

## 12. Forms & Inputs

- Height 40px (44 mobile), `--radius-sm`, `--border`, bg `--surface`.
- Focus: border → `--primary` + `--shadow-focus` (no layout shift).
- Error: border `--danger` + message below with `XCircle` 14px; never placeholder-as-label.
- Labels above inputs, `--text-sm` 500 weight; required = `*` in `--danger`.
- Selects/comboboxes: same anatomy; dropdown panel `--surface`, `--shadow-md`, `--radius-md`, item hover `--surface-hover`, item selected `--primary-soft` + `Check` icon.
- Destructive confirms: dialog title states the object ("Delete JMV-LAP-00001?"), body states consequence in plain English, confirm button repeats the verb ("Delete asset"), cancel is `secondary` and default-focused.

---

## 13. Tables & Cards — Four Mandatory States

Every data view implements: **loading (skeleton) · error (icon + message + Retry) · empty (icon + one-line invite + primary action) · data**.

Table spec:
- Header row: `--surface-sunken` bg, `--text-xs` uppercase 600 `--muted-foreground`, sticky on scroll.
- Body: `--text-sm`, row height 48px, zebra OFF, divider `--border`.
- Row hover reveals action icons (§8). Row click = navigate to detail; icons stop propagation.
- Pagination: bottom-right, ghost buttons, "1–20 of 143".
- Mobile (<640): table → card list; card shows tag (mono), name, status pill, department; tap = detail.

---

## 14. Modals, Drawers, Sheets

| Surface | Motion | Use |
|---|---|---|
| Modal | overlay `opacity 0→1`; panel `opacity + scale(0.96→1)`, `--dur-slow` `--ease-out` | confirms, short forms |
| Drawer (right, 480px) | `transform: translateX(100%→0)` | asset detail quick view, filters |
| Bottom sheet (mobile) | `translateY(100%→0)`, drag-to-dismiss | replaces modal & drawer < 640px |

- Overlay: `hsl(var(--hue-brand) 30% 8% / 0.5)` + `backdrop-filter: blur(2px)`.
- Focus trap, `Esc` closes, close `X` top-right (ghost icon button), scroll lock on body.

---

## 15. Performance Contract

- Animate **only** `transform`/`opacity`; `will-change` only during animation.
- Route-level `React.lazy` + skeleton fallback; charts (ECharts) lazy-loaded.
- Lists > 100 rows: virtualize (`@tanstack/react-virtual`).
- Images/QRs: explicit `width/height` (no CLS), `loading="lazy"`.
- Targets: LCP < 2.0 s, CLS < 0.05, interaction → visual feedback < 100 ms.
- Debounce search 300 ms; TanStack Query `staleTime` ≥ 30 s for reference data (categories, departments).

---

## 16. Tailwind Bridge — `tailwind.config.ts`

```ts
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        surface: { DEFAULT: "hsl(var(--surface))", hover: "hsl(var(--surface-hover))", sunken: "hsl(var(--surface-sunken))" },
        border: { DEFAULT: "hsl(var(--border))", strong: "hsl(var(--border-strong))" },
        foreground: { DEFAULT: "hsl(var(--foreground))", muted: "hsl(var(--muted-foreground))", faint: "hsl(var(--faint-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", hover: "hsl(var(--primary-hover))", active: "hsl(var(--primary-active))", foreground: "hsl(var(--primary-foreground))" },
        success: "hsl(var(--success))", warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",   info: "hsl(var(--info))",
      },
      borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
      boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)", focus: "var(--shadow-focus)" },
      fontFamily: { sans: "var(--font-sans)", mono: "var(--font-mono)" },
      transitionTimingFunction: { out: "var(--ease-out)", inout: "var(--ease-inout)" },
      transitionDuration: { fast: "120ms", base: "180ms", slow: "260ms" },
      maxWidth: { content: "var(--content-max)" },
    },
  },
};
```

Lint enforcement: stylelint `declaration-property-value-disallowed-list` bans raw hex/rgb in `src/**`; Tailwind arbitrary color values (`bg-[#...]`) banned via eslint rule.

---

## 17. Rollout Plan

1. **Phase 1 — Foundation:** `tokens.css`, theme script, Tailwind bridge, `AppIcon` wrapper, lint rules.
2. **Phase 2 — Shell:** sidebar (dark anchor), topbar, mobile bottom bar, page-header pattern.
3. **Phase 3 — Primitives:** Button, Input, Select, Badge, Skeleton, Tooltip, Toast setup.
4. **Phase 4 — Surfaces:** Table+card transform, Modal/Drawer/Sheet, four data states on every list page.
5. **Phase 5 — Polish:** hover reveals, page transitions, virtualization, Lighthouse pass per breakpoint (mobile 375, tablet 768, laptop 1280, desktop 1536, big 1920).

Definition of done per screen: zero hardcoded values · both themes verified · all 5 breakpoints verified · 4 data states present · keyboard + reduced-motion pass