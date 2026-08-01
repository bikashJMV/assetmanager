
## 2026-07-19 — Light-mode sidebar break + filter toggle + role badge blue
### Done
- Filter dropdowns (Asset status/category, Employee status/department/role): re-clicking the
  selected option now DESELECTS (resets to neutral/All). Added `deselectValue` prop threaded
  FilterSelect → FilterSelectMenu; wired in AssetsFilterPopup + Employee.tsx.
- Role badge: `--role-it-ops` violet (259) → system steel-blue (212) in all 3 theme blocks
  (light/dark/media). Admin stays brand blue; the two remain distinguishable.
- Light-mode sidebar break: icon chips rendered white in light mode. Cause: `bg-surface/90`
  (Tailwind opacity variant) resolves to `--surface-t`, but `.ams-sidebar` only re-scoped the
  legacy `--surface`. Fixed by also overriding the Tailwind tokens (`--surface-t`, `--border-t`,
  `--foreground`, `--muted-foreground`, `--background`, `--surface-hover/-sunken`, `--border-strong`,
  `--faint-foreground`) to dark-sidebar raw HSL triplets in `.ams-sidebar`.
### Verification
- cd Client && npm run build: PASS
- e2e assets.spec.ts "inventory-status filter deselects…": PASS
- Visual (Playwright light-mode capture): sidebar chips dark + glyphs visible; profile role badge blue
### Next
- it_ops role badge blue confirmed by build only (no it_ops login handy); admin blue verified visually.
### Notes
- Not committed (standing no-commit rule). FilterSelect 197→200 (≤200 OK). Employee.tsx 1408→1411
  (pre-existing >200 debt file, deferred to Phase 4 split).
