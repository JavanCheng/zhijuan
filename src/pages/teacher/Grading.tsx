import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api, post } from '../../api';
import type { ExamDetailTeacher, SubmissionRow } from '../../../shared/types';
import { ExamStatusTag, SubmissionStatusTag } from '../../ui';
import { formatDate, scoreText } from '../../format';

const { Title, Text } = Typography;

export function TeacherGrading() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();
  const { modal } = AntApp.useApp();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'review'>('all');

  const load = useCallback(async () => {
    try {
      const [detail, subs] = await Promise.all([
        api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`),
        api<SubmissionRow[]>(`/api/teacher/exams/${examId}/submissions`),
      ]);
      setExam(detail);
      setRows(subs);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [examId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const graded = list.filter((r) => r.status === 'graded');
    const review = list.filter((r) => r.needsReview > 0);
    const avg = graded.length
      ? graded.reduce((s, r) => s + (r.finalScore ?? r.autoScore ?? 0), 0) / graded.length
      : 0;
    return { submitted: list.length, graded: graded.length, review: review.length, avg };
  }, [rows]);

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
          setError(err instanceof Error ? err.message : '操作失败');
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
          setError(err instanceof Error ? err.message : '操作失败');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  if (!exam || rows === null) {
    return (
      <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </div>
    );
  }

  const visible = filter === 'review' ? rows.filter((r) => r.needsReview > 0) : rows;

  const columns: TableProps<SubmissionRow>['columns'] = [
    { title: '学号', dataIndex: 'studentNo', width: 110, render: (v) => <Text type="secondary">{v}</Text> },
    { title: '姓名', dataIndex: 'studentName', width: 110, render: (v) => <span className="font-medium">{v}</span> },
    { title: '状态', dataIndex: 'status', width: 120, render: (_, r) => <SubmissionStatusTag status={r.status} /> },
    {
      title: '作答进度',
      width: 100,
      render: (_, r) => `${r.answered}/${r.questionCount}`,
    },
    { title: '自动分', width: 90, render: (_, r) => scoreText(r.autoScore) },
    {
      title: '最终分',
      width: 90,
      render: (_, r) => <span className="font-semibold">{scoreText(r.finalScore ?? r.autoScore)}</span>,
    },
    {
      title: '待校准',
      width: 100,
      render: (_, r) => (r.needsReview > 0 ? <Tag color="gold">{r.needsReview} 题</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: '提交时间',
      width: 170,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {formatDate(r.submittedAt)}
        </Text>
      ),
    },
    {
      title: '',
      width: 80,
      render: (_, r) => (
        <Button
          size="small"
          type="link"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/teacher/submission/${r.id}`);
          }}
        >
          批改
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
      <Button type="link" icon={<ArrowLeftOutlined />} className="!mb-2 !px-0" onClick={() => navigate('/teacher')}>
        返回考试列表
      </Button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title level={3} style={{ marginBottom: 6 }}>
            {exam.title}
          </Title>
          <Space size={10} wrap>
            <ExamStatusTag status={exam.status} />
            {exam.resultsPublished ? <Tag color="success">成绩已发布</Tag> : null}
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              自动评分每 3 秒刷新一次
            </Text>
          </Space>
        </div>
        <Space wrap>
          <Button onClick={() => navigate(`/teacher/exam/${exam.id}`)}>试卷详情</Button>
          <Button loading={busy} onClick={confirmAuto}>
            确认全部自动分
          </Button>
          <Button type={exam.resultsPublished ? 'default' : 'primary'} danger={exam.resultsPublished} loading={busy} onClick={toggleResults}>
            {exam.resultsPublished ? '撤回成绩' : '发布成绩'}
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      <Row gutter={[14, 14]} className="mb-5">
        <Col xs={12} lg={6}>
          <Card styles={{ body: { padding: '16px 18px' } }}>
            <Statistic title="已提交" value={stats.submitted} suffix="人" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card styles={{ body: { padding: '16px 18px' } }}>
            <Statistic title="自动评分完成" value={stats.graded} suffix="人" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card styles={{ body: { padding: '16px 18px' } }}>
            <Statistic title="需要人工校准" value={stats.review} suffix="人" valueStyle={{ color: stats.review ? '#d48806' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card styles={{ body: { padding: '16px 18px' } }}>
            <Statistic title="平均分" value={Number(scoreText(stats.avg))} precision={1} suffix={`/ ${exam.totalScore}`} />
          </Card>
        </Col>
      </Row>

      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={(value) => setFilter(value as 'all' | 'review')}
          options={[
            { label: `全部（${rows.length}）`, value: 'all' },
            { label: `需校准（${stats.review}）`, value: 'review' },
          ]}
        />
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visible}
          pagination={false}
          locale={{
            emptyText:
              rows.length === 0 ? '还没有学生提交，发布考试后这里会自动出现答卷' : '没有需要校准的答卷',
          }}
          onRow={(record) => ({
            onClick: () => navigate(`/teacher/submission/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );
}
