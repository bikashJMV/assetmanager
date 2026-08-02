/** All dashboard display copy. Sentence case, plain verbs, no exclamation marks. */

export const DASHBOARD_SECTIONS = {
  kpi: {
    title: 'Overview',
    subtitle: 'What we own and how it is being used right now.',
  },
  actions: {
    title: 'Quick actions',
    subtitle: 'The tasks the team runs most often.',
  },
  departments: {
    title: 'Departments',
    subtitle: 'Where assets sit across the organisation.',
  },
  analytics: {
    title: 'Asset analytics',
    subtitle: 'Acquisition, mix and assignment trends.',
  },
  activity: {
    title: 'Recent activity',
    subtitle: 'The latest assets added and assigned.',
  },
  health: {
    title: 'Needs attention',
    subtitle: 'Items to act on this week.',
  },
} as const

export const KPI_LABELS = {
  totalAssets: 'Total assets',
  inStock: 'In stock',
  assigned: 'Assigned',
  activeEmployees: 'Active employees',
  warrantyExpiring: 'Warranty expiring',
  underRepair: 'Under repair',
  totalAssetsHint: 'Every asset on the books',
  inStockHint: 'Ready to hand out',
  assignedHint: 'Currently with an employee',
  activeEmployeesHint: 'People who can hold assets',
  warrantyExpiringHint: 'Cover ends within 30 days',
  underRepairHint: 'Out for maintenance',
  updatedPrefix: 'Updated',
  ofTotal: 'of all assets',
} as const

export const QUICK_ACTION_LABELS = {
  addAsset: 'Add asset',
  addAssetHint: 'Log a new item',
  assignAsset: 'Assign asset',
  assignAssetHint: 'Open the list and pick one',
  returnAsset: 'Return asset',
  returnAssetHint: 'Open the list and take it back',
  generateQr: 'Generate QR',
  generateQrHint: 'Print a batch of tags',
  bulkImport: 'Bulk import',
  bulkImportHint: 'Upload a spreadsheet',
  scanQr: 'Scan QR',
  scanQrHint: 'Open an asset by tag',
} as const

export const DEPARTMENT_LABELS = {
  totalAssets: 'Total',
  assigned: 'Assigned',
  inStock: 'In stock',
  repair: 'Repair',
  warranty: 'Warranty',
  utilization: 'Utilization',
  empty: 'No departments hold assets yet.',
  error: 'Could not load department figures.',
  capped: 'Showing the first 500 assets. Figures below cover that sample.',
} as const

export const ACTIVITY_LABELS = {
  added: 'Asset added',
  assigned: 'Asset assigned',
  empty: 'No asset activity recorded yet.',
  error: 'Could not load recent activity.',
  unassigned: 'Not assigned',
  scopeNote: 'Covers assets added and assigned. Returns are not recorded in this view.',
} as const

export const HEALTH_LABELS = {
  warrantyExpiring: 'Warranty expiring',
  warrantyExpiringHint: 'Cover ends within 30 days',
  lowStock: 'Low stock categories',
  lowStockHint: 'Fewer than three spare units',
  underRepair: 'Under repair',
  underRepairHint: 'Currently with maintenance',
  recentlyAdded: 'Added this month',
  recentlyAddedHint: 'New to the inventory',
  unassignedHolders: 'Missing an owner',
  unassignedHoldersHint: 'Assigned status, no employee on record',
  allClear: 'Nothing needs attention right now.',
  error: 'Could not load health checks.',
} as const

export const DASHBOARD_STATE_LABELS = {
  loading: 'Loading…',
  error: 'Something went wrong loading this section. Refresh the page to try again.',
  empty: 'Nothing to show yet.',
  retry: 'Refresh the page to try again.',
} as const

export const SEVERITY = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
  ok: 'ok',
} as const

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]
