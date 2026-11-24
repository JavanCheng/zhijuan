import { useEffect, useMemo, useState } from 'react';
import { Avatar, Drawer, Skeleton, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import {
  AimOutlined,
  LineChartOutlined,
  RiseOutlined,
  StarOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { api } from '../../api';
import type { StudentProfile } from '../../../shared/types';
import { Panel, Pill, StatCard } from '../../ui';
import { formatDate, scoreText } from '../../format';
import { CHART_COLORS, Chart, axisLabel, chartTooltip, splitLine } from '../../charts/Chart';

const { Text } = Typography;

const shortTitle = (title: string, max = 8) => (title.length > max ? `${title.slice(0, max)}…` : title);
const percent = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 1000) / 10 : 0);

export function StudentProfileDrawer({
  studentId,
  open,
  onClose,
}: {
  studentId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !studentId) return;
    let alive = true;
    setLoading(true);
    setError('');
    api<StudentProfile>(`/api/teacher/students/${studentId}/profile`)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, studentId]);

  useEffect(() => {
    if (!open) setProfile(null);
  }, [open]);

  const trendOption = useMemo(() => {
    const exams = [...(profile?.exams ?? [])].reverse();
    const labels = exams.map((exam) => shortTitle(exam.title));
    const studentValues = exams.map((exam) => percent(exam.score, exam.totalScore));
    const classValues = exams.map((exam) => percent(exam.classAvg, exam.totalScore));
    return {
      grid: { left: 10, right: 16, top: 34, bottom: 4, containLabel: true },
      tooltip: {
        ...chartTooltip,
        trigger: 'axis',
        valueFormatter: (value: number) => `${value}%`,
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: '#7b86a0', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e6eaf3' } },
        axisLabel: axisLabel({ interval: 0, rotate: exams.length > 4 ? 18 : 0 }),
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
          name: '个人得分率',
          type: 'line',
          smooth: true,
          symbolSize: 7,
          data: studentValues,
          lineStyle: { width: 3, color: CHART_COLORS[0] },
          itemStyle: { color: CHART_COLORS[0] },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59,99,243,.22)' },
                { offset: 1, color: 'rgba(59,99,243,.01)' },
              ],
            },
          },
          label: { show: true, position: 'top', color: '#3358e8', fontSize: 10.5, formatter: '{c}%' },
        },
        {
          name: '班级平均',
          type: 'line',
          smooth: true,
          symbolSize: 5,
          data: classValues,
          lineStyle: { width: 1.5, type: 'dashed', color: '#12b886' },
          itemStyle: { color: '#12b886' },
        },
      ],
    };
  }, [profile]);

  const questionOption = useMemo(() => {
    const latest = profile?.latest;
    if (!latest) return {};
    return {
      grid: { left: 10, right: 16, top: 34, bottom: 4, containLabel: true },
      tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: '#7b86a0', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: latest.questions.map((question) => `第${question.seq}题`),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e6eaf3' } },
        axisLabel: axisLabel(),
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: axisLabel(),
        splitLine: splitLine(),
      },
      series: [
        {
          name: '个人得分',
          type: 'bar',
          barWidth: '32%',
          data: latest.questions.map((question) => question.score),
          itemStyle: { color: CHART_COLORS[0], borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#4b5670', fontSize: 10.5 },
        },
        {
          name: '班级平均',
          type: 'bar',
          barWidth: '32%',
          data: latest.questions.map((question) => question.classAvg),
          itemStyle: { color: '#c9d7ff', borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [profile]);

  const insight = useMemo(() => {
    if (!profile?.latest) return null;
    const { latest, summary } = profile;
    const delta = percent(latest.score, latest.totalScore) - percent(latest.classAvg, latest.totalScore);
    if (summary.latestRank != null && summary.latestRank <= 3) {
      return `最近一次考试位列班级第 ${summary.latestRank} 名，保持优势的同时可以挑战更高难度的题目。`;
    }
    if (delta >= 0) {
      return `最近一次考试高出班级平均 ${delta.toFixed(1)} 个百分点，整体掌握情况良好。`;
    }
    const weakest = [...latest.questions].sort(
      (a, b) => a.score / Math.max(1, a.maxScore) - b.score / Math.max(1, b.maxScore),
    )[0];
    const typeHint = weakest ? `第 ${weakest.seq} 题（${weakest.score}/${weakest.maxScore} 分）` : '个别题目';
    return `最近一次考试低于班级平均 ${Math.abs(delta).toFixed(1)} 个百分点，建议优先复盘${typeHint}。`;
  }, [profile]);

  const columns: TableProps<StudentProfile['exams'][number]>['columns'] = [
    {
      title: '考试',
      dataIndex: 'title',
      render: (value: string) => <span className="font-medium text-[#26304a]">{value}</span>,
    },
    {
      title: '得分',
      width: 92,
      render: (_, row) => (
        <span className="font-semibold tabular-nums">
          {scoreText(row.score)}
          <Text type="secondary" style={{ fontSize: 11 }}>
            {' '}
            / {scoreText(row.totalScore)}
          </Text>
        </span>
      ),
    },
    {
      title: '得分率',
      width: 74,
      render: (_, row) => <span className="tabular-nums text-[#5b6684]">{percent(row.score, row.totalScore)}%</span>,
    },
    {
      title: '班级排名',
      width: 92,
      render: (_, row) => (
        <span className="tabular-nums text-[#5b6684]">
          {row.classRank} / {row.classSize}
        </span>
      ),
    },
    {
      title: '提交时间',
      width: 136,
      render: (_, row) => (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {formatDate(row.submittedAt)}
        </Text>
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(780px, 100vw)"
      title="学生画像"
      destroyOnHidden
      styles={{ body: { padding: 20, background: '#f7f9fd' } }}
    >
      {error ? <div className="rounded-xl bg-[#fdeeee] px-4 py-3 text-[12.5px] text-[#bf3737]">{error}</div> : null}
      {loading || !profile ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <div className="grid gap-4">
          <div className="rounded-2xl border border-[#e9ecf4] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar size={48} style={{ background: 'linear-gradient(135deg, #4f74ff, #2545c9)', fontSize: 18 }}>
                {profile.student.name.slice(0, 1)}
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[18px] font-semibold text-[#131a2b]">{profile.student.name}</span>
                  <Pill tone="teal">{profile.student.className ?? '未分班'}</Pill>
                </div>
                <div className="mt-1 text-[12px] text-[#98a1b3]">学号 {profile.student.studentNo || '—'}</div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {profile.summary.latestRank != null ? (
                  <Pill tone="amber">最近班级第 {profile.summary.latestRank} 名</Pill>
                ) : null}
                <Pill tone="blue">共参加 {profile.summary.taken} 场</Pill>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="平均得分率"
                value={profile.summary.avg}
                suffix="%"
                icon={<LineChartOutlined />}
                tone="blue"
              />
              <StatCard
                label="最佳得分率"
                value={profile.summary.best}
                suffix="%"
                icon={<TrophyOutlined />}
                tone="green"
              />
              <StatCard
                label="最近班级排名"
                value={profile.summary.latestRank ?? '—'}
                suffix={profile.summary.latestClassSize ? ` / ${profile.summary.latestClassSize}` : undefined}
                icon={<TeamOutlined />}
                tone="purple"
              />
              <StatCard
                label="与班级平均差"
                value={
                  profile.summary.latestDelta == null
                    ? '—'
                    : `${profile.summary.latestDelta > 0 ? '+' : ''}${profile.summary.latestDelta}`
                }
                suffix="pt"
                icon={profile.summary.latestDelta != null && profile.summary.latestDelta >= 0 ? <RiseOutlined /> : <AimOutlined />}
                tone={profile.summary.latestDelta != null && profile.summary.latestDelta >= 0 ? 'teal' : 'amber'}
              />
            </div>

            {insight ? (
              <div className="insight-strip mt-4">
                <div className="insight-item">
                  <span className="insight-icon">
                    <StarOutlined />
                  </span>
                  <span>{insight}</span>
                </div>
              </div>
            ) : null}
          </div>

          <Panel
            title="成绩走势"
            desc="个人得分率与班级平均对比，折线越平稳说明掌握越稳定。"
            bodyClassName="px-2 pb-2"
          >
            <Chart option={trendOption} height={240} ariaLabel="学生历次考试得分率走势" />
          </Panel>

          {profile.latest ? (
            <Panel
              title={`最近一次考试：${profile.latest.title}`}
              desc={`得分 ${scoreText(profile.latest.score)} / ${scoreText(profile.latest.totalScore)} · 班级平均 ${scoreText(
                profile.latest.classAvg,
              )}`}
              bodyClassName="px-2 pb-2"
            >
              <Chart option={questionOption} height={230} ariaLabel="最近一次考试逐题得分与班级平均" />
            </Panel>
          ) : null}

          <Panel title="考试记录" desc="按提交时间倒序排列。" bodyClassName="px-0 pb-0">
            <Table
              rowKey="examId"
              size="small"
              columns={columns}
              dataSource={profile.exams}
              pagination={false}
              scroll={{ x: 620 }}
            />
          </Panel>
        </div>
      )}
    </Drawer>
  );
}
