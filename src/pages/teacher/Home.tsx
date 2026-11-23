import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, del, post } from '../../api';
import type { ExamSummary } from '../../../shared/types';
import { Alert, Button, Card, EmptyState, ExamStatusBadge, Field, Icon, Modal, Spinner } from '../../ui';
import { formatDate } from '../../format';

type ExamCard = ExamSummary & { submissionCount: number; gradedCount: number };

interface RuntimeInfo {
  python: string | null;
  pythonSource: string;
  node: string;
}

export function TeacherHome() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamCard[] | null>(null);
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [formError, setFormError] = useState('');

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
    setFormError('');
    if (!title.trim()) {
      setFormError('请填写考试名称');
      return;
    }
    setPending(true);
    try {
      const exam = await post<ExamSummary>('/api/teacher/exams', {
        title: title.trim(),
        description: description.trim(),
        durationMin: Number(duration) || 60,
      });
      setCreating(false);
      setTitle('');
      setDescription('');
      navigate(`/teacher/exam/${exam.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setPending(false);
    }
  }

  async function removeExam(exam: ExamCard) {
    if (!window.confirm(`确定删除「${exam.title}」吗？该操作不可恢复。`)) return;
    try {
      await del(`/api/teacher/exams/${exam.id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">考试管理</h1>
          <p className="page-sub">用 Word 建卷 → 发布 → 批改 → 出分，全过程留痕。</p>
        </div>
        <div className="page-actions">
          <a className="btn btn-ghost btn-md" href="/api/template.docx" download>
            <Icon name="download" size={16} />
            下载题目模板
          </a>
          <Button icon="plus" onClick={() => setCreating(true)}>
            新建考试
          </Button>
        </div>
      </div>

      {runtime ? (
        <div className="status-strip">
          {runtime.python ? (
            <>
              <span className="dot-ok" />
              代码运行时就绪：Python 已就绪（{runtime.pythonSource}）
            </>
          ) : (
            <>
              <span className="dot-bad" />
              未检测到 Python 运行时，代码题将无法评测。请查看 README 的「代码运行时」章节。
            </>
          )}
        </div>
      ) : null}

      {error ? <Alert tone="red">{error}</Alert> : null}

      {exams === null ? (
        <Card>
          <div className="card-pad">
            <Spinner label="正在加载考试列表…" />
          </div>
        </Card>
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState
            title="还没有考试"
            desc="先新建一场考试，再上传按模板填写的 Word 试卷。系统会解析题目、答案与测试点，确认后即可发布。"
            action={
              <Button icon="plus" onClick={() => setCreating(true)}>
                新建考试
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="exam-card">
              <div className="spread">
                <ExamStatusBadge status={exam.status} />
                {exam.resultsPublished ? <span className="badge tone-green">成绩已发布</span> : null}
              </div>
              <h3>{exam.title}</h3>
              {exam.description ? (
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {exam.description.length > 56 ? `${exam.description.slice(0, 56)}…` : exam.description}
                </p>
              ) : null}
              <div className="exam-meta">
                <span>
                  <Icon name="file" size={13} /> {exam.questionCount} 题 · {exam.totalScore} 分
                </span>
                <span>
                  <Icon name="users" size={13} /> {exam.submissionCount} 人提交
                </span>
                <span>
                  <Icon name="clock" size={13} /> {exam.durationMin} 分钟
                </span>
                <span>创建于 {formatDate(exam.createdAt)}</span>
              </div>
              <div className="exam-actions">
                {exam.status === 'draft' ? (
                  <>
                    <Link className="btn btn-primary btn-sm" to={`/teacher/exam/${exam.id}`}>
                      导入题目
                    </Link>
                    <Button size="sm" variant="danger" onClick={() => removeExam(exam)}>
                      删除
                    </Button>
                  </>
                ) : (
                  <>
                    <Link className="btn btn-primary btn-sm" to={`/teacher/exam/${exam.id}/grading`}>
                      批改与出分
                    </Link>
                    <Link className="btn btn-ghost btn-sm" to={`/teacher/exam/${exam.id}`}>
                      试卷详情
                    </Link>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        title="新建考试"
        subtitle="创建后导入 Word 试卷，确认题目无误再发布给学生。"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button loading={pending} onClick={createExam}>
              创建并继续
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="考试名称">
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：高一信息科技 · 第一章单元测"
              autoFocus
            />
          </Field>
          <Field label="说明（可选）">
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="考试范围、注意事项等，学生端可见"
            />
          </Field>
          <Field label="考试时长（分钟）" hint="学生开始作答后倒计时，超时自动提交。">
            <input
              className="input"
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </Field>
          {formError ? <Alert tone="red">{formError}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}
