import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
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
  const [filter, setFilter] = useState<'all' | 'review'>('all');
  const [classFilter, setClassFilter] = useState<number | 'all'>('all');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async (isCurrent: () => boolean = () => true, reportFailure = true) => {
    try {
      const [detail, subs] = await Promise.all([
        api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`),
        api<SubmissionRow[]>(`/api/teacher/exams/${examId}/submissions`),
      ]);
      if (!isCurrent()) return;
      setExam(detail);
      setRows(subs);
      setLoadFailed(false);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadFailed(true);
      if (reportFailure) void message.error({ key: 'teacher-grading-load', content: err instanceof Error ? err.message : '加载失败' });
    }
  }, [message, examId]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(() => active, false);
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);

  const classOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows ?? []) {
      if (row.classId != null) seen.set(row.classId, row.className ?? `班级 ${row.classId}`);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const submitted = list.filter((row) => row.status !== 'in_progress');
    const graded = list.filter((row) => row.status === 'graded');
    const review = submitted.filter((row) => row.needsReview > 0);
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
      if (filter === 'review' && row.needsReview === 0) return false;
      if (classFilter !== 'all' && row.classId !== classFilter) return false;
      if (text && !row.studentName.includes(text) && !row.studentNo.includes(text)) return false;
      return true;
    });
  }, [rows, filter, classFilter, keyword]);

  function confirmAuto() {
    modal.confirm({
      title: '确认全部自动分',
      content: '把所有「未人工改分」的题目按自动评分结果确认为最终分？已人工改过的分数不会被覆盖。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setBusy(true);
        try {
          await post(`/api/teacher/exams/${examId}/confirm-auto`);
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
    modal.confirm({
      title: next ? '发布成绩' : '撤回成绩',
      content: next ? '发布后学生即可看到各题得分与解析，确定发布吗？' : '确定撤回已发布的成绩吗？',
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
    { title: '状态', dataIndex: 'status', width: 108, render: (_, row) => <SubmissionStatusTag status={row.status} /> },
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
      render: (_, row) => (
        <Button
          size="small"
          type="link"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/teacher/submission/${row.id}`);
          }}
        >
          批改
        </Button>
      ),
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
          hint={`共 ${exam.questionCount} 题 · 满分 ${scoreText(exam.totalScore)}`}
        />
        <StatCard
          label="自动评分完成"
          value={stats.graded}
          suffix="人"
          icon={<CheckCircleOutlined />}
          tone="green"
          hint={stats.submitted ? `完成率 ${Math.round((stats.graded / stats.submitted) * 100)}%` : '等待学生提交'}
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

      <Card className="mb-4" styles={{ body: { padding: '14px 16px' } }}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented className="max-w-full overflow-x-auto"
            value={filter}
            onChange={(value) => setFilter(value as 'all' | 'review')}
            options={[
              { label: `全部（${rows.length}）`, value: 'all' },
              { label: `需校准（${stats.review}）`, value: 'review' },
            ]}
          />
          <Select
            value={classFilter}
            onChange={setClassFilter}
            style={{ width: 150, maxWidth: '100%' }}
            options={[{ value: 'all', label: '全部班级' }, ...classOptions]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined className="text-ui-tertiary" />}
            placeholder="搜索姓名或学号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 220, maxWidth: '100%' }}
          />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto text-[11.5px] text-ui-tertiary">
            <span>筛选结果 {visible.length} 份</span>
            {classFilter !== 'all' || keyword ? (
              <Button
                size="small"
                type="text"
                onClick={() => {
                  setClassFilter('all');
                  setKeyword('');
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
            onClick: () => navigate(`/teacher/submission/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </Page>
  );
}
