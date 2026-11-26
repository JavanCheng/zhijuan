import './analytics.css';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  App as AntApp,
  Button,
  Progress,
  Select,
  Skeleton,
  Table,
  Tabs,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  BarChartOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FallOutlined,
  ReloadOutlined,
  RiseOutlined,
  StarOutlined,
  TeamOutlined,
  TrophyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { api } from '../../api';
import type {
  AnalyticsMeta,
  AnalyticsPayload,
  ClassAnalytics,
  QuestionAnalytics,
  StudentAnalytics,
} from '../../../shared/types';
import { QUESTION_TYPE_LABEL } from '../../../shared/types';
import {
  EmptyState,
  Page,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  TypeTag,
} from '../../ui';
import { scoreText } from '../../format';
import { CHART_COLORS, Chart, axisLabel, chartTooltip, splitLine } from '../../charts/Chart';
import { StudentProfileDrawer } from './StudentProfileDrawer';
import { filteredAnalyticsCsv } from './analytics-csv';

const { Text } = Typography;

const BUCKET_COLORS = ['var(--ui-status-danger-accent)', 'var(--ui-status-warning-accent)', 'var(--ui-content-secondary)', 'var(--ui-status-info-accent)', 'var(--ui-status-success-accent)'];

const shortTitle = (title: string, max = 8) => (title.length > max ? `${title.slice(0, max)}…` : title);
const percent = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 1000) / 10 : 0);
const parseIds = (value: string | null): number[] =>
  (value ?? '')
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

function rateColor(rate: number, kind: 'accent' | 'text' = 'accent'): string {
  if (rate >= 85) return `var(--ui-status-success-${kind})`;
  if (rate >= 70) return `var(--ui-status-info-${kind})`;
  if (rate >= 60) return `var(--ui-status-warning-${kind})`;
  return `var(--ui-status-danger-${kind})`;
}

function rankBadge(rank: number) {
  return <span className={`rank-badge ${rank <= 3 ? 'is-top' : ''}`}>{rank}</span>;
}

function buildInsights(data: AnalyticsPayload): Array<{ icon: ReactNode; text: string }> {
  const items: Array<{ icon: ReactNode; text: string }> = [];
  const classes = data.classes.filter((item) => item.participants > 0);
  if (classes.length > 1) {
    const sorted = [...classes].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = Math.round((best.avg - worst.avg) * 10) / 10;
    items.push({
      icon: <TrophyOutlined />,
      text: `${best.name} 平均分最高（${scoreText(best.avg)} 分），与最低的 ${worst.name} 相差 ${gap} 分，可结合班级对比页定位差距。`,
    });
  }

  const weak = [...data.questions].sort((a, b) => a.scoreRate - b.scoreRate)[0];
  if (weak) {
    items.push({
      icon: <WarningOutlined />,
      text:
        weak.scoreRate < 75
          ? `第 ${weak.seq} 题（${QUESTION_TYPE_LABEL[weak.type]}）得分率仅 ${weak.scoreRate}%，是本次最需要讲评的题目。`
          : `第 ${weak.seq} 题得分率最低（${weak.scoreRate}%），整体掌握仍然较好，可做针对性巩固。`,
    });
  }

  if (data.trend.length >= 2) {
    const current = data.trend[data.trend.length - 1];
    const previous = data.trend[data.trend.length - 2];
    const delta = Math.round((current.avg - previous.avg) * 10) / 10;
    items.push({
      icon: delta >= 0 ? <RiseOutlined /> : <FallOutlined />,
      text: `与上一场相比，平均得分率${delta >= 0 ? '提升' : '下降'} ${Math.abs(delta)} 个百分点（${previous.avg}% → ${current.avg}%）。`,
    });
  } else if (data.kpi.submitRate < 100) {
    items.push({
      icon: <TeamOutlined />,
      text: `当前有 ${data.kpi.participants} 人纳入统计，尚未评分的答卷不会计入这些图表。`,
    });
  }

  if (!items.length) {
    items.push({
      icon: <CheckCircleOutlined />,
      text: `本次共 ${data.kpi.participants} 人参考，平均得分率 ${percent(data.kpi.avg, data.exam.totalScore)}%，可在班级对比与学生对比中继续下钻。`,
    });
  }
  return items.slice(0, 3);
}

