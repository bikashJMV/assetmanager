/** Display copy for the dashboard diorama. Sentence case, plain verbs. */

export const DIORAMA_LABELS = {
  sectionAriaLabel: 'Office floor overview',
  wallHeading: 'Assignments and utilization',
  preparing: 'Preparing the floor plan…',
  webglUnavailable:
    'This browser cannot draw the floor plan. The numbers below are still current.',
  statsError: 'Could not load the floor numbers. Refresh the page to try again.',
  emptyFloor: 'No assets are logged yet. Add the first one to fill the floor.',
  totalAssetsLabel: 'Total assets',
  totalAssetsDelta: 'assigned right now',
  lastScanLabel: 'Last scan',
  lastScanFallbackHolder: 'Unassigned',
  utilizationLabel: 'Utilization',
  utilizationHint: 'Share of assets currently assigned',
  inStockLabel: 'In stock',
  categoryLabel: 'Top category',
  scrollHint: 'Scroll to walk the floor',
  signTitle: 'JMV',
  signSubtitle: 'ASSET MANAGER',
} as const

export const DIORAMA_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const
