export const ANALYTICS_LABELS = {
  pageTitle: 'Asset Analytics Report',
  pageSubtitle: 'Operational asset and employee metrics across the organization.',
  generatedPrefix: 'Generated',

  cumulative: {
    title: 'Cumulative Assets Over Time',
    subtitle: 'Total inventory growth by acquisition month',
    yAxis: 'Total assets',
    series: 'Cumulative assets',
    empty: 'No purchase-date history to plot.',
  },
  heatmap: {
    title: 'Monthly Acquisition Activity',
    subtitle: 'Assets acquired per month, by year',
    empty: 'No monthly acquisition data.',
    legendLow: 'Fewer',
    legendHigh: 'More',
  },
  yearly: {
    title: 'Assets Acquired Per Year',
    subtitle: 'Acquisition volume grouped by year',
    xAxis: 'Assets acquired',
    empty: 'No yearly acquisition data.',
  },
  distribution: {
    title: 'Asset Distribution by Category',
    subtitle: 'Current inventory grouped by category',
    yAxis: 'Assets',
    empty: 'No category data available.',
  },
  warranty: {
    title: 'Warranty Coverage',
    subtitle: 'Asset age vs. warranty length, with trend',
    xAxis: 'Asset age (days)',
    yAxis: 'Warranty length (days)',
    points: 'Assets',
    trend: 'Trend',
    empty: 'No assets with both purchase and warranty dates.',
  },
  rolling: {
    title: 'Rolling Assignment Activity',
    subtitle: 'Monthly assignments with 6-month rolling average',
    yAxis: 'Assignments',
    monthly: 'Monthly assignments',
    rolling: '6-month average',
    empty: 'No assignment history to plot.',
  },
  inStockByLocation: {
    title: 'In-Stock Assets by Location',
    subtitle: 'Available inventory per stock location, broken down by category',
    yAxis: 'In-stock assets',
    tooltipTotal: 'In stock',
    tooltipBreakdown: 'Categories',
    expandHint: 'Select a bar to list its categories',
    empty: 'No assets are currently in stock.',
  },
} as const

export const ROLLING_WINDOW_MONTHS = 6