export function TeacherAnalytics() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();

  const [meta, setMeta] = useState<AnalyticsMeta | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [dataQuery, setDataQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaFailed, setMetaFailed] = useState(false);
  const [dataFailed, setDataFailed] = useState(false);
  const [tab, setTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [profileId, setProfileId] = useState<number | null>(null);

  const classIds = useMemo(() => parseIds(searchParams.get('classIds')), [searchParams]);
  const studentIds = useMemo(() => parseIds(searchParams.get('studentIds')), [searchParams]);

  useEffect(() => {
    let alive = true;
    api<AnalyticsMeta>('/api/teacher/analytics/meta')
      .then((result) => {
        if (!alive) return;
        setMeta(result);
        setMetaFailed(false);
      })
      .catch((err) => {
        if (!alive) return;
        setMetaFailed(true);
        void message.error({ key: 'teacher-analytics-meta-load', content: err instanceof Error ? err.message : '加载失败' });
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, message]);

  useEffect(() => {
    if (!meta) return;
    if (!meta.exams.length) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api<AnalyticsPayload>(`/api/teacher/analytics${queryString ? `?${queryString}` : ''}`)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setDataQuery(queryString);
        setDataFailed(false);
        if (!searchParams.get('examId')) {
          const next = new URLSearchParams(searchParams);
          next.set('examId', String(result.exam.id));
          setSearchParams(next, { replace: true });
        }
      })
      .catch((err) => {
        if (!alive) return;
        setDataFailed(true);
        void message.error({ key: 'teacher-analytics-data-load', content: err instanceof Error ? err.message : '加载失败' });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // searchParams 由 queryString 代表；setSearchParams 用于回填默认考试
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, queryString, refreshKey, message]);

  const updateQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  function changeExam(examId: number) {
    updateQuery({ examId: String(examId) });
  }

  function changeClasses(ids: number[]) {
    const next = new URLSearchParams(searchParams);
    if (ids.length) next.set('classIds', ids.join(','));
    else next.delete('classIds');
    const allowed = new Set(
      (meta?.students ?? [])
        .filter((student) => !ids.length || (student.classId != null && ids.includes(student.classId)))
        .map((student) => student.id),
    );
    const kept = studentIds.filter((id) => allowed.has(id));
    if (kept.length) next.set('studentIds', kept.join(','));
    else next.delete('studentIds');
    setSearchParams(next, { replace: true });
  }

  function changeStudents(ids: number[]) {
    updateQuery({ studentIds: ids.length ? ids.join(',') : null });
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const studentGroups = useMemo(() => {
    const groups = classIds.length ? (meta?.classes ?? []).filter((item) => classIds.includes(item.id)) : (meta?.classes ?? []);
    return groups
      .map((item) => ({
        label: item.name,
        options: (meta?.students ?? [])
          .filter((student) => student.classId === item.id)
          .map((student) => ({
            value: student.id,
            label: `${student.name}（${student.studentNo || '—'}）`,
          })),
      }))
      .filter((group) => group.options.length > 0);
  }, [meta, classIds]);

  const distributionOption = useMemo(() => {
    const distribution = data?.distribution ?? [];
    return {
      grid: { left: 12, right: 18, top: 26, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: distribution.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        name: '人数',
        nameTextStyle: { color: 'var(--ui-content-tertiary)', fontSize: 11, padding: [0, 0, 0, -14] },
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: [
        {
          type: 'bar',
          barWidth: '48%',
          data: distribution.map((item, index) => ({
            value: item.count,
            itemStyle: { color: BUCKET_COLORS[index], borderRadius: [7, 7, 2, 2] },
          })),
          label: { show: true, position: 'top', color: 'var(--ui-content-secondary)', fontSize: 11 },
        },
      ],
    };
  }, [data]);

  const trendOption = useMemo(() => {
    const trend = data?.trend ?? [];
    return {
      grid: { left: 10, right: 16, top: 36, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', valueFormatter: (value: number) => `${value}%` },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: 'var(--ui-content-secondary)', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: trend.map((item) => shortTitle(item.title)),
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel({ interval: 0, rotate: trend.length > 4 ? 18 : 0 }),
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: axisLabel({ formatter: '{value}%' }),
        splitLine: splitLine(),
      },
      series: [
        {
          name: '平均得分率',
          type: 'line',
          smooth: true,
          symbolSize: 7,
          data: trend.map((item) => item.avg),
          lineStyle: { width: 3, color: CHART_COLORS[0] },
          itemStyle: { color: CHART_COLORS[0] },
          areaStyle: { color: 'var(--ui-status-info-bg)' },
          label: { show: true, position: 'top', color: 'var(--ui-action-primary)', fontSize: 10.5, formatter: '{c}%' },
        },
        {
          name: '最高',
          type: 'line',
          smooth: true,
          symbolSize: 4,
          data: trend.map((item) => item.max),
          lineStyle: { width: 1.5, type: 'dashed', color: 'var(--ui-status-success-accent)' },
          itemStyle: { color: 'var(--ui-status-success-accent)' },
        },
        {
          name: '最低',
          type: 'line',
          smooth: true,
          symbolSize: 4,
          data: trend.map((item) => item.min),
          lineStyle: { width: 1.5, type: 'dashed', color: 'var(--ui-status-warning-accent)' },
          itemStyle: { color: 'var(--ui-status-warning-accent)' },
        },
      ],
    };
  }, [data]);

  const classScoreOption = useMemo(() => {
    const classes = data?.classes ?? [];
    return {
      grid: { left: 10, right: 16, top: 38, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: 'var(--ui-content-secondary)', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: classes.map((item) => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: data?.exam.totalScore ?? undefined,
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: [
        {
          name: '平均分',
          type: 'bar',
          barWidth: '38%',
          data: classes.map((item) => item.avg),
          itemStyle: { color: 'var(--ui-action-primary)', borderRadius: [7, 7, 0, 0] },
          label: { show: true, position: 'top', color: 'var(--ui-content-secondary)', fontSize: 10.5 },
        },
        {
          name: '最高分',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: classes.map((item) => item.max),
          lineStyle: { width: 1.5, type: 'dashed', color: 'var(--ui-status-success-accent)' },
          itemStyle: { color: 'var(--ui-status-success-accent)' },
        },
        {
          name: '最低分',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: classes.map((item) => item.min),
          lineStyle: { width: 1.5, type: 'dashed', color: 'var(--ui-status-warning-accent)' },
          itemStyle: { color: 'var(--ui-status-warning-accent)' },
        },
      ],
    };
  }, [data]);

  const classRateOption = useMemo(() => {
    const classes = data?.classes ?? [];
    return {
      grid: { left: 10, right: 16, top: 38, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', valueFormatter: (value: number) => `${value}%` },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: 'var(--ui-content-secondary)', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: classes.map((item) => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: axisLabel({ formatter: '{value}%' }),
        splitLine: splitLine(),
      },
      series: [
        {
          name: '及格率',
          type: 'bar',
          barWidth: '30%',
          data: classes.map((item) => item.passRate),
          itemStyle: { color: 'var(--ui-status-success-accent)', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: 'var(--ui-status-success-text)', fontSize: 10.5, formatter: '{c}%' },
        },
        {
          name: '优秀率',
          type: 'bar',
          barWidth: '30%',
          data: classes.map((item) => item.excellentRate),
          itemStyle: { color: 'var(--ui-status-warning-accent)', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: 'var(--ui-status-warning-text)', fontSize: 10.5, formatter: '{c}%' },
        },
      ],
    };
  }, [data]);

  const classDistributionOption = useMemo(() => {
    const classes = data?.classes ?? [];
    const labels = (data?.distribution ?? []).map((item) => item.label);
    return {
      grid: { left: 10, right: 16, top: 38, bottom: 26, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 8,
        textStyle: { color: 'var(--ui-content-secondary)', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: classes.map((item) => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: labels.map((label, index) => ({
        name: label,
        type: 'bar',
        stack: 'total',
        barWidth: '44%',
        data: classes.map((item) => item.buckets[index] ?? 0),
        itemStyle: {
          color: BUCKET_COLORS[index],
          borderRadius: index === labels.length - 1 ? [4, 4, 0, 0] : 0,
        },
      })),
    };
  }, [data]);

  const questionRateOption = useMemo(() => {
    const questions = data?.questions ?? [];
    return {
      grid: { left: 12, right: 48, top: 14, bottom: 8, containLabel: true },
      tooltip: {
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: number) => `${value}%`,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: axisLabel({ formatter: '{value}%' }),
        splitLine: splitLine(),
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: questions.map((item) => `第${item.seq}题`),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: axisLabel(),
      },
      series: [
        {
          type: 'bar',
          barWidth: '52%',
          data: questions.map((item) => ({
            value: item.scoreRate,
            itemStyle: { color: rateColor(item.scoreRate), borderRadius: [0, 6, 6, 0] },
          })),
          label: {
            show: true,
            position: 'right',
            color: 'var(--ui-content-secondary)',
            fontSize: 10.5,
            formatter: '{c}%',
          },
        },
      ],
    };
  }, [data]);

  const typeRadarOption = useMemo(() => {
    const items = data?.typeSummary ?? [];
    return {
      tooltip: { ...chartTooltip, valueFormatter: (value: number) => `${value}%` },
      radar: {
        center: ['50%', '54%'],
        radius: '62%',
        indicator: items.map((item) => ({ name: item.label, max: 100 })),
        axisName: { color: 'var(--ui-content-secondary)', fontSize: 11.5 },
        splitLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        splitArea: { areaStyle: { color: ['var(--ui-surface-subtle)', 'var(--ui-background-muted)'] } },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
      },
      series: [
        {
          type: 'radar',
          symbolSize: 5,
          data: [
            {
              name: '得分率',
              value: items.map((item) => item.rate),
              areaStyle: { color: 'var(--ui-status-info-bg)' },
              lineStyle: { color: 'var(--ui-status-info-accent)', width: 2 },
              itemStyle: { color: 'var(--ui-status-info-accent)' },
            },
          ],
        },
      ],
    };
  }, [data]);

  const compareStudents = useMemo(() => {
    const rows = [...(data?.students ?? [])].sort((a, b) => a.rank - b.rank);
    if (rows.length <= 8) return rows;
    if (studentIds.length) return rows.slice(0, 8);
    const indexes = Array.from({ length: 8 }, (_, index) => Math.round((index * (rows.length - 1)) / 7));
    return [...new Set(indexes)].map((index) => rows[index]).filter(Boolean);
  }, [data, studentIds]);

  const studentScoreOption = useMemo(() => {
    return {
      grid: { left: 10, right: 54, top: 26, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: compareStudents.map((student) => student.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel({ hideOverlap: true, overflow: 'truncate', width: 80 }),
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: data?.exam.totalScore ?? undefined,
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: [
        {
          type: 'bar',
          barWidth: '44%',
          data: compareStudents.map((student, index) => {
            const color = CHART_COLORS[index % CHART_COLORS.length];
            return {
              value: student.score,
              itemStyle: {
                color,
                borderRadius: [7, 7, 0, 0],
              },
            };
          }),
          label: { show: true, position: 'top', color: 'var(--ui-content-secondary)', fontSize: 10.5 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: 'var(--ui-status-warning-accent)', type: 'dashed', width: 1.5 },
            label: {
              show: true,
              position: 'insideEndTop',
              color: 'var(--ui-status-warning-text)',
              fontSize: 10,
              formatter: '平均 {c}',
              padding: [0, 0, 2, 4],
            },
            data: [{ type: 'average' }],
          },
        },
      ],
    };
  }, [compareStudents, data]);

  const studentQuestionOption = useMemo(() => {
    const questions = data?.questions ?? [];
    return {
      grid: { left: 10, right: 18, top: 38, bottom: 32, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        type: 'scroll',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: 'var(--ui-content-secondary)', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: questions.map((question) => `第${question.seq}题`),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'var(--ui-border-default)' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: compareStudents.map((student, index) => ({
        name: student.name,
        type: 'bar',
        barMaxWidth: 22,
        data: student.questionScores.map((score) => score ?? 0),
        itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length], borderRadius: [4, 4, 0, 0] },
      })),
    };
  }, [compareStudents, data]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const passCount = data ? Math.round((data.kpi.passRate / 100) * data.kpi.participants) : 0;
  const excellentCount = data ? Math.round((data.kpi.excellentRate / 100) * data.kpi.participants) : 0;
  const avgScoreRate = data ? percent(data.kpi.avg, data.exam.totalScore) : 0;

  const canExport = Boolean(data?.students.length && !loading && !dataFailed && dataQuery === queryString);

  function exportCsv() {
    if (!data || !canExport) return;
    const csv = filteredAnalyticsCsv(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.exam.title}-学情数据.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const studentColumns: TableProps<StudentAnalytics>['columns'] = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 62,
      sorter: (a, b) => a.rank - b.rank,
      defaultSortOrder: 'ascend',
      render: (value: number) => rankBadge(value),
    },
    {
      title: '学生',
      dataIndex: 'name',
      width: 150,
      render: (_, row) => (
        <div className="leading-tight [overflow-wrap:anywhere]">
          <div className="text-[13px] font-medium text-ui-primary">{row.name}</div>
          <div className="text-[10.5px] text-ui-tertiary">{row.studentNo}</div>
        </div>
      ),
    },
    {
      title: '班级',
      dataIndex: 'className',
      width: 112,
      render: (value: string | null) => (value ? <Pill tone="teal">{value}</Pill> : <Text type="secondary">—</Text>),
    },
    {
      title: '总分',
      width: 112,
      render: (_, row) => {
        const rate = percent(row.score, row.totalScore);
        return (
          <span className="font-semibold tabular-nums" style={{ color: rateColor(rate, 'text') }}>
            {scoreText(row.score)}
            <span className="ml-1 text-[11px] font-normal text-ui-tertiary">/ {scoreText(row.totalScore)}</span>
          </span>
        );
      },
    },
    {
      title: '得分率',
      width: 150,
      render: (_, row) => {
        const rate = percent(row.score, row.totalScore);
        return (
          <div className="flex items-center gap-2">
            <Progress
              percent={rate}
              showInfo={false}
              size="small"
              strokeColor={rateColor(rate)}
              trailColor="var(--ui-background-muted)"
              style={{ margin: 0, width: 76 }}
            />
            <span className="tabular-nums text-[11.5px] text-ui-secondary">{rate}%</span>
          </div>
        );
      },
    },
    {
      title: '班级排名',
      width: 96,
      render: (_, row) => (
        <span className="tabular-nums text-ui-secondary">
          {row.classRank} / {row.classSize}
        </span>
      ),
    },
    {
      title: '待校准',
      width: 90,
      render: (_, row) =>
        row.needsReview > 0 ? <Pill tone="amber">{row.needsReview} 题</Pill> : <Text type="secondary">—</Text>,
    },
    {
      title: '操作',
      width: 136,
      render: (_, row) => (
        <div className="student-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setProfileId(row.id)}>
            画像
          </Button>
          <Button size="small" type="link" onClick={() => navigate(`/teacher/submission/${row.submissionId}`)}>
            批改
          </Button>
        </div>
      ),
    },
  ];

  const classColumns: TableProps<ClassAnalytics>['columns'] = [
    {
      title: '班级',
      dataIndex: 'name',
      render: (value: string) => <span className="font-medium text-ui-primary [overflow-wrap:anywhere]">{value}</span>,
    },
    {
      title: '参评 / 人数',
      width: 110,
      render: (_, row) => (
        <span className="tabular-nums">
          {row.participants} / {row.totalStudents}
        </span>
      ),
    },
    { title: '平均分', width: 88, render: (_, row) => <span className="font-semibold tabular-nums">{scoreText(row.avg)}</span> },
    { title: '最高', width: 72, render: (_, row) => <span className="tabular-nums text-[var(--ui-status-success-text)]">{scoreText(row.max)}</span> },
    { title: '最低', width: 72, render: (_, row) => <span className="tabular-nums text-[var(--ui-status-danger-text)]">{scoreText(row.min)}</span> },
    {
      title: '及格率',
      width: 150,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Progress percent={row.passRate} showInfo={false} size="small" strokeColor="var(--ui-status-success-accent)" style={{ margin: 0, width: 72 }} />
          <span className="tabular-nums text-[11.5px]">{row.passRate}%</span>
        </div>
      ),
    },
    {
      title: '优秀率',
      width: 150,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Progress percent={row.excellentRate} showInfo={false} size="small" strokeColor="var(--ui-status-warning-accent)" style={{ margin: 0, width: 72 }} />
          <span className="tabular-nums text-[11.5px]">{row.excellentRate}%</span>
        </div>
      ),
    },
    {
      title: '',
      width: 92,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => changeClasses([row.id])}>
          只看此班
        </Button>
      ),
    },
  ];

  const questionColumns: TableProps<QuestionAnalytics>['columns'] = [
    { title: '题号', dataIndex: 'seq', width: 64, render: (value: number) => <span className="font-semibold">第 {value} 题</span> },
    { title: '题型', dataIndex: 'type', width: 82, render: (_, row) => <TypeTag type={row.type} /> },
    { title: '满分', dataIndex: 'score', width: 70, render: (value: number) => scoreText(value) },
    { title: '平均分', dataIndex: 'avgScore', width: 80, render: (value: number) => <span className="font-semibold tabular-nums">{scoreText(value)}</span> },
    {
      title: '得分率',
      width: 190,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Progress
            percent={row.scoreRate}
            showInfo={false}
            size="small"
            strokeColor={rateColor(row.scoreRate)}
            style={{ margin: 0, width: 94 }}
          />
          <span className="tabular-nums text-[11.5px]" style={{ color: rateColor(row.scoreRate, 'text') }}>
            {row.scoreRate}%
          </span>
        </div>
      ),
    },
    { title: '满分率', width: 82, render: (_, row) => <span className="tabular-nums">{row.fullRate}%</span> },
    { title: '零分率', width: 82, render: (_, row) => <span className="tabular-nums">{row.zeroRate}%</span> },
    {
      title: '作答',
      width: 86,
      render: (_, row) => (
        <span className="tabular-nums text-ui-secondary">
          {row.answered} / {data?.kpi.participants ?? 0}
        </span>
      ),
    },
  ];

  if (!meta) {
    return (
      <Page>
        <PageHeader eyebrow="Analytics" title="学情看板" subtitle="按班级与学生维度汇总成绩、定位薄弱题目。" />
        {metaFailed ? (
          <EmptyState title="学情看板暂不可用" action={<Button onClick={() => setRefreshKey((key) => key + 1)}>重试</Button>} />
        ) : (
          <div className="grid gap-4">
            <Skeleton paragraph={{ rows: 2 }} />
            <Skeleton paragraph={{ rows: 6 }} />
          </div>
        )}
      </Page>
    );
  }

  if (!meta.exams.length) {
    return (
      <Page>
        <PageHeader
          eyebrow="Analytics"
          title="学情看板"
          subtitle="发布考试并产生学生提交后，这里会自动汇总成绩与图表。"
        />
        <EmptyState
          icon={<BarChartOutlined />}
          title="还没有可分析的考试"
          description="先创建一场考试、导入题目并发布，学生提交后即可在学情看板查看班级与学生维度的图表。"
          action={
            <Button type="primary" onClick={() => navigate('/teacher')}>
              去考试管理
            </Button>
          }
        />
      </Page>
    );
  }

  const selectedExamId = Number(searchParams.get('examId')) || data?.exam.id || meta.exams[0]?.id;
  const selectedStudents = data?.students ?? [];
  const totalAllStudents = meta.students.length;

  return (
    <Page>
      <PageHeader
        eyebrow="Analytics"
        title="学情看板"
        subtitle="按考试、班级与学生维度汇总成绩；图表会随筛选实时变化，可直接用于教研汇报。"
        extra={
          <>
            <Button icon={<TeamOutlined />} onClick={() => navigate('/teacher/classes')}>
              班级管理
            </Button>
            <Button icon={<DownloadOutlined />} disabled={!canExport} onClick={exportCsv}>
              导出筛选成绩
            </Button>
          </>
        }
      />

      <div className="filter-bar mb-4">
        <div className="filter-field" style={{ minWidth: 'min(100%, 280px)', flex: '1 1 300px' }}>
          <span className="filter-label">选择考试</span>
          <Select
            value={selectedExamId}
            onChange={changeExam}
            style={{ width: '100%' }}
            options={meta.exams.map((exam) => ({
              value: exam.id,
              label: `${exam.title} · ${exam.submittedCount} 人已评`,
            }))}
          />
        </div>

        <div className="filter-field" style={{ minWidth: 'min(100%, 220px)', flex: '1 1 230px' }}>
          <span className="filter-label">班级（可多选）</span>
          <Select
            mode="multiple"
            allowClear
            value={classIds}
            onChange={changeClasses}
            maxTagCount="responsive"
            placeholder="全部班级"
            style={{ width: '100%' }}
            options={meta.classes.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>

        <div className="filter-field" style={{ minWidth: 'min(100%, 240px)', flex: '1 1 250px' }}>
          <span className="filter-label">学生（可多选对比）</span>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            value={studentIds}
            onChange={changeStudents}
            maxTagCount="responsive"
            placeholder={classIds.length ? '选择班级内的学生' : '全部学生'}
            style={{ width: '100%' }}
            options={studentGroups}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((value) => value + 1)}>
            刷新
          </Button>
          <Button type="text" onClick={resetFilters} disabled={!queryString}>
            重置
          </Button>
        </div>
      </div>

      <div className="filter-summary mb-5">
        <Pill tone="blue">{data?.classes.length ?? meta.classes.length} 个班级</Pill>
        <Pill tone="teal">{selectedStudents.length} 人纳入统计</Pill>
        <span>总体 {totalAllStudents} 人 · 及格线 60% · 优秀线 85% · 仅统计已评分答卷</span>
      </div>

      {!data && dataFailed && !loading ? (
        <EmptyState title="统计数据暂不可用" action={<Button onClick={() => setRefreshKey((key) => key + 1)}>重试</Button>} />
      ) : !data ? (
        <div className="grid gap-4">
          <Skeleton paragraph={{ rows: 2 }} />
          <Skeleton paragraph={{ rows: 8 }} />
        </div>
      ) : (
        <div className="content-reveal min-w-0" aria-busy={loading}>
          <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            <StatCard
              label="参评人数"
              value={data.kpi.participants}
              suffix={`/ ${data.kpi.expected} 人`}
              icon={<TeamOutlined />}
              tone="blue"
              hint={`提交率 ${data.kpi.submitRate}% · 平均作答 ${data.kpi.avgAnsweredRate}%`}
            />
            <StatCard
              label="平均分"
              value={data.kpi.avg}
              suffix={`/ ${scoreText(data.exam.totalScore)}`}
              icon={<BarChartOutlined />}
              tone="teal"
              hint={`得分率 ${avgScoreRate}% · 最高 ${scoreText(data.kpi.max)}`}
            />
            <StatCard
              label="及格率"
              value={data.kpi.passRate}
              suffix="%"
              icon={<CheckCircleOutlined />}
              tone="green"
              hint={`${passCount} 人达到 60%`}
            />
            <StatCard
              label="优秀率"
              value={data.kpi.excellentRate}
              suffix="%"
              icon={<StarOutlined />}
              tone="amber"
              hint={`${excellentCount} 人达到 85%`}
            />
            <StatCard
              label="最高 / 最低"
              value={scoreText(data.kpi.max)}
              suffix={`/ ${scoreText(data.kpi.min)}`}
              icon={<TrophyOutlined />}
              tone="purple"
              hint={`分差 ${scoreText(data.kpi.max - data.kpi.min)} 分`}
            />
          </div>

          {data.kpi.participants > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <strong className="text-[14px] text-ui-primary">讲评建议</strong>
              <Pill tone={data.exam.resultsPublished ? 'green' : 'amber'}>{data.exam.resultsPublished ? '成绩已发布' : '成绩未发布，数据可能变化'}</Pill>
              <Button type="link" size="small" onClick={() => setTab('questions')}>查看逐题分析</Button>
            </div>
          ) : null}
          {data.kpi.participants > 0 ? <div className="insight-strip mb-5">
            {insights.map((item, index) => (
              <div className="insight-item [overflow-wrap:anywhere]" key={index}>
                <span className="insight-icon">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div> : null}

          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'overview',
                label: '总览',
                children: (
                  <div className="grid gap-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-7">
                        <Panel
                          title="成绩分布"
                          desc={`按卷面得分率分段统计 · 共 ${data.kpi.participants} 人`}
                          extra={<Pill tone="gray">及格线 60%</Pill>}
                        >
                          <Chart option={distributionOption} height={290} ariaLabel="成绩分布柱状图" />
                        </Panel>
                      </div>
                      <div className="min-w-0 xl:col-span-5">
                        <Panel
                          title="历次考试趋势"
                          desc="最近 8 场已评考试的平均得分率变化。"
                          extra={<Pill tone="blue">{data.trend.length} 场</Pill>}
                        >
                          {data.trend.length ? (
                            <Chart option={trendOption} height={290} ariaLabel="历次考试平均得分率趋势" />
                          ) : (
                            <EmptyState title="暂无历史考试" description="再完成一场考试后即可看到趋势对比。" />
                          )}
                        </Panel>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-6">
                        <Panel title="班级平均分对比" desc="柱状为平均分，虚线为班级最高 / 最低分。">
                          <Chart option={classScoreOption} height={300} ariaLabel="班级平均分对比图" />
                        </Panel>
                      </div>
                      <div className="min-w-0 xl:col-span-6">
                        <Panel title="逐题得分率" desc="横向定位本次考试的薄弱题目，优先讲评低得分率题目。">
                          <Chart option={questionRateOption} height={300} ariaLabel="逐题得分率条形图" />
                        </Panel>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'classes',
                label: '班级对比',
                children: (
                  <div className="grid gap-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-7">
                        <Panel title="班级成绩对比" desc="平均分、最高分与最低分同图展示，快速识别班级差距。">
                          <Chart option={classScoreOption} height={320} ariaLabel="班级成绩对比图" />
                        </Panel>
                      </div>
                      <div className="min-w-0 xl:col-span-5">
                        <Panel title="及格率与优秀率" desc="按卷面 60% / 85% 计算。">
                          <Chart option={classRateOption} height={320} ariaLabel="班级及格率与优秀率对比图" />
                        </Panel>
                      </div>
                    </div>

                    <Panel title="班级分数段构成" desc="堆叠柱展示每个班级在各分数段的人数，便于观察尾部学生。">
                      <Chart option={classDistributionOption} height={300} ariaLabel="班级分数段堆叠图" />
                    </Panel>

                    <Panel title="班级明细" desc="点击「只看此班」可将整页统计切换到该班。" bodyClassName="px-0 pb-0">
                      <Table
                        rowKey="id"
                        size="middle"
                        columns={classColumns}
                        dataSource={data.classes}
                        pagination={false}
                        scroll={{ x: 860 }}
                      />
                    </Panel>
                  </div>
                ),
              },
              {
                key: 'students',
                label: '学生对比',
                children: (
                  <div className="grid gap-4">
                    <Panel
                      title="学生总分对比"
                      desc={
                        studentIds.length
                          ? `已选择 ${studentIds.length} 名学生，图表展示前 8 名所选学生的总分。`
                          : '未选择学生时展示覆盖各分数段的 8 位代表学生；可在上方筛选栏勾选学生进行对比。'
                      }
                      extra={<Pill tone="blue">{selectedStudents.length} 人</Pill>}
                    >
                      {selectedStudents.length ? (
                        <Chart option={studentScoreOption} height={300} ariaLabel="学生总分对比柱状图" />
                      ) : (
                        <EmptyState title="没有符合条件的学生" description="调整班级或学生筛选后再试。" />
                      )}
                    </Panel>

                    <Panel
                      title="逐题得分对比"
                      desc="同一道题横向比较所选学生的得分，最多展示 8 人。"
                      extra={<Pill tone="gray">最多 8 人</Pill>}
                    >
                      {selectedStudents.length ? (
                        <Chart option={studentQuestionOption} height={330} ariaLabel="学生逐题得分对比图" />
                      ) : (
                        <EmptyState title="暂无可对比数据" />
                      )}
                    </Panel>

                    <Panel
                      title="学生成绩明细"
                      desc="点击任意一行查看学生画像；也可直接进入单份批改。"
                      extra={<Text type="secondary" style={{ fontSize: 11.5 }}>共 {selectedStudents.length} 人</Text>}
                      bodyClassName="px-0 pb-0"
                    >
                      <Table
                        rowKey="id"
                        size="middle"
                        columns={studentColumns}
                        dataSource={selectedStudents}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        scroll={{ x: 900 }}
                        onRow={(record) => ({
                          onClick: () => setProfileId(record.id),
                          style: { cursor: 'pointer' },
                        })}
                      />
                    </Panel>
                  </div>
                ),
              },
              {
                key: 'questions',
                label: '逐题分析',
                children: (
                  <div className="grid gap-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-7">
                        <Panel title="题目得分率" desc="颜色越偏红表示得分率越低，优先安排讲评。">
                          <Chart option={questionRateOption} height={340} ariaLabel="逐题得分率条形图" />
                        </Panel>
                      </div>
                      <div className="min-w-0 xl:col-span-5">
                        <Panel title="题型得分率" desc="按题型汇总的得分率雷达图，观察能力结构。">
                          <Chart option={typeRadarOption} height={340} ariaLabel="题型得分率雷达图" />
                        </Panel>
                      </div>
                    </div>

                    <Panel title="题目明细" desc="满分率与零分率用于识别「都会」与「都不会」的题目。" bodyClassName="px-0 pb-0">
                      <Table
                        rowKey="id"
                        size="middle"
                        columns={questionColumns}
                        dataSource={data.questions}
                        pagination={false}
                        scroll={{ x: 820 }}
                      />
                    </Panel>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      <StudentProfileDrawer studentId={profileId} open={profileId != null} onClose={() => setProfileId(null)} />
    </Page>
  );
}
