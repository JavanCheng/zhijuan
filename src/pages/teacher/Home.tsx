import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App as AntApp, Button, Card, Form, Input, InputNumber, Modal, Segmented, Skeleton } from 'antd';
import { DownloadOutlined, FileTextOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { api, del, post } from '../../api';
import type { ExamSummary, ExamListItemTeacher } from '../../../shared/types';
import { formatDate, scoreText } from '../../format';
import { EmptyState, ExamStatusTag, Page, PageHeader, Pill } from '../../ui';

type ExamCard = ExamListItemTeacher;

type Filter = 'all' | 'draft' | 'active' | 'action' | 'finished';
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: '全部', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '进行中', value: 'active' },
  { label: '待处理', value: 'action' },
  { label: '已结束', value: 'finished' },
];

interface CreateForm { title: string; description?: string; durationMin: number }

function needsAttention(exam: ExamCard) {
  const p = exam.progress;
  return p.failed > 0 || p.needsReview > 0 || (exam.status === 'closed' && !exam.resultsPublished && p.finalized > 0 && p.finalized === p.submitted);
}

function matchesFilter(exam: ExamCard, filter: Filter) {
  switch (filter) {
    case 'draft': return exam.status === 'draft';
    case 'active': return exam.status === 'published';
    case 'action': return needsAttention(exam);
    case 'finished': return exam.status === 'closed';
    default: return true;
  }
}

function nextAction(exam: ExamCard) {
  const detail = `/teacher/exam/${exam.id}`;
  if (exam.status === 'draft') return { label: exam.questionCount ? '检查并发布' : '导入题目', to: detail };
  if (exam.resultsPublished) return { label: '查看本场学情', to: `/teacher/analytics?examId=${exam.id}` };
  if (exam.progress.failed) return { label: '处理评分异常', to: `${detail}/grading?queue=failed` };
  if (exam.reviewCount) return { label: '继续批改', to: `${detail}/grading` };
  if (exam.status === 'published') return { label: '查看交卷', to: `${detail}/grading` };
  if (exam.pendingCount) return { label: '查看评分进度', to: `${detail}/grading` };
  return { label: exam.gradedCount ? '检查并发布成绩' : '查看交卷', to: `${detail}/grading` };
}

