import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, post } from '../../api';
import type { ExamDetailTeacher, SubmissionRow } from '../../../shared/types';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ExamStatusBadge,
  Icon,
  Spinner,
  SubmissionStatusBadge,
} from '../../ui';
import { formatDate, scoreText } from '../../format';

export function TeacherGrading() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();

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

  async function confirmAuto() {
    if (!window.confirm('把所有「未人工改分」的题目按自动评分结果确认为最终分？已人工改过的分数不会被覆盖。')) return;
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/confirm-auto`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggleResults() {
    if (!exam) return;
    const next = !exam.resultsPublished;
    const tip = next ? '发布后学生即可看到各题得分与解析，确定发布吗？' : '确定撤回已发布的成绩吗？';
    if (!window.confirm(tip)) return;
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/publish-results`, { published: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  if (!exam || rows === null) {
    return (
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="加载批改数据…" />}
      </div>
    );
  }

  const visible = filter === 'review' ? rows.filter((r) => r.needsReview > 0) : rows;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <Link to="/teacher" className="row muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <Icon name="arrow-left" size={15} /> 返回考试列表
          </Link>
          <h1 className="page-title">{exam.title}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <ExamStatusBadge status={exam.status} />
            {exam.resultsPublished ? <span className="badge tone-green">成绩已发布</span> : null}
            <span className="muted" style={{ fontSize: 12.5 }}>
              自动评分每 3 秒刷新一次
            </span>
          </div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost btn-md" to={`/teacher/exam/${exam.id}`}>
            试卷详情
          </Link>
          <Button variant="ghost" loading={busy} onClick={confirmAuto}>
            确认全部自动分
          </Button>
          <Button variant={exam.resultsPublished ? 'danger' : 'primary'} loading={busy} onClick={toggleResults}>
            {exam.resultsPublished ? '撤回成绩' : '发布成绩'}
          </Button>
        </div>
      </div>

      {error ? <Alert tone="red">{error}</Alert> : null}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">已提交</div>
          <div className="stat-value">
            {stats.submitted}
            <small>人</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">自动评分完成</div>
          <div className="stat-value">
            {stats.graded}
            <small>人</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">需要人工校准</div>
          <div className="stat-value" style={{ color: stats.review ? 'var(--amber)' : undefined }}>
            {stats.review}
            <small>人</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">平均分</div>
          <div className="stat-value">
            {scoreText(stats.avg)}
            <small>/ {exam.totalScore}</small>
          </div>
        </div>
      </div>

      <div className="filter-row">
        <button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          全部（{rows.length}）
        </button>
        <button className={`pill ${filter === 'review' ? 'active' : ''}`} onClick={() => setFilter('review')}>
          需校准（{stats.review}）
        </button>
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? '还没有学生提交' : '没有需要校准的答卷'}
            desc={
              rows.length === 0
                ? '发布考试后，学生提交的答案会自动出现在这里，并完成客观题评分。'
                : '自动评分结果已全部确认，可以直接发布成绩。'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>学号</th>
                  <th>姓名</th>
                  <th>状态</th>
                  <th>作答进度</th>
                  <th>自动分</th>
                  <th>最终分</th>
                  <th>待校准</th>
                  <th>提交时间</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/teacher/submission/${row.id}`)}
                  >
                    <td className="num muted">{row.studentNo}</td>
                    <td style={{ fontWeight: 550 }}>{row.studentName}</td>
                    <td>
                      <SubmissionStatusBadge status={row.status} />
                    </td>
                    <td className="num">
                      {row.answered}/{row.questionCount}
                    </td>
                    <td className="num">{scoreText(row.autoScore)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {scoreText(row.finalScore ?? row.autoScore)}
                    </td>
                    <td>
                      {row.needsReview > 0 ? (
                        <span className="badge tone-amber">{row.needsReview} 题</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {formatDate(row.submittedAt)}
                    </td>
                    <td>
                      <Link
                        className="btn btn-subtle btn-sm"
                        to={`/teacher/submission/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        批改
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
