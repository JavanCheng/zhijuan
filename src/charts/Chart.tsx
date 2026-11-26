import { useUiTheme } from '../appearance';
import { readUiColors } from '../theme';
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
  'var(--ui-status-info-text)', 'var(--ui-status-success-text)', 'var(--ui-status-warning-text)',
  'var(--ui-status-danger-text)', 'var(--ui-content-primary)', 'var(--ui-status-info-accent)',
  'var(--ui-status-success-accent)', 'var(--ui-status-danger-accent)',
];

export const CHART_TEXT = 'var(--ui-content-secondary)';
export const CHART_GRID = 'var(--ui-border-strong)';

export const chartTooltip = {
  backgroundColor: 'var(--ui-surface-default)',
  borderColor: 'var(--ui-border-strong)',
  borderWidth: 1,
  padding: [10, 12],
  textStyle: { color: 'var(--ui-content-primary)', fontSize: 12 },
  extraCssText: 'border-radius: var(--ui-radius-lg); box-shadow: none;',
} as const;

/** Resolve only option values that refer to semantic colors, leaving callbacks and data untouched. */
function resolveChartColors(option: EChartsCoreOption) {
  const token = /^var\(--ui-([a-z-]+)\)$/;
  const names = new Set<string>();
  function visit(value: unknown, resolve?: Record<string, string>): unknown {
    if (typeof value === 'string') {
      const match = token.exec(value);
      if (!match) return value;
      names.add(match[1]);
      return resolve?.[match[1]] ?? value;
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, resolve));
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, resolve)]));
    }
    return value;
  }
  visit(option);
  return visit(option, readUiColors([...names])) as EChartsCoreOption;
}

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
  const { dark, reduced } = useUiTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const lastOption = useRef<EChartsCoreOption | null>(null);

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
      lastOption.current = null;
    };
  }, []);

  useEffect(() => {
    const resolved = resolveChartColors(option);
    function updateTextAndColors(notMerge: boolean) {
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-body').trim();
      chartRef.current?.setOption({
        color: Object.values(readUiColors(CHART_COLORS.map((color) => color.slice('var(--ui-'.length, -1)))),
        ...resolved,
        textStyle: { fontFamily, ...resolved.textStyle },
        animation: !reduced && (resolved.animation ?? false),
      }, { notMerge });
    }
    updateTextAndColors(lastOption.current !== option);
    lastOption.current = option;
    const observer = new MutationObserver(() => updateTextAndColors(false));
    observer.observe(document.documentElement, { attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, [option, dark, reduced]);

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