export function TeacherHome() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get('status');
  const filter = FILTERS.find((option) => option.value === rawFilter)?.value ?? 'all';
  const keyword = params.get('q') ?? '';
  const { message, modal } = AntApp.useApp();
  const [form] = Form.useForm<CreateForm>();
  const [exams, setExams] = useState<ExamCard[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const returnTo = `/teacher${params.size ? `?${params}` : ''}`;

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    try {
      const data = await api<ExamCard[]>('/api/teacher/exams');
      if (!isCurrent()) return;
      setExams(data);
      setLoadFailed(false);
    } catch {
      if (isCurrent()) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  const sorted = useMemo(() => {
    const rank = (exam: ExamCard) => needsAttention(exam) ? 0 : exam.status === 'published' ? 1 : exam.status === 'draft' ? 2 : 3;
    return [...(exams ?? [])].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }, [exams]);
  const query = keyword.trim().toLocaleLowerCase();
  const visible = sorted.filter((exam) => matchesFilter(exam, filter) && exam.title.toLocaleLowerCase().includes(query));

  function updateFilter(key: 'status' | 'q', value: string) {
    const next = new URLSearchParams(params);
    if (!value || (key === 'status' && value === 'all')) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  async function createExam() {
    if (pending) return;
    let values: CreateForm;
    try { values = await form.validateFields(); } catch { return; }
    setPending(true);
    try {
      const exam = await post<ExamSummary>('/api/teacher/exams', {
        title: values.title.trim(),
        description: (values.description ?? '').trim(),
        durationMin: Number(values.durationMin) || 60,
      });
      setCreating(false);
      form.resetFields();
      navigate(`/teacher/exam/${exam.id}`, { state: { returnTo } });
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setPending(false);
    }
  }

  function removeExam(exam: ExamCard) {
    modal.confirm({
      title: '删除草稿',
      content: `确定删除「${exam.title}」及其题目吗？该操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await del(`/api/teacher/exams/${exam.id}`);
          setExams((old) => old?.filter((entry) => entry.id !== exam.id) ?? null);
          void message.success('考试草稿已删除');
          await load();
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '删除失败');
          throw err;
        }
      },
    });
  }

  return (
    <Page className="max-w-[1260px]">
      <PageHeader title="考试管理" subtitle="查看每场考试的进度，并继续当前需要完成的工作。"
        extra={<Button type="primary" aria-label="新建考试" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建考试</Button>} />
      {exams ? (
        <Card className="mb-4" styles={{ body: { padding: '12px 16px' } }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<Filter> className="max-w-full overflow-x-auto" aria-label="考试状态" value={filter} options={FILTERS.map(({ label, value }) => ({
              value, label: `${label} ${sorted.filter((exam) => matchesFilter(exam, value)).length}`,
            }))} onChange={(value) => updateFilter('status', value)} />
            <Input className="!w-full sm:!w-[240px]" prefix={<SearchOutlined aria-hidden />} aria-label="搜索考试标题" placeholder="搜索考试标题" allowClear value={keyword} onChange={(event) => updateFilter('q', event.target.value)} />
          </div>
        </Card>
      ) : null}
      {loadFailed && exams ? <Alert className="mb-4" type="warning" showIcon title="加载失败，仍显示上次读取的考试" action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : null}
      {exams === null && loadFailed ? (
        <EmptyState title="考试列表暂不可用" action={<Button onClick={() => void load()}>重试</Button>} />
      ) : exams === null ? <Skeleton active paragraph={{ rows: 6 }} /> : exams.length === 0 ? (
        <Card><EmptyState icon={<FileTextOutlined />} title="还没有考试"
          description="创建考试后导入 Word 试卷，再选择发放范围。"
          action={<Button icon={<DownloadOutlined />} href="/api/template.docx" download>下载题目模板</Button>} /></Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState title="没有匹配的考试" description="试试其他标题或考试状态。"
          action={<Button onClick={() => { const next = new URLSearchParams(params); next.delete('status'); next.delete('q'); setParams(next, { replace: true }); }}>清除筛选</Button>} /></Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((exam) => {
            const action = nextAction(exam);
            const detail = `/teacher/exam/${exam.id}`;
            return (
              <Card key={exam.id} styles={{ body: { padding: '14px 16px' } }}>
                <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <h2 className="m-0 text-[15px] font-semibold [overflow-wrap:anywhere]"><Link to={detail} state={{ returnTo }}>{exam.title}</Link></h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <ExamStatusTag status={exam.status} />
                      {exam.resultsPublished ? <Pill tone="green">成绩已发布</Pill> : null}
                      <span className="text-xs text-ui-tertiary">{formatDate(exam.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-xs leading-6 text-ui-secondary">
                    <div>{exam.questionCount} 题 · {scoreText(exam.totalScore)} 分 · {exam.durationMin} 分钟</div>
                    {exam.status !== 'draft' ? <div className="flex flex-wrap gap-x-3">
                      <span>已评分 {exam.gradedCount} 份</span>
                      {exam.pendingCount ? <span>评分中 {exam.pendingCount} 份</span> : null}
                      {exam.reviewCount ? <span className="text-ui-warning-text">待复核 {exam.reviewCount} 份</span> : null}
                    </div> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {action.to !== detail ? <Button size="small" onClick={() => navigate(detail, { state: { returnTo } })}>试卷预览</Button> : null}
                    {exam.status === 'draft' ? <Button size="small" type="text" danger onClick={() => removeExam(exam)}>删除</Button> : null}
                    <Button size="small" type="primary" onClick={() => navigate(action.to, { state: { returnTo } })}>{action.label}</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={creating} width={610} title="新建考试" okText="保存草稿并导入试卷" cancelText="取消"
        confirmLoading={pending} onOk={createExam} onCancel={() => { if (!pending) setCreating(false); }}
        mask={{ closable: !pending }} keyboard={!pending} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ durationMin: 60 }} requiredMark={false} disabled={pending}>
          <Alert className="mb-5" type="info" title="先填写考试信息，再导入或校对试卷" description="保存后进入草稿。只有在检查试卷并选好应考班级后，学生才会看到考试。" showIcon />
          <Form.Item label="考试名称" name="title" rules={[{ required: true, whitespace: true, message: '请填写考试名称' }, { max: 120, message: '最多 120 字' }]}>
            <Input placeholder="例如：高一信息科技 · 第一章单元测" autoFocus />
          </Form.Item>
          <Form.Item label="说明（可选）" name="description">
            <Input.TextArea rows={3} placeholder="考试范围、注意事项等，学生工作台可见" maxLength={2000} />
          </Form.Item>
          <Form.Item label="考试时长（分钟）" name="durationMin" extra="每位学生开始作答后单独计时。" rules={[{ required: true, message: '请填写考试时长' }, { type: 'integer', min: 1, max: 600, message: '请输入 1–600 分钟之间的整数' }]}>
            <InputNumber min={1} max={600} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
