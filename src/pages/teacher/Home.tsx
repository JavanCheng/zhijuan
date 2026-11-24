import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Table,
  Tooltip,
} from 'antd';
import type { TableProps } from 'antd';
import {
  BarChartOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { api, del, post } from '../../api';
import type { ExamStatus, ExamSummary } from '../../../shared/types';
import { EmptyState, ExamStatusTag, Page, PageHeader, Pill } from '../../ui';
import { formatDate, scoreText } from '../../format';

type ExamRow = ExamSummary & {
  submissionCount: number;
  gradedCount: number;
  pendingCount: number;
  reviewCount: number;
};

type StatusFilter = 'all' | ExamStatus;
type SortMode = 'recent' | 'pending' | 'submissions';

interface RuntimeInfo {
  python: string | null;
  pythonSource: string;
  node: string;
}

interface CreateForm {
  title: string;
  description?: string;
  durationMin: number;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: '最近创建' },
  { value: 'pending', label: '待处理优先' },
  { value: 'submissions', label: '提交最多' },
];

function pendingBreakdown(exam: ExamRow): string {
  const parts: string[] = [];
  if (exam.pendingCount > 0) parts.push(`待批改 ${exam.pendingCount} 份`);
  if (exam.reviewCount > 0) parts.push(`待校准 ${exam.reviewCount} 份`);
  return parts.join(' · ');
}

