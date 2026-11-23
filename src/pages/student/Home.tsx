import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { ExamSummary, SubmissionStatus } from '../../../shared/types';
import { Alert, Card, EmptyState, ExamStatusBadge, Icon, Spinner } from '../../ui';
import { formatDate } from '../../format';

interface StudentExamCard extends ExamSummary {
  teacherName: string;
  submission: { id: number; status: SubmissionStatus | null; submittedAt: string | null } | null;
}

export function StudentHome() {
  const { user } = useAuth();
  const [exams, setExams] = useState<StudentExamCard[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<StudentExamCard[]>('/api/student/exams')
      .then(setExams)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, []);

  if (!exams) {
    return (
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="加载考试…" />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">你好，{user?.name}</h1>
          <p className="page-sub">这里是老师发布的考试。开始作答后计时中断不会暂停，请注意时间。</p>
        </div>
      </div>

      {error ? <Alert tone="red">{error}</Alert> : null}

      {exams.length === 0 ? (
        <Card>
          <EmptyState title="暂时没有考试" desc="老师发布考试后会出现在这里，请稍后再刷新看看。" />
        </Card>
      ) : (
        <div className="grid grid-2">
          {exams.map((exam) => {
            const sub = exam.submission;
            const inProgress = sub && sub.status === 'in_progress';
            const waiting = sub && (sub.status === 'submitted' || sub.status === 'grading');
            const graded = sub && sub.status === 'graded';

            return (
              <Card key={exam.id} className="exam-card">
                <div className="spread">
                  <ExamStatusBadge status={exam.status} />
                  {exam.resultsPublished ? <span className="badge tone-green">成绩已发布</span> : null}
                  {waiting ? <span className="badge tone-amber">批改中</span> : null}
                </div>
                <h3>{exam.title}</h3>
                {exam.description ? (
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                    {exam.description}
                  </p>
                ) : null}
                <div className="exam-meta">
                  <span>
                    <Icon name="file" size={13} /> {exam.questionCount} 题 · {exam.totalScore} 分
                  </span>
                  <span>
                    <Icon name="clock" size={13} /> {exam.durationMin} 分钟
                  </span>
                  <span>
                    <Icon name="users" size={13} /> {exam.teacherName}
                  </span>
                  {sub?.submittedAt ? <span>提交于 {formatDate(sub.submittedAt)}</span> : null}
                </div>
                <div className="exam-actions">
                  {exam.status === 'closed' ? (
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      考试已结束
                    </span>
                  ) : inProgress ? (
                    <Link className="btn btn-primary btn-sm" to={`/student/exam/${exam.id}`}>
                      继续作答
                    </Link>
                  ) : waiting || graded ? (
                    <Link className="btn btn-ghost btn-sm" to={`/student/result/${sub!.id}`}>
                      {graded && exam.resultsPublished ? '查看成绩' : '查看批改进度'}
                    </Link>
                  ) : (
                    <Link className="btn btn-primary btn-sm" to={`/student/exam/${exam.id}`}>
                      开始作答
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
