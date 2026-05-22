import { useEffect } from 'react'
import type { ECharts } from 'echarts'

export function useChartResize(
  chartRef: React.MutableRefObject<ECharts | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [chartRef, containerRef])
}
