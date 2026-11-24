import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  PolarComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  AriaComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
  TitleComponent,
  GraphicComponent,
  PolarComponent,
  RadarComponent,
  CanvasRenderer,
]);

/** 统一图表配色，顺序与图例一致 */
export const CHART_COLORS = [
  '#3b63f3',
  '#12b886',
  '#f29d38',
  '#8b5cf6',
  '#e8590c',
  '#0ca678',
  '#d6336c',
  '#1c7ed6',
];

export const CHART_TEXT = '#6b7488';
export const CHART_GRID = '#eef1f7';

export const chartTooltip = {
  backgroundColor: 'rgba(15, 23, 42, 0.94)',
  borderWidth: 0,
  padding: [10, 12],
  textStyle: { color: '#f8fafc', fontSize: 12 },
  extraCssText: 'border-radius: 10px; box-shadow: 0 12px 32px rgba(15,23,42,.28);',
} as const;

export function axisLabel(extra: Record<string, unknown> = {}) {
  return { color: CHART_TEXT, fontSize: 11.5, ...extra };
}

export function splitLine(extra: Record<string, unknown> = {}) {
  return { lineStyle: { color: CHART_GRID, type: 'dashed' as const }, ...extra };
}

export function Chart({
  option,
  height = 300,
  className = '',
  ariaLabel,
}: {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{ width: '100%', height }}
    />
  );
}
