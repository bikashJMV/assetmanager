export { DASHBOARD_SECTIONS } from './dashboardLabels'

export const CHART_LABELS = {
  category: {
    title: 'Assets by category',
    subtitle: 'Largest categories first.',
    seriesName: 'Assets',
    empty: 'No categories to chart yet.',
  },
  status: {
    title: 'Status mix',
    subtitle: 'Where every asset currently sits.',
    empty: 'No status data yet.',
  },
  trend: {
    title: 'Assignments per month',
    subtitle: 'How often assets change hands.',
    seriesName: 'Assignments',
    empty: 'Not enough history to chart yet.',
  },
  error: 'Could not load the analytics charts.',
} as const
