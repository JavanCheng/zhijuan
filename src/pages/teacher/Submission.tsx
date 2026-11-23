import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, patch } from '../../api';
import type { AnswerTeacher, GradeDetail, QuestionTeacher, SubmissionDetailTeacher } from '../../../shared/types';
import { Alert, Button, Card, Icon, Spinner, SubmissionStatusBadge, TypeBadge } from '../../ui';
import { formatAnswerSpec, formatDate, formatStudentAnswer, scoreText } from '../../format';

interface Draft {
  score: string;
  comment: string;
}

function detailItems(detail: GradeDetail | null): GradeDetail['items'] {
  return detail?.items ?? [];
}

export function TeacherSubmission() {
  const { id } = useParams();
  const submissionId = Number(id);

  const [data, setData] = useState<SubmissionDetailTeacher | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const detail = await api<SubmissionDetailTeacher>(`/api/teacher/submissions/${submissionId}`);
      setData(detail);
      const next: Record<number, Draft> = {};
      for (const a of detail.answers) {
        next[a.questionId] = {
          score: String(a.finalScore ?? a.autoScore ?? 0),
          comment: a.comment ?? '',
        };
      }
      setDrafts(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const answerOf = (questionId: number): AnswerTeacher | undefined =>
    data?.answers.find((a) => a.questionId === questionId);

  const totals = useMemo(() => {
    if (!data) return { auto: 0, final: 0, graded: 0 };
    let auto = 0;
    let final = 0;
    let graded = 0;
    for (const q of data.questions) {
      const a = data.answers.find((x) => x.questionId === q.id);
      auto += a?.autoScore ?? 0;
      const draft = drafts[q.id];
      const value = draft ? Number(draft.score) : a?.finalScore ?? a?.autoScore ?? 0;
      final += Number.isFinite(value) ? value : 0;
      if (a?.finalScore != null) graded += 1;
    }
    return { auto, final, graded };
  }, [data, drafts]);

  async function save(question: QuestionTeacher) {
    const a = answerOf(question.id);
    const draft = drafts[question.id];
    if (!a || !draft) return;
    if (!a.id) {
      setError('该题还没有答题记录（学生未作答或尚未评分）');
      return;
    }
    const value = Number(draft.score);
    if (!Number.isFinite(value) || value < 0 || value > question.score) {
      setError(`分数需在 0 到 ${question.score} 之间`);
      return;
    }
    setSavingId(question.id);
    setError('');
    try {
      await patch(`/api/teacher/answers/${a.id}`, {
        finalScore: value,
        comment: draft.comment.trim() || null,
      });
      setNotice(`第 ${question.seq} 题已保存`);
      await load();
      window.setTimeout(() => setNotice(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingId(null);
    }
  }

  if (!data) {
    return (
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="加载答卷…" />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <Link to={`/teacher/exam/${data.examId}/grading`} className="row muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <Icon name="arrow-left" size={15} /> 返回批改列表
          </Link>
          <h1 className="page-title">
            {data.studentName}
            <span className="muted" style={{ fontSize: 14, fontWeight: 400, marginLeft: 10 }}>
              {data.studentNo}
            </span>
          </h1>
          <div className="row" style={{ marginTop: 8 }}>
            <SubmissionStatusBadge status={data.status} />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {data.examTitle} · 提交于 {formatDate(data.submittedAt)}
            </span>
          </div>
        </div>
      </div>

      {error ? <Alert tone="red">{error}</Alert> : null}
      {notice ? (
        <div style={{ marginBottom: 12 }}>
          <Alert tone="green">{notice}</Alert>
        </div>
      ) : null}

      <div className="review-layout">
        <div>
          {data.questions.map((q) => {
            const a = answerOf(q.id);
            const draft = drafts[q.id];
            const items = detailItems(a?.autoDetail ?? null);
            const isManual = q.type === 'short';
            return (
              <div className="review-card" key={q.id}>
                <div className="review-head">
                  <span className="q-num">第 {q.seq} 题</span>
                  <TypeBadge type={q.type} />
                  {isManual ? <span className="badge tone-amber">需人工评分</span> : null}
                  <span className="review-score">
                    满分 {scoreText(q.score, 2)} · 自动得分 {scoreText(a?.autoScore)}
                  </span>
                </div>

                <div className="stem" dangerouslySetInnerHTML={{ __html: q.stemHtml }} />

                {q.options.length ? (
                  <div className="review-block">
                    <div className="blk-label">选项</div>
                    <div style={{ lineHeight: 1.9, fontSize: 13.5 }}>
                      {q.options.map((o) => (
                        <div key={o.key}>
                          {o.key}. {o.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="review-block">
                  <div className="blk-label">学生作答</div>
                  <div className={`answer-panel ${a?.raw ? '' : 'empty-answer'} ${q.type === 'code' ? 'code' : ''}`}>
                    {q.type === 'code' ? a?.raw?.code || '（未作答）' : formatStudentAnswer(q.type, a?.raw ?? null, q.options)}
                  </div>
                </div>

                <div className="review-block">
                  <div className="blk-label">
                    参考答案
                  </div>
                  <div className="answer-panel" style={{ fontSize: 12.5 }}>
                    {formatAnswerSpec(q.type, q.answer, q.options)}
                  </div>
                </div>

                {items.length ? (
                  <div className="review-block">
                    <div className="blk-label">自动评分依据</div>
                    <div className="detail-list">
                      {items.map((item, idx) => (
                        <div key={idx} className={`detail-item ${item.ok ? 'ok' : 'bad'}`}>
                          <span className="di-mark">{item.ok ? '✓' : '✕'}</span>
                          <div className="di-body">
                            <div>
                              {item.label}　
                              <strong>
                                {scoreText(item.score, 2)} / {scoreText(item.maxScore, 2)}
                              </strong>
                              {item.note ? <span className="di-note">　{item.note}</span> : null}
                            </div>
                            {item.expected !== undefined || item.got !== undefined ? (
                              <div className="di-diff">
                                <div>期望：{item.expected ?? '—'}</div>
                                <div>实际：{item.got ?? '—'}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="review-block">
                  <div className="blk-label">评分</div>
                  <div className="score-input-row">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={q.score}
                      step={0.5}
                      value={draft?.score ?? ''}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [q.id]: { score: e.target.value, comment: prev[q.id]?.comment ?? '' },
                        }))
                      }
                    />
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      / {scoreText(q.score, 2)} 分
                    </span>
                    <div className="grow" />
                    <Button
                      size="sm"
                      variant="subtle"
                      loading={savingId === q.id}
                      onClick={() => save(q)}
                      icon="save"
                    >
                      保存本题
                    </Button>
                  </div>
                  <textarea
                    className="textarea"
                    style={{ marginTop: 10, minHeight: 64 }}
                    placeholder="评语（可选，学生发布成绩后可见）"
                    value={draft?.comment ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [q.id]: { score: prev[q.id]?.score ?? String(a?.autoScore ?? 0), comment: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <Card className="grade-box">
            <h4>本卷得分</h4>
            <div className="grade-total">
              {scoreText(totals.final)}{' '}
              <small>/ {scoreText(data.examTotalScore, 2)}</small>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="grade-line">
                <span>自动评分合计</span>
                <strong>{scoreText(totals.auto, 2)}</strong>
              </div>
              <div className="grade-line">
                <span>已人工确认</span>
                <strong>
                  {totals.graded} / {data.questions.length} 题
                </strong>
              </div>
              <div className="grade-line">
                <span>作答进度</span>
                <strong>
                  {data.answered} / {data.questionCount} 题
                </strong>
              </div>
            </div>
            <div className="divider" />
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
              修改分数后点「保存本题」立即生效，所有改动都会写入审计日志。全部确认后回到批改列表发布成绩。
            </div>
            <div style={{ marginTop: 14 }}>
              <Link className="btn btn-ghost btn-md" to={`/teacher/exam/${data.examId}/grading`} style={{ width: '100%' }}>
                完成，返回列表
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
