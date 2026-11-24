import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Skeleton, Space, Tag } from 'antd';
import {
  ClockCircleOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { ExamSummary, SubmissionStatus } from '../../../shared/types';
import { EmptyState, ExamStatusTag, Page, PageHeader, Pill, StatCard } from '../../ui';
import { formatDate, scoreText } from '../../format';

interface StudentExamCard extends ExamSummary {
  teacherName: string;
  submission: {
    id: number;
    status: SubmissionStatus | null;
    score: number | null;
    submittedAt: string | null;
  } | null;
}

export function StudentHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<StudentExamCard[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<StudentExamCard[]>('/api/student/exams');
      setExams(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = exams ?? [];
    const todo = list.filter((exam) => exam.status === 'published' && !exam.submission).length;
    const inProgress = list.filter((exam) => exam.submission?.status === 'in_progress').length;
    const waiting = list.filter(
      (exam) => exam.submission && (exam.submission.status === 'submitted' || exam.submission.status === 'grading'),
    ).length;
    const published = list.filter(
      (exam) => exam.resultsPublished && exam.submission?.status === 'graded' && exam.submission.score != null,
    ).length;
    return { todo, inProgress, waiting, published };
  }, [exams]);

  if (!exams) {
    return (
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Skeleton active paragraph={{ rows: 8 }} />}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Student"
        title={`你好，${user?.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {user?.className ? <Pill tone="teal">{user.className}</Pill> : null}
            <span>这里是老师发布的考试。开始作答后计时不会暂停，请注意时间。</span>
          </span>
        }
        extra={
          <Button icon={<FileTextOutlined />} onClick={() => void load()}>
            刷新列表
          </Button>
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="待作答" value={stats.todo} suffix="场" icon={<PlayCircleOutlined />} tone="blue" hint="发布中的考试" />
        <StatCard label="进行中" value={stats.inProgress} suffix="场" icon={<ClockCircleOutlined />} tone="amber" hint="可继续作答" />
        <StatCard label="待批改" value={stats.waiting} suffix="场" icon={<FileTextOutlined />} tone="purple" hint="提交后等待评分" />
        <StatCard label="已出分" value={stats.published} suffix="场" icon={<TrophyOutlined />} tone="green" hint="可查看每题解析" />
      </div>

      {exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileTextOutlined />}
            title="暂时没有考试"
            description="老师发布考试后会出现在这里；开始作答后系统会自动保存草稿。"
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {exams.map((exam) => {
            const sub = exam.submission;
            const inProgress = sub?.status === 'in_progress';
            const waiting = sub && (sub.status === 'submitted' || sub.status === 'grading');
            const graded = sub?.status === 'graded';
            const showScore = exam.resultsPublished && graded && sub?.score != null;
            const rate = showScore ? Math.round((sub.score! / Math.max(1, exam.totalScore)) * 100) : 0;

            return (
              <Col xs={24} md={12} key={exam.id}>
                <Card
                  hoverable
                  className="lift-card"
                  style={{ height: '100%' }}
                  styles={{ body: { padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 14 } }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Space size={8} wrap>
                      <ExamStatusTag status={exam.status} />
                      {exam.resultsPublished ? <Pill tone="green">成绩已发布</Pill> : null}
                      {waiting ? <Pill tone="amber">批改中</Pill> : null}
                      {inProgress ? <Pill tone="blue">继续作答</Pill> : null}
                    </Space>
                    {showScore ? (
                      <div className="text-right">
                        <div className="text-[24px] font-bold leading-none text-[#0f7a56]">{scoreText(sub.score)}</div>
                        <div className="mt-1 text-[10.5px] text-[#98a1b3]">
                          / {scoreText(exam.totalScore)} · {rate}%
                        </div>
                      </div>
                    ) : null}
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
                      <div className="mt-0.5 text-[13px] font-semibold text-[#26304a]">{exam.questionCount} 题</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#98a1b3]">时长</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-[#26304a]">{exam.durationMin} 分钟</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-[#98a1b3]">教师</div>
                      <div className="mt-0.5 truncate text-[13px] font-semibold text-[#26304a]">{exam.teacherName}</div>
                    </div>
                  </div>

                  {sub?.submittedAt ? (
                    <div className="text-[11.5px] text-[#98a1b3]">提交于 {formatDate(sub.submittedAt)}</div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {exam.status === 'closed' && !sub ? (
                      <span className="text-[12.5px] text-[#7b86a0]">考试已结束</span>
                    ) : inProgress ? (
                      <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => navigate(`/student/exam/${exam.id}`)}>
                        继续作答
                      </Button>
                    ) : waiting || graded ? (
                      <Button size="small" onClick={() => navigate(`/student/result/${sub!.id}`)}>
                        {showScore ? '查看成绩' : '查看批改进度'}
                      </Button>
                    ) : (
                      <Button type="primary" size="small" onClick={() => navigate(`/student/exam/${exam.id}`)}>
                        开始作答
                      </Button>
                    )}
                    {showScore ? <Tag bordered={false} color="success">已出分</Tag> : null}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </Page>
  );
}
