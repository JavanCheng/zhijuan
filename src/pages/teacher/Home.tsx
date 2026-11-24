import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Skeleton,
  Tooltip,
} from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { api, del, post } from '../../api';
import type { AnalyticsMeta, ExamSummary } from '../../../shared/types';
import { EmptyState, ExamStatusTag, Page, PageHeader, Pill, StatCard } from '../../ui';

const { TextArea } = Input;

type ExamCard = ExamSummary & {
  submissionCount: number;
  gradedCount: number;
  pendingCount: number;
  reviewCount: number;
};

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

export function TeacherHome() {
  const navigate = useNavigate();
  const { modal } = AntApp.useApp();
  const [form] = Form.useForm<CreateForm>();

  const [exams, setExams] = useState<ExamCard[] | null>(null);
  const [meta, setMeta] = useState<AnalyticsMeta | null>(null);
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<ExamCard[]>('/api/teacher/exams');
      setExams(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    api<RuntimeInfo>('/api/auth/runtime').then(setRuntime).catch(() => setRuntime(null));
    api<AnalyticsMeta>('/api/teacher/analytics/meta').then(setMeta).catch(() => setMeta(null));
  }, [load]);

  const stats = useMemo(() => {
    const list = exams ?? [];
    const active = list.filter((exam) => exam.status === 'published').length;
    const pendingReviews = list.reduce((sum, exam) => sum + exam.pendingCount + exam.reviewCount, 0);
    const graded = list.reduce((sum, exam) => sum + exam.gradedCount, 0);
    return { total: list.length, active, pendingReviews, graded };
  }, [exams]);

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

  function removeExam(exam: ExamCard) {
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

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="考试管理"
        subtitle="用 Word 建卷 → 发布 → 自动评分 → 校准出分，全过程留痕；成绩会自动汇总到学情看板。"
        extra={
          <>
            <Tooltip title="查看班级与学生维度的图表汇报">
              <Button icon={<BarChartOutlined />} onClick={() => navigate('/teacher/analytics')}>
                学情看板
              </Button>
            </Tooltip>
            <Button icon={<DownloadOutlined />} href="/api/template.docx" download>
              下载模板
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              新建考试
            </Button>
          </>
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

      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="考试总数"
          value={stats.total}
          suffix="场"
          icon={<FileTextOutlined />}
          tone="blue"
          hint={`${stats.active} 场正在进行`}
        />
        <StatCard
          label="已评答卷"
          value={stats.graded}
          suffix="份"
          icon={<CheckCircleOutlined />}
          tone="green"
          hint="自动评分 + 人工校准"
        />
        <StatCard
          label="待批改"
          value={stats.pendingReviews}
          suffix="份"
          icon={<ClockCircleOutlined />}
          tone={stats.pendingReviews ? 'amber' : 'gray'}
          hint={stats.pendingReviews ? '建议先处理待校准答卷' : '暂无待处理答卷'}
        />
        <StatCard
          label="学生规模"
          value={meta?.students.length ?? '—'}
          suffix={meta ? `人 · ${meta.classes.length} 个班` : '人'}
          icon={<TeamOutlined />}
          tone="purple"
          hint={meta ? meta.classes.map((item) => item.name).join('、') : '正在读取班级信息'}
        />
      </div>

      {exams === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Card key={key}>
              <Skeleton active paragraph={{ rows: 4 }} />
            </Card>
          ))}
        </div>
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
                  先看题目模板
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {exams.map((exam) => {
            const gradedRate = exam.submissionCount
              ? Math.round((exam.gradedCount / exam.submissionCount) * 100)
              : 0;
            return (
              <Col xs={24} md={12} xl={8} key={exam.id}>
                <Card
                  hoverable
                  className="lift-card"
                  style={{ height: '100%' }}
                  styles={{ body: { height: '100%', display: 'flex', flexDirection: 'column', gap: 14 } }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ExamStatusTag status={exam.status} />
                    {exam.resultsPublished ? <Pill tone="green">成绩已发布</Pill> : null}
                    <span className="ml-auto text-[11px] text-[#b0b7c7]">#{exam.id}</span>
                  </div>

                  <div>
                    <div className="text-[16px] font-semibold leading-snug text-[#1a2338]">{exam.title}</div>
                    {exam.description ? (
                      <div className="mt-1 line-clamp-2 text-[12.5px] leading-6 text-[#7b86a0]">{exam.description}</div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f8f9fd] px-3 py-2.5">
                    <div>
                      <div className="text-[10.5px] text-[#98a1b3]">试卷</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-[#26304a]">
                        {exam.questionCount} 题
                        <span className="ml-1 text-[11px] font-normal text-[#98a1b3]">{exam.totalScore} 分</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#98a1b3]">提交</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-[#26304a]">{exam.submissionCount} 人</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#98a1b3]">时长</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-[#26304a]">{exam.durationMin} 分钟</div>
                    </div>
                  </div>

                  {exam.submissionCount > 0 ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#7b86a0]">
                        <span>评分进度</span>
                        <span>
                          {exam.gradedCount} / {exam.submissionCount}
                        </span>
                      </div>
                      <Progress
                        percent={gradedRate}
                        showInfo={false}
                        size="small"
                        strokeColor={gradedRate === 100 ? '#12b886' : '#3358e8'}
                        trailColor="#eef1f8"
                      />
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {exam.status === 'draft' ? (
                      <>
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => navigate(`/teacher/exam/${exam.id}`)}
                        >
                          导入题目
                        </Button>
                        <Button size="small" danger onClick={() => removeExam(exam)}>
                          删除
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => navigate(`/teacher/exam/${exam.id}/grading`)}
                        >
                          批改与出分
                        </Button>
                        <Button size="small" onClick={() => navigate(`/teacher/exam/${exam.id}`)}>
                          试卷详情
                        </Button>
                        <Tooltip title="查看本场学情图表">
                          <Button
                            size="small"
                            type="text"
                            icon={<BarChartOutlined />}
                            onClick={() => navigate(`/teacher/analytics?examId=${exam.id}`)}
                          />
                        </Tooltip>
                      </>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e9ecf4] bg-white px-4 py-3 text-[11.5px] text-[#7b86a0]">
        <span className="font-medium text-[#4b5670]">课堂闭环</span>
        <span>Word 出卷</span>
        <ArrowRightOutlined className="text-[9px] text-[#c7cedd]" />
        <span>发布作答</span>
        <ArrowRightOutlined className="text-[9px] text-[#c7cedd]" />
        <span>自动评分</span>
        <ArrowRightOutlined className="text-[9px] text-[#c7cedd]" />
        <span>教师校准</span>
        <ArrowRightOutlined className="text-[9px] text-[#c7cedd]" />
        <span>学情看板</span>
      </div>

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
            <TextArea rows={3} placeholder="考试范围、注意事项等，学生端可见" maxLength={2000} />
          </Form.Item>
          <Form.Item label="考试时长（分钟）" name="durationMin" extra="学生开始作答后倒计时，超时自动提交。">
            <InputNumber min={1} max={600} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}
