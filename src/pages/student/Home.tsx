import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Tag } from 'antd';
import { ClockCircleOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { ExamSummary, SubmissionStatus } from '../../../shared/types';
import { ExamStatusTag, Page, PageHeader } from '../../ui';
import { formatDate } from '../../format';

interface StudentExamCard extends ExamSummary {
  teacherName: string;
  submission: { id: number; status: SubmissionStatus | null; submittedAt: string | null } | null;
}

export function StudentHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<StudentExamCard[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<StudentExamCard[]>('/api/student/exams')
      .then(setExams)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, []);

  if (!exams) {
    return (
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={`你好，${user?.name}`}
        subtitle="这里是老师发布的考试。开始作答后计时不会暂停，请注意时间。"
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      {exams.length === 0 ? (
        <Card>
          <Empty description="暂时没有考试，老师发布后会出现在这里" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {exams.map((exam) => {
            const sub = exam.submission;
            const inProgress = sub && sub.status === 'in_progress';
            const waiting = sub && (sub.status === 'submitted' || sub.status === 'grading');
            const graded = sub && sub.status === 'graded';

            return (
              <Col xs={24} md={12} key={exam.id}>
                <Card
                  hoverable
                  style={{ height: '100%' }}
                  styles={{ body: { padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 14 } }}
                >
                  <Space size={8} wrap>
                    <ExamStatusTag status={exam.status} />
                    {exam.resultsPublished ? <Tag color="success">成绩已发布</Tag> : null}
                    {waiting ? <Tag color="gold">批改中</Tag> : null}
                  </Space>

                  <div>
                    <div className="text-[16px] font-semibold leading-snug">{exam.title}</div>
                    {exam.description ? (
                      <div className="mt-1 text-[13px] leading-6 text-[#7a839a]">{exam.description}</div>
                    ) : null}
                  </div>

                  <Space size={16} wrap className="text-[12.5px] text-[#7a839a]">
                    <span>
                      <FileTextOutlined /> {exam.questionCount} 题 · {exam.totalScore} 分
                    </span>
                    <span>
                      <ClockCircleOutlined /> {exam.durationMin} 分钟
                    </span>
                    <span>
                      <TeamOutlined /> {exam.teacherName}
                    </span>
                    {sub?.submittedAt ? <span>提交于 {formatDate(sub.submittedAt)}</span> : null}
                  </Space>

                  <div className="mt-auto">
                    {exam.status === 'closed' && !sub ? (
                      <span className="text-[12.5px] text-[#7a839a]">考试已结束</span>
                    ) : inProgress ? (
                      <Button type="primary" size="small" onClick={() => navigate(`/student/exam/${exam.id}`)}>
                        继续作答
                      </Button>
                    ) : waiting || graded ? (
                      <Button size="small" onClick={() => navigate(`/student/result/${sub!.id}`)}>
                        {graded && exam.resultsPublished ? '查看成绩' : '查看批改进度'}
                      </Button>
                    ) : (
                      <Button type="primary" size="small" onClick={() => navigate(`/student/exam/${exam.id}`)}>
                        开始作答
                      </Button>
                    )}
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
