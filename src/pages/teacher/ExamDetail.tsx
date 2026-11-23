import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, del, patch, post, put } from '../../api';
import type { ExamDetailTeacher, ImportResult, QuestionTeacher } from '../../../shared/types';
import { Alert, Button, Card, EmptyState, ExamStatusBadge, Icon, Modal, Spinner, TypeBadge } from '../../ui';
import { formatAnswerSpec, scoreText, stripHtml } from '../../format';

export function TeacherExam() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`);
      setExam(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runImport(body: FormData | { sample: true }) {
    setImporting(true);
    setError('');
    try {
      const result = await api<ImportResult>(`/api/teacher/exams/${examId}/import`, {
        method: 'POST',
        body: body as FormData,
      });
      setImportResult(result);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setImporting(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('只支持 .docx 格式，请用 Word 另存为 .docx 后再上传');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    void runImport(form);
  }

  async function confirmImport() {
    if (!importResult || !exam) return;
    setBusy(true);
    try {
      await put(`/api/teacher/exams/${exam.id}/questions`, {
        questions: importResult.questions as unknown as Record<string, unknown>[],
      });
      setImportOpen(false);
      setImportResult(null);
      setNotice('题目已导入，请核对分值后发布考试');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/publish`);
      setNotice('考试已发布，学生端现在可以看到并作答');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!window.confirm('结束后学生将无法继续作答，确定结束考试吗？')) return;
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/close`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeExam() {
    if (!window.confirm('删除后不可恢复，确定删除这场考试吗？')) return;
    try {
      await del(`/api/teacher/exams/${examId}`);
      navigate('/teacher', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  async function updateScore(q: QuestionTeacher, value: number) {
    if (!Number.isFinite(value) || value <= 0 || value === q.score) return;
    try {
      await patch(`/api/teacher/questions/${q.id}`, { score: value });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存分值失败');
    }
  }

  async function removeQuestion(q: QuestionTeacher) {
    if (!window.confirm(`确定删除第 ${q.seq} 题吗？`)) return;
    try {
      await del(`/api/teacher/questions/${q.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  if (!exam) {
    return (
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="加载试卷中…" />}
      </div>
    );
  }

  const hasQuestions = exam.questions.length > 0;
  const errorCount = importResult?.counts.errors ?? 0;

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
            <span className="muted" style={{ fontSize: 12.5 }}>
              共 {exam.questionCount} 题 · 合计 {exam.totalScore} 分 · {exam.submissionCount} 人提交
            </span>
          </div>
        </div>
        <div className="page-actions">
          {exam.status === 'draft' ? (
            <>
              <Button variant="ghost" onClick={removeExam}>
                删除
              </Button>
              <Button icon="check" loading={busy} disabled={!hasQuestions} onClick={publish}>
                发布考试
              </Button>
            </>
          ) : (
            <>
              {exam.status === 'published' ? (
                <Button variant="ghost" onClick={close}>
                  结束考试
                </Button>
              ) : null}
              <Link className="btn btn-primary btn-md" to={`/teacher/exam/${exam.id}/grading`}>
                批改与出分
              </Link>
            </>
          )}
        </div>
      </div>

      {error ? <Alert tone="red">{error}</Alert> : null}
      {notice ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="green">{notice}</Alert>
        </div>
      ) : null}

      <Card className="card-pad" >
        <div className="spread" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">导入 Word 试卷</div>
            <div className="card-sub">
              按模板填写后上传，系统会先给出解析预览，确认无误再写入试卷。
            </div>
          </div>
          <a className="btn btn-ghost btn-sm" href="/api/template.docx" download>
            <Icon name="download" size={15} /> 下载模板
          </a>
        </div>

        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="dz-icon">
            <Icon name="upload" size={22} />
          </div>
          <h4>{importing ? '正在解析…' : '把 .docx 拖到这里，或点击选择文件'}</h4>
          <p>
            {hasQuestions
              ? '重新导入会覆盖当前全部题目；已产生学生提交后不可再导入。'
              : '支持单选、多选、判断、填空、简答、代码六种题型。'}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <Button variant="subtle" size="sm" loading={importing} onClick={() => runImport({ sample: true })}>
            使用示例模板试导入
          </Button>
          <span className="muted" style={{ fontSize: 12 }}>
            示例模板包含六种题型，可用于快速体验完整流程。
          </span>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      <Card>
        <div className="card-head">
          <div>
            <div className="card-title">题目列表</div>
            <div className="card-sub">分值可直接修改，保存后立即生效。</div>
          </div>
          <span className="badge tone-gray">{exam.questions.length} 题</span>
        </div>
        {hasQuestions ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>题号</th>
                  <th style={{ width: 86 }}>题型</th>
                  <th>题干</th>
                  <th style={{ width: 150 }}>答案 / 测试点</th>
                  <th style={{ width: 90 }}>分值</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {exam.questions.map((q) => (
                  <tr key={q.id}>
                    <td className="num">{q.seq}</td>
                    <td>
                      <TypeBadge type={q.type} />
                    </td>
                    <td>
                      <div style={{ maxWidth: 460, lineHeight: 1.6 }}>{stripHtml(q.stemHtml).slice(0, 70)}</div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
                      {q.type === 'code'
                        ? `${q.testCases.length} 个测试点`
                        : q.type === 'short'
                          ? '人工评分'
                          : formatAnswerSpec(q.type, q.answer, q.options).split('\n')[0]}
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        defaultValue={q.score}
                        min={0.5}
                        step={0.5}
                        style={{ width: 76, padding: '6px 8px', textAlign: 'center' }}
                        onBlur={(e) => updateScore(q, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <button className="icon-btn" title="删除题目" onClick={() => removeQuestion(q)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>
                    合计
                  </td>
                  <td style={{ fontWeight: 700 }}>{scoreText(exam.totalScore, 2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="试卷还没有题目" desc="上传按模板填写的 Word，或先用示例模板试导入，看看解析效果。" />
        )}
      </Card>

      <Modal
        open={importOpen}
        size="lg"
        title="解析预览"
        subtitle={
          importResult
            ? `共 ${importResult.counts.total} 题 · 合计 ${importResult.counts.totalScore} 分 · ${importResult.counts.errors} 个错误 · ${importResult.counts.warnings} 个警告`
            : undefined
        }
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button loading={busy} disabled={errorCount > 0} onClick={confirmImport}>
              {errorCount > 0 ? '请先修正 Word 中的错误' : '确认导入'}
            </Button>
          </>
        }
      >
        {importResult ? (
          <>
            <div className="import-summary">
              <span className="badge tone-blue">{importResult.counts.total} 题</span>
              <span className="badge tone-green">{importResult.counts.totalScore} 分</span>
              {importResult.counts.errors > 0 ? (
                <span className="badge tone-red">{importResult.counts.errors} 个错误</span>
              ) : null}
              {importResult.counts.warnings > 0 ? (
                <span className="badge tone-amber">{importResult.counts.warnings} 个警告</span>
              ) : null}
            </div>
            {importResult.notes.length ? (
              <div style={{ marginBottom: 14 }}>
                <Alert tone="blue">{importResult.notes.join('；')}</Alert>
              </div>
            ) : null}

            {importResult.questions.map((q) => {
              const hardError = q.issues.some((i) => i.level === 'error');
              return (
                <div key={q.seq} className={`import-item ${hardError ? 'has-error' : ''}`}>
                  <div className="qi-head">
                    <span className="badge tone-gray">第 {q.seq} 题</span>
                    <TypeBadge type={q.type} />
                    <span className="badge tone-blue">{q.score} 分</span>
                    {q.type === 'code' ? (
                      <span className="badge tone-violet">{q.testCases.length} 个测试点</span>
                    ) : null}
                  </div>
                  <div className="qi-stem">{stripHtml(q.stemHtml).slice(0, 220)}</div>
                  <div className="qi-foot">
                    {q.type === 'code'
                      ? `语言：${q.codeSpec?.languages.join(', ') ?? 'python'}`
                      : `答案：${formatAnswerSpec(q.type, q.answer, q.options).replace(/\n/g, '；').slice(0, 90)}`}
                  </div>
                  {q.issues.length ? (
                    <ul className="issue-list">
                      {q.issues.map((issue, idx) => (
                        <li key={idx}>
                          <span className={`issue ${issue.level}`}>
                            {issue.level === 'error' ? '错误' : '提示'}：{issue.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