export function TeacherHome() {
  const navigate = useNavigate();
  const { modal } = AntApp.useApp();
  const [form] = Form.useForm<CreateForm>();

  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    try {
      const data = await api<ExamRow[]>('/api/teacher/exams');
      setExams(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    api<RuntimeInfo>('/api/auth/runtime').then(setRuntime).catch(() => setRuntime(null));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, keyword, onlyPending, sortMode]);

  const counts = useMemo(() => {
    const summary = {
      all: exams?.length ?? 0,
      draft: 0,
      published: 0,
      closed: 0,
      pending: 0,
      review: 0,
      needsAction: 0,
    };
    for (const exam of exams ?? []) {
      summary[exam.status] += 1;
      summary.pending += exam.pendingCount;
      summary.review += exam.reviewCount;
      if (exam.pendingCount + exam.reviewCount > 0) summary.needsAction += 1;
    }
    return summary;
  }, [exams]);

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    const list = (exams ?? []).filter((exam) => {
      if (statusFilter !== 'all' && exam.status !== statusFilter) return false;
      if (onlyPending && exam.pendingCount + exam.reviewCount === 0) return false;
      if (text) {
        const haystack = `${exam.title} ${exam.description} #${exam.id}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortMode === 'pending') {
        const diff = b.pendingCount + b.reviewCount - (a.pendingCount + a.reviewCount);
        if (diff !== 0) return diff;
      }
      if (sortMode === 'submissions') {
        const diff = b.submissionCount - a.submissionCount;
        if (diff !== 0) return diff;
      }
      return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
    });
  }, [exams, statusFilter, keyword, onlyPending, sortMode]);

  async function createExam() {
    const values = await form.validateFields();
    setPending(true);
    try {
      const exam = await post<ExamSummary>('/api/teacher/exams', {
        title: values.title.trim(),
        description: (values.description ?? '').trim(),
        durationMin: Number(values.durationMin) || 60,
      });
      setCreating(false);
      form.resetFields();
      navigate(`/teacher/exam/${exam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function removeExam(exam: ExamRow) {
    modal.confirm({
      title: '删除考试',
      content: `确定删除「${exam.title}」吗？该操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await del(`/api/teacher/exams/${exam.id}`);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  }

  function primaryAction(exam: ExamRow) {
    if (exam.status === 'draft') {
      navigate(`/teacher/exam/${exam.id}`);
      return;
    }
    navigate(`/teacher/exam/${exam.id}/grading`);
  }

  function clearFilters() {
    setStatusFilter('all');
    setKeyword('');
    setOnlyPending(false);
  }

  const columns: TableProps<ExamRow>['columns'] = [
    {
      title: '考试',
      dataIndex: 'title',
      render: (_, exam) => (
        <div className="min-w-0">
          <Tooltip title={exam.description || undefined} placement="topLeft">
            <button
              type="button"
              className="exam-title-button"
              title={exam.title}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/teacher/exam/${exam.id}`);
              }}
            >
              {exam.title}
            </button>
          </Tooltip>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#98a1b3]">
            <span>#{exam.id}</span>
            <span className="text-[#d5dae6]">·</span>
            <span>{formatDate(exam.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 xl:hidden">
            <ExamStatusTag status={exam.status} />
            {exam.resultsPublished ? <span className="text-[10.5px] text-[#0f7a56]">成绩已发布</span> : null}
            {exam.pendingCount + exam.reviewCount > 0 ? (
              <span className="md:hidden">
                <Pill tone="amber">{exam.pendingCount + exam.reviewCount} 份待处理</Pill>
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 148,
      responsive: ['xl'],
      render: (_, exam) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <ExamStatusTag status={exam.status} />
          {exam.resultsPublished ? <span className="text-[10.5px] text-[#0f7a56]">成绩已发布</span> : null}
        </div>
      ),
    },
    {
      title: '试卷',
      width: 118,
      responsive: ['xl'],
      render: (_, exam) =>
        exam.questionCount > 0 ? (
          <Tooltip title={`考试时长 ${exam.durationMin} 分钟`}>
            <span className="text-[12.5px] text-[#26304a]">
              {exam.questionCount} 题 · {scoreText(exam.totalScore)} 分
            </span>
          </Tooltip>
        ) : (
          <span className="text-[12px] text-[#b0b7c7]">未导入题目</span>
        ),
    },
    {
      title: '已评 / 提交',
      width: 140,
      responsive: ['md'],
      render: (_, exam) => {
        if (exam.submissionCount === 0) {
          return <span className="text-[12px] text-[#b0b7c7]">暂无提交</span>;
        }
        const rate = Math.round((exam.gradedCount / exam.submissionCount) * 100);
        return (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-[12.5px] font-medium text-[#26304a]">
              {exam.gradedCount}
              <span className="font-normal text-[#b0b7c7]">/{exam.submissionCount}</span>
            </span>
            <Progress
              percent={rate}
              showInfo={false}
              size="small"
              strokeColor={rate === 100 ? '#12b886' : '#3358e8'}
              trailColor="#eef1f8"
              style={{ margin: 0, width: 56 }}
            />
          </div>
        );
      },
    },
    {
      title: '待处理',
      width: 84,
      responsive: ['md'],
      render: (_, exam) => {
        const total = exam.pendingCount + exam.reviewCount;
        if (total === 0) return <span className="text-[#c3c9d6]">—</span>;
        return (
          <Tooltip title={pendingBreakdown(exam)}>
            <Pill tone="amber">{total} 份</Pill>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      width: 164,
      align: 'right',
      render: (_, exam) => {
        const actionable = exam.pendingCount + exam.reviewCount > 0;
        return (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            <Button
              size="small"
              type={exam.status === 'draft' || actionable ? 'primary' : 'default'}
              onClick={() => primaryAction(exam)}
            >
              {exam.status === 'draft' ? '导入题目' : exam.status === 'closed' ? '成绩与批改' : '批改与出分'}
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'detail', label: '试卷详情', icon: <FileTextOutlined /> },
                  ...(exam.status === 'draft'
                    ? []
                    : [{ key: 'analytics', label: '学情看板', icon: <BarChartOutlined /> }]),
                  ...(exam.status === 'draft'
                    ? [{ type: 'divider' as const }, { key: 'delete', label: '删除考试', icon: <DeleteOutlined />, danger: true }]
                    : []),
                ],
                onClick: ({ key }) => {
                  if (key === 'detail') navigate(`/teacher/exam/${exam.id}`);
                  if (key === 'analytics') navigate(`/teacher/analytics?examId=${exam.id}`);
                  if (key === 'delete') removeExam(exam);
                },
              }}
            >
              <Button type="text" size="small" icon={<MoreOutlined />} aria-label={`${exam.title} 更多操作`} />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Exams"
        title="考试管理"
        subtitle="创建考试、导入试卷，跟踪每一场的批改进度。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建考试
          </Button>
        }
      />

      {runtime && !runtime.python ? (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message="未检测到 Python 运行时，代码题将无法评测"
          description="请查看 README 的「代码运行时」章节，或设置环境变量 PYTHON_BIN。"
        />
      ) : null}

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      {counts.pending + counts.review > 0 && !onlyPending ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#f3e2bf] bg-[#fffbf3] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff1d6] text-[15px] text-[#b87711]">
            <ClockCircleOutlined />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#7a4c0a]">
              {counts.needsAction} 场考试共 {counts.pending + counts.review} 份答卷待处理
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#9a7a45]">
              {[
                counts.pending > 0 ? `待批改 ${counts.pending} 份` : null,
                counts.review > 0 ? `待校准 ${counts.review} 份` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <Button size="small" onClick={() => setOnlyPending(true)}>
            只看待处理
          </Button>
        </div>
      ) : null}

      {exams === null ? (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileTextOutlined />}
            title="还没有考试，先新建一场吧"
            description="创建考试后导入 Word 试卷，系统会自动识别题型、答案与测试点；发布后学生即可在线作答。"
            action={
              <>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  新建考试
                </Button>
                <Button icon={<DownloadOutlined />} href="/api/template.docx" download>
                  下载题目模板
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          <Card styles={{ body: { padding: 0 } }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-[#f1f4fa] px-4 py-3">
              <div className="min-w-0 max-w-full overflow-x-auto">
                <Segmented
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={[
                    { label: `全部 ${counts.all}`, value: 'all' },
                    { label: `进行中 ${counts.published}`, value: 'published' },
                    { label: `草稿 ${counts.draft}`, value: 'draft' },
                    { label: `已结束 ${counts.closed}`, value: 'closed' },
                  ]}
                />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-[216px]">
                  <Input
                    allowClear
                    prefix={<SearchOutlined className="text-[#98a1b3]" />}
                    placeholder="搜索名称、说明或编号"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                </div>
                <Select
                  value={sortMode}
                  onChange={(value) => setSortMode(value)}
                  options={SORT_OPTIONS}
                  style={{ width: 122 }}
                  aria-label="排序方式"
                />
                <Tooltip title="只看有答卷待批改或待校准的考试">
                  <Checkbox checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)}>
                    待处理 {counts.needsAction}
                  </Checkbox>
                </Tooltip>
                <Tooltip title="刷新列表">
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    loading={refreshing}
                    onClick={() => void refresh()}
                    aria-label="刷新列表"
                  />
                </Tooltip>
              </div>
            </div>

            <Table
              rowKey="id"
              size="middle"
              tableLayout="fixed"
              columns={columns}
              dataSource={visible}
              pagination={{
                current: page,
                pageSize,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => `共 ${total} 场考试`,
                onChange: (next, size) => {
                  setPage(size === pageSize ? next : 1);
                  setPageSize(size);
                },
              }}
              locale={{
                emptyText: (
                  <div className="py-10 text-center">
                    <div className="text-[13px] font-medium text-[#26304a]">没有匹配的考试</div>
                    <div className="mt-1 text-[11.5px] text-[#98a1b3]">试试调整关键词或筛选条件</div>
                    <Button size="small" className="mt-3" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  </div>
                ),
              }}
              onRow={(exam) => ({
                onClick: () => navigate(`/teacher/exam/${exam.id}`),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </>
      )}

      <Modal
        open={creating}
        title="新建考试"
        okText="创建并继续"
        cancelText="取消"
        confirmLoading={pending}
        onOk={createExam}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <div className="mb-4 text-[13px] text-[#7b86a0]">创建后导入 Word 试卷，确认题目无误再发布给学生。</div>
        <Form form={form} layout="vertical" initialValues={{ durationMin: 60 }} requiredMark={false}>
          <Form.Item
            label="考试名称"
            name="title"
            rules={[{ required: true, message: '请填写考试名称' }, { max: 120, message: '最多 120 字' }]}
          >
            <Input placeholder="例如：高一信息科技 · 第一章单元测" autoFocus />
          </Form.Item>
          <Form.Item label="说明（可选）" name="description">
            <Input.TextArea rows={3} placeholder="考试范围、注意事项等，学生端可见" maxLength={2000} />
          </Form.Item>
          <Form.Item label="考试时长（分钟）" name="durationMin" extra="学生开始作答后倒计时，超时自动提交。">
            <InputNumber min={1} max={600} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
