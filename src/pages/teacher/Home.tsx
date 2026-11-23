import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { api, del, post } from '../../api';
import type { ExamSummary } from '../../../shared/types';
import { ExamStatusTag } from '../../ui';
import { formatDate } from '../../format';

const { Title, Text } = Typography;
const { TextArea } = Input;

type ExamCard = ExamSummary & { submissionCount: number; gradedCount: number };

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
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<ExamCard[]>('/api/teacher/exams');
      setExams(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    api<RuntimeInfo>('/api/auth/runtime').then(setRuntime).catch(() => setRuntime(null));
  }, [load]);

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
    <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            考试管理
          </Title>
          <Text type="secondary">用 Word 建卷 → 发布 → 批改 → 出分，全过程留痕。</Text>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} href="/api/template.docx" download>
            下载题目模板
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建考试
          </Button>
        </Space>
      </div>

      {runtime ? (
        runtime.python ? (
          <Alert
            type="success"
            showIcon
            className="mb-4"
            message={`代码运行时就绪：Python（${runtime.pythonSource}）`}
          />
        ) : (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            message="未检测到 Python 运行时，代码题将无法评测"
            description="请查看 README 的「代码运行时」章节，或设置环境变量 PYTHON_BIN。"
          />
        )
      ) : null}

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      {exams === null ? (
        <Card>
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        </Card>
      ) : exams.length === 0 ? (
        <Card>
          <Empty description="还没有考试，先新建一场吧">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              新建考试
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {exams.map((exam) => (
            <Col xs={24} md={12} xl={8} key={exam.id}>
              <Card
                hoverable
                style={{ height: '100%' }}
                styles={{ body: { padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 14 } }}
              >
                <div className="flex items-center justify-between">
                  <ExamStatusTag status={exam.status} />
                  {exam.resultsPublished ? <Tag color="success">成绩已发布</Tag> : null}
                </div>

                <div>
                  <div className="text-[16px] font-semibold leading-snug">{exam.title}</div>
                  {exam.description ? (
                    <div className="mt-1 line-clamp-2 text-[13px] leading-6 text-[#7a839a]">{exam.description}</div>
                  ) : null}
                </div>

                <Space size={16} wrap className="text-[12.5px] text-[#7a839a]">
                  <span>
                    <FileTextOutlined /> {exam.questionCount} 题 · {exam.totalScore} 分
                  </span>
                  <span>
                    <TeamOutlined /> {exam.submissionCount} 人提交
                  </span>
                  <span>
                    <ClockCircleOutlined /> {exam.durationMin} 分钟
                  </span>
                  <span>创建于 {formatDate(exam.createdAt)}</span>
                </Space>

                <div className="mt-auto flex flex-wrap gap-2">
                  {exam.status === 'draft' ? (
                    <>
                      <Button type="primary" size="small" onClick={() => navigate(`/teacher/exam/${exam.id}`)}>
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
                    </>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
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
        <div className="mb-4 text-[13px] text-[#7a839a]">创建后导入 Word 试卷，确认题目无误再发布给学生。</div>
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
    </div>
  );
}
