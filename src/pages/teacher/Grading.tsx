import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Input,
  Progress,
  Segmented,
  Select,
  Spin,
  Table,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { api, post } from '../../api';
import type { ExamDetailTeacher, SubmissionRow } from '../../../shared/types';
import { EmptyState, ExamStatusTag, Page, PageHeader, Pill, StatCard, SubmissionStatusTag } from '../../ui';
import { formatDate, scoreText } from '../../format';

const { Text } = Typography;

function scoreColor(score: number | null, total: number): string | undefined {
  if (score == null || total <= 0) return undefined;
  const rate = (score / total) * 100;
  if (rate >= 85) return 'var(--ui-status-success-text)';
  if (rate < 60) return 'var(--ui-status-danger-text)';
  return undefined;
}

export function TeacherGrading() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useSearchParams();
  const filter = query.get('queue') === 'review' ? 'review' : query.get('queue') === 'failed' ? 'failed' : 'all';
  const classFilter = Number(query.get('classId')) || 'all';
  const keyword = query.get('q') ?? '';
  const [lastSync, setLastSync] = useState<string | null>(null);
  const request = useRef(0);

  function updateQuery(values: Record<string, string | null>) {
    setQuery((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  }

  function openSubmission(row: SubmissionRow) {
    const search = query.toString();
    const reviewQueue = visible.filter((entry) => entry.status === 'graded' && entry.needsReview > 0).map((entry) => entry.id);
    navigate(`/teacher/submission/${row.id}`, { state: { gradingSearch: search ? `?${search}` : '', reviewQueue } });
  }

  const load = useCallback(async (isCurrent: () => boolean = () => true, full = true) => {
    const version = ++request.current;
    try {
      const [detail, subs] = await Promise.all([
        full ? api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`)
          : api<Pick<ExamDetailTeacher, 'status' | 'progress' | 'audience' | 'resultsPublished'>>(`/api/teacher/exams/${examId}/progress`),
        api<SubmissionRow[]>(`/api/teacher/exams/${examId}/submissions`),
      ]);
      if (!isCurrent() || version !== request.current) return;
      setExam((current) => full ? detail as ExamDetailTeacher : current && { ...current, ...detail });
      setRows(subs);
      setLoadFailed(false);
      setLastSync(new Date().toISOString());
    } catch (err) {
      if (!isCurrent() || version !== request.current) return;
      setLoadFailed(true);
      if (full) void message.error({ key: 'teacher-grading-load', content: err instanceof Error ? err.message : '加载失败' });
    }
  }, [message, examId]);

  useEffect(() => {
    setExam(null);
    setRows(null);
    let active = true;
    void load(() => active);
    return () => { active = false; request.current++; };
  }, [load]);

  const polling = exam?.status === 'published' || (exam?.progress.grading ?? 0) > 0;
  useEffect(() => {
    if (!polling) return;
    let active = true;
    let timer: number;
    async function tick() {
      if (document.visibilityState === 'visible') await load(() => active, false);
      if (active) timer = window.setTimeout(() => void tick(), 3500);
    }
    timer = window.setTimeout(() => void tick(), 3500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load, polling]);
  const classOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows ?? []) {
      if (row.classId != null) seen.set(row.classId, row.className ?? `班级 ${row.classId}`);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const submitted = list.filter((row) => row.status !== 'in_progress' && row.status !== 'discarded');
    const graded = list.filter((row) => row.status === 'graded');
    const review = graded.filter((row) => row.needsReview > 0);
    const avg = graded.length
      ? Math.round((graded.reduce((sum, row) => sum + (row.finalScore ?? row.autoScore ?? 0), 0) / graded.length) * 10) / 10
      : 0;
    const pass = exam
      ? graded.filter((row) => {
          const score = row.finalScore ?? row.autoScore ?? 0;
          return exam.totalScore > 0 && (score / exam.totalScore) * 100 >= 60;
        }).length
      : 0;
    return { submitted: submitted.length, graded: graded.length, review: review.length, avg, pass };
  }, [rows, exam]);

  const visible = useMemo(() => {
    const text = keyword.trim();
    return (rows ?? []).filter((row) => {
      if (filter === 'failed' && !row.gradingFailed) return false;
      if (filter === 'review' && (row.status !== 'graded' || row.needsReview === 0)) return false;
      if (classFilter !== 'all' && row.classId !== classFilter) return false;
      if (text && !row.studentName.includes(text) && !row.studentNo.includes(text)) return false;
      return true;
    });
  }, [rows, filter, classFilter, keyword]);

  async function confirmAuto() {
    let impact: { answerCount: number; submissionCount: number };
    try {
      impact = await api(`/api/teacher/exams/${examId}/confirm-auto`);
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '无法预览确认范围');
      return;
    }
    if (!impact.answerCount) {
      void message.info('没有可批量确认的自动评分');
      return;
    }
    modal.confirm({
      title: '确认全部自动分',
      content: `预计确认 ${impact.submissionCount} 份答卷中 ${impact.answerCount} 道无需人工复核的题。不会覆盖人工评分。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setBusy(true);
        try {
          const result = await post<{ changed: number; submissionCount: number }>(`/api/teacher/exams/${examId}/confirm-auto`);
          void message.success(`已确认 ${result.submissionCount} 份答卷、${result.changed} 道题`);
          await load();
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '操作失败');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function toggleResults() {
    if (!exam) return;
    const next = !exam.resultsPublished;
    const progress = exam.progress;
    if (next && (exam.status !== 'closed' || !progress.submitted || progress.finalized !== progress.submitted)) {
      void message.warning(exam.status !== 'closed' ? '请先结束考试' : !progress.submitted ? '没有可发布的已交卷成绩' : `还有 ${progress.grading} 份评分中、${progress.failed} 份评分异常、${progress.needsReview} 份待复核`);
      return;
    }
    modal.confirm({
      title: next ? '发布成绩' : '撤回成绩',
      content: next ? `发布 ${progress.finalized} 份成绩后，学生即可查看各题得分与解析。` : '确定撤回已发布的成绩吗？',
      okText: next ? '发布' : '撤回',
      okButtonProps: next ? undefined : { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setBusy(true);
        try {
          await post(`/api/teacher/exams/${examId}/publish-results`, { published: next });
          await load();
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '操作失败');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  if (!exam || rows === null) {
    return (
      <Page>
        {loadFailed ? <EmptyState title="批改列表暂不可用" action={<Button onClick={() => void load()}>重试</Button>} /> : <Spin />}
      </Page>
    );
  }

  const columns: TableProps<SubmissionRow>['columns'] = [
    {
      title: '学生',
      width: 150,
      render: (_, row) => (
        <div className="leading-tight [overflow-wrap:anywhere]">
          <div className="text-[13px] font-medium text-ui-primary">{row.studentName}</div>
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
    { title: '状态', dataIndex: 'status', width: 108, render: (_, row) => row.gradingFailed ? <Pill tone="red">评分异常</Pill> : <SubmissionStatusTag status={row.status} /> },
    {
      title: '作答进度',
      width: 120,
      render: (_, row) => {
        const rate = Math.round((row.answered / Math.max(1, row.questionCount)) * 100);
        return (
          <div className="flex items-center gap-2">
            <Progress percent={rate} showInfo={false} size="small" strokeColor="var(--ui-action-primary)" style={{ margin: 0, width: 56 }} />
            <span className="tabular-nums text-[11.5px] text-ui-secondary">
              {row.answered}/{row.questionCount}
            </span>
          </div>
        );
      },
    },
    {
      title: '自动分',
      width: 84,
      render: (_, row) => <span className="tabular-nums text-ui-secondary">{scoreText(row.autoScore)}</span>,
    },
    {
      title: '最终分',
      width: 96,
      render: (_, row) => (
        <span className="font-semibold tabular-nums" style={{ color: scoreColor(row.finalScore ?? row.autoScore, exam.totalScore) }}>
          {scoreText(row.finalScore ?? row.autoScore)}
          <span className="ml-1 text-[10.5px] font-normal text-ui-tertiary">/ {scoreText(exam.totalScore)}</span>
        </span>
      ),
    },
    {
      title: '待校准',
      width: 92,
      render: (_, row) =>
        row.needsReview > 0 ? <Pill tone="amber">{row.needsReview} 题</Pill> : <Text type="secondary">—</Text>,
    },
    {
      title: '提交时间',
      width: 140,
      render: (_, row) => (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {formatDate(row.submittedAt)}
        </Text>
      ),
    },
    {
      title: '',
      width: 74,
      render: (_, row) => row.gradingFailed ? (
        <Button size="small" type="link" loading={busy} onClick={async (event) => {
          event.stopPropagation();
          if (busy) return;
          setBusy(true);
          try {
            await post(`/api/teacher/submissions/${row.id}/retry-grading`);
            void message.success('已重新排队评分');
            await load();
          } catch (error) {
            void message.error(error instanceof Error ? error.message : '重试失败');
          } finally { setBusy(false); }
        }}>重新评分</Button>
      ) : row.status === 'graded' ? (
        <Button
          size="small"
          type="link"
          onClick={(event) => {
            event.stopPropagation();
            openSubmission(row);
          }}
        >
          批改
        </Button>
      ) : null,
    },
  ];

  return (
    <Page>
      <PageHeader
        back={
          <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/teacher')}>
            返回考试列表
          </Button>
        }
        eyebrow="Grading"
        title={exam.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2.5">
            <ExamStatusTag status={exam.status} />
            {exam.resultsPublished ? <Pill tone="green">成绩已发布</Pill> : null}
          </span>
        }
        extra={
          <>
            <Button icon={<BarChartOutlined />} onClick={() => navigate(`/teacher/analytics?examId=${exam.id}`)}>
              学情看板
            </Button>
            <Button onClick={() => navigate(`/teacher/exam/${exam.id}`)}>试卷详情</Button>
            <Button loading={busy} onClick={confirmAuto}>
              确认全部自动分
            </Button>
            <Button
              type={exam.resultsPublished ? 'default' : 'primary'}
              danger={exam.resultsPublished}
              loading={busy}
              onClick={toggleResults}
            >
              {exam.resultsPublished ? '撤回成绩' : '发布成绩'}
            </Button>
          </>
        }
      />


      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="已提交"
          value={stats.submitted}
          suffix="人"
          icon={<TeamOutlined />}
          tone="blue"
          hint={exam.progress.expected == null ? `共 ${exam.questionCount} 题` : `应考 ${exam.progress.expected} 人 · 未开始 ${exam.progress.notStarted} 人 · 答题中 ${exam.progress.inProgress} 人`}
        />
        <StatCard
          label="已定分"
          value={exam.progress.finalized}
          suffix="人"
          icon={<CheckCircleOutlined />}
          tone="green"
          hint={`评分中 ${exam.progress.grading} 人 · 异常 ${exam.progress.failed} 人`}
        />
        <StatCard
          label="需要人工校准"
          value={stats.review}
          suffix="人"
          icon={<ClockCircleOutlined />}
          tone={stats.review ? 'amber' : 'gray'}
          hint={stats.review ? '优先处理简答与代码题' : '暂无待校准答卷'}
        />
        <StatCard
          label="平均分"
          value={stats.avg}
          suffix={`/ ${scoreText(exam.totalScore)}`}
          icon={<TrophyOutlined />}
          tone="purple"
          hint={`${stats.pass} 人达到及格线 60%`}
        />
      </div>

      {loadFailed ? (
        <Alert className="mb-4" type="warning" showIcon title="刷新失败，仍显示上次数据"
          description={lastSync ? `上次更新：${formatDate(lastSync)}` : undefined}
          action={<Button icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} />
      ) : null}

      <Card className="mb-4" styles={{ body: { padding: '14px 16px' } }}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented className="max-w-full overflow-x-auto"
            value={filter}
            onChange={(value) => updateQuery({ queue: value === 'all' ? null : String(value) })}
            options={[
              { label: `全部（${rows.length}）`, value: 'all' },
              { label: `需校准（${stats.review}）`, value: 'review' },
              { label: `评分异常（${exam.progress.failed}）`, value: 'failed' },
            ]}
          />
          <Select
            value={classFilter}
            onChange={(value) => updateQuery({ classId: value === 'all' ? null : String(value) })}
            style={{ width: 150, maxWidth: '100%' }}
            options={[{ value: 'all', label: '全部班级' }, ...classOptions]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined className="text-ui-tertiary" />}
            placeholder="搜索姓名或学号"
            value={keyword}
            onChange={(event) => updateQuery({ q: event.target.value })}
            style={{ width: 220, maxWidth: '100%' }}
          />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto text-[11.5px] text-ui-tertiary">
            <span>筛选结果 {visible.length} 份</span>
            {classFilter !== 'all' || keyword ? (
              <Button
                size="small"
                type="text"
                onClick={() => {
                  updateQuery({ classId: null, q: null });
                }}
              >
                清除筛选
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visible}
          pagination={{
            pageSize: 12,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 份答卷`,
          }}
          scroll={{ x: 980 }}
          locale={{
            emptyText:
              rows.length === 0
                ? '还没有学生提交，发布考试后这里会自动出现答卷'
                : '当前筛选条件下没有答卷',
          }}
          onRow={(record) => ({
            onClick: record.status === 'graded' ? () => openSubmission(record) : undefined,
            style: { cursor: record.status === 'graded' ? 'pointer' : 'default' },
          })}
        />
      </Card>
    </Page>
  );
}
