# UI redesign (Notes/UI.md v2.0) — progress

Reference: `Notes/UI.md` — Docker Desktop calm density + Hugging Face warmth, one brand hue
(Docker-blue 217), token-first, both themes, fully responsive.

## Done (Phase 1 foundation + Phase 3 primitives + toast fix)

- `Client/src/styles/tokens.css` — full token system (HSL triplets), light + dark + system-dark.
  Carries a **legacy bridge**: maps old var names (`--bg`, `--surface`, `--accent`, etc.) onto the
  new tokens, so the whole app reskinned without editing every component. Orange → Docker-blue.
- `index.css` — imports Inter Variable + tokens.css + global.css (dropped theme.css; kept on disk).
- `tailwind.config.js` — semantic color/radius/shadow/font bridge (§16). Names: `bg-background`,
  `bg-surface[-hover/-sunken]`, `text-foreground[-muted/-faint]`, `bg-brand`, `border-line`,
  `sidebar-*`, `success|warning|danger|info`.
- `src/components/ui/` primitives: `AppIcon` (lucide registry, one icon = one meaning §10),
  `Button` (§6 variants + GPU press + loading), `Skeleton`/`SkeletonText`/`SkeletonRows` (§7),
  `StatusPill` (§11 colorblind-safe). Barrel: `src/components/ui/index.ts`.
- `ToastProvider` retokenized (§9): surface bg + 3px semantic left border + tinted icon chip;
  now DARK-MODE SAFE (was hardcoded light). Entrance animation opacity+translateY.
- `global.css`: `.ams-skeleton` shimmer, `.ams-toast-in`, font vars → `var(--font-sans)`,
  reduced-motion covers new animations.

Verified: `npm run build` clean, client container rebuilt, 3/3 Playwright e2e pass, screenshots
confirm blue accent + Inter in both themes.

## Next (not yet done)

- **Phase 2 shell** — the big visible spec item: DARK sidebar anchor in BOTH themes (Docker
  signature). `Sidebar.tsx` currently renders LIGHT in both (legacy bg classes). Needs component
  rewrite to `bg-sidebar` + active item = tinted bg + 3px left accent bar. Same for TopBar polish +
  mobile bottom tab bar (§5).
- **Phase 4 surfaces** — migrate list pages (AllAssets, Employee) to primitives: 4 mandatory data
  states (skeleton/error/empty/data §13), table→card at <640px, Modal/Drawer/Sheet.
- **Phase 5 polish** — hover reveals, virtualization for >100 rows, Lighthouse per breakpoint.
- Migrate components off the legacy bridge onto direct token classes; then delete `theme.css` +
  the bridge block in tokens.css.
- Lint enforcement: ban raw hex / Tailwind arbitrary colors in `src/**` (§16).

Do NOT mass-refactor — migrate pages onto primitives as each is touched.
