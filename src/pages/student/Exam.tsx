import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, post, put } from '../../api';
import type { QuestionStudent, StudentAnswer, StudentExamPage } from '../../../shared/types';
import { isAnswered } from '../../../shared/grading';
import { Alert, Button, Icon, Modal, Spinner, TypeBadge } from '../../ui';
import { formatCountdown, scoreText } from '../../format';

const PY_TEMPLATE = `# 从标准输入读取数据，把结果打印到标准输出
def main():
    n = int(input())
    print(n)

main()
`;

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: QuestionStudent;
  value: StudentAnswer | undefined;
  onChange: (next: StudentAnswer) => void;
}) {
  if (q.type === 'single') {
    return (
      <div className="options">
        {q.options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`option ${value?.key === o.key ? 'selected' : ''}`}
            onClick={() => onChange({ key: o.key })}
          >
            <span className="key">{o.key}</span>
            <span className="text">{o.text}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.type === 'multiple') {
    const keys = value?.keys ?? [];
    return (
      <div className="options">
        {q.options.map((o) => {
          const selected = keys.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              className={`option ${selected ? 'selected' : ''}`}
              onClick={() =>
                onChange({ keys: selected ? keys.filter((k) => k !== o.key) : [...keys, o.key].sort() })
              }
            >
              <span className="key">{o.key}</span>
              <span className="text">{o.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === 'truefalse') {
    return (
      <div className="tf-row">
        <button
          type="button"
          className={`tf-btn ${value?.value === true ? 'selected' : ''}`}
          onClick={() => onChange({ value: true })}
        >
          正确
        </button>
        <button
          type="button"
          className={`tf-btn ${value?.value === false ? 'selected' : ''}`}
          onClick={() => onChange({ value: false })}
        >
          错误
        </button>
      </div>
    );
  }

  if (q.type === 'fill') {
    const blanks = value?.blanks ?? Array.from({ length: q.blanks }, () => '');
    return (
      <div className="fills">
        {Array.from({ length: Math.max(q.blanks, 1) }).map((_, i) => (
          <div className="fill-row" key={i}>
            <span className="idx">第 {i + 1} 空</span>
            <input
              className="input"
              value={blanks[i] ?? ''}
              placeholder="填写答案"
              onChange={(e) => {
                const next = [...blanks];
                next[i] = e.target.value;
                onChange({ blanks: next });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (q.type === 'short') {
    return (
      <div className="answer-area">
        <textarea
          className="textarea"
          style={{ minHeight: 160 }}
          placeholder="请在这里作答……"
          value={value?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>
    );
  }

  // code
  const languages = q.codeSpec?.languages ?? ['python'];
  const language = value?.language ?? languages[0] ?? 'python';
  const code = value?.code ?? (q.codeSpec?.starterCode || (language === 'python' ? PY_TEMPLATE : ''));

  return (
    <div>
      <div className="code-box">
        <div className="code-bar">
          <Icon name="code" size={14} />
          <span>代码编辑器</span>
          <div className="grow" />
          <span>语言</span>
          <select
            value={language}
            onChange={(e) => onChange({ language: e.target.value, code })}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {l === 'python' ? 'Python 3' : l === 'javascript' ? 'JavaScript' : l}
              </option>
            ))}
          </select>
          <span className="muted">限时 {q.codeSpec?.timeLimitMs ?? 2000}ms / 测试点</span>
        </div>
        <textarea
          className="editor"
          spellCheck={false}
          value={code}
          onChange={(e) => onChange({ language, code: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              el.setRangeText('    ', el.selectionStart, el.selectionEnd, 'end');
              onChange({ language, code: el.value });
            }
          }}
        />
      </div>

      {q.sampleCases.length ? (
        <div className="samples">
          <div className="muted" style={{ fontSize: 12 }}>样例</div>
          {q.sampleCases.map((c, i) => (
            <div className="sample" key={i}>
              <span className="lbl">{c.label} · 输入</span>
              {c.stdin || '（无）'}
              <span className="lbl" style={{ marginTop: 8 }}>{c.label} · 输出</span>
              {c.expectedStdout}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StudentExam() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();

  const [page, setPage] = useState<StudentExamPage | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  const pageRef = useRef<StudentExamPage | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    let alive = true;
    api<StudentExamPage>(`/api/student/exams/${examId}`)
      .then((data) => {
        if (!alive) return;
        if (data.submission.status !== 'in_progress') {
          navigate(`/student/result/${data.submission.id}`, { replace: true });
          return;
        }
        pageRef.current = data;
        setPage(data);
        setAnswers(data.answers);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
    return () => {
      alive = false;
    };
  }, [examId, navigate]);

  const saveDraft = useCallback(async () => {
    const current = pageRef.current;
    if (!current) return;
    setSaving('saving');
    try {
      await put(`/api/student/submissions/${current.submission.id}/draft`, { answers: answersRef.current });
      setSaving('saved');
    } catch {
      setSaving('error');
    }
  }, []);

  useEffect(() => {
    if (!page || !dirtyRef.current) return;
    const timer = window.setTimeout(() => void saveDraft(), 900);
    return () => window.clearTimeout(timer);
  }, [answers, page, saveDraft]);

  const doSubmit = useCallback(async () => {
    const current = pageRef.current;
    if (!current || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await put(`/api/student/submissions/${current.submission.id}/draft`, { answers: answersRef.current });
      await post(`/api/student/submissions/${current.submission.id}/submit`);
      navigate(`/student/result/${current.submission.id}`, { replace: true });
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [navigate]);

  useEffect(() => {
    const deadlineAt = page?.submission.deadlineAt;
    if (!deadlineAt) return;
    const deadline = new Date(deadlineAt).getTime();
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        void doSubmit();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [page?.submission.deadlineAt, doSubmit]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  async function exit() {
    await saveDraft();
    navigate('/student');
  }

  if (!page) {
    return (
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="准备试卷…" />}
      </div>
    );
  }

  const q = page.questions[index];
  const answeredCount = page.questions.filter((item) => isAnswered(answers[String(item.id)] ?? null)).length;
  const unanswered = page.questions.length - answeredCount;
  const urgent = remaining !== null && remaining < 5 * 60 * 1000;

  return (
    <>
      <div className="exam-top">
        <button className="icon-btn" onClick={exit} title="保存并退出">
          <Icon name="arrow-left" />
        </button>
        <div className="title grow">{page.exam.title}</div>
        <div className={`exam-timer ${urgent ? 'urgent' : ''}`}>
          <Icon name="clock" size={16} />
          <span className="clock-box">{remaining === null ? '--:--' : formatCountdown(remaining)}</span>
        </div>
        <div className="save-state">
          {saving === 'saving'
            ? '保存中…'
            : saving === 'saved'
              ? '已自动保存'
              : saving === 'error'
                ? '保存失败，请检查网络'
                : '自动保存已开启'}
        </div>
        <Button onClick={() => setConfirmOpen(true)}>提交试卷</Button>
      </div>

      <div className="exam-layout">
        <div>
          {error ? <Alert tone="red">{error}</Alert> : null}

          <div className="question-card">
            <div className="q-head">
              <span className="q-num">第 {index + 1} 题</span>
              <TypeBadge type={q.type} />
              <span className="q-score">本题 {scoreText(q.score, 2)} 分</span>
            </div>

            <div className="stem" dangerouslySetInnerHTML={{ __html: q.stemHtml }} />

            <QuestionInput
              q={q}
              value={answers[String(q.id)]}
              onChange={(next) => {
                dirtyRef.current = true;
                setAnswers((prev) => ({ ...prev, [String(q.id)]: next }));
              }}
            />
          </div>

          <div className="exam-foot">
            <Button
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              上一题
            </Button>
            <span className="muted" style={{ fontSize: 12.5 }}>
              已答 {answeredCount} / {page.questions.length} 题
            </span>
            {index === page.questions.length - 1 ? (
              <Button onClick={() => setConfirmOpen(true)}>检查并提交</Button>
            ) : (
              <Button onClick={() => setIndex((i) => Math.min(page.questions.length - 1, i + 1))}>
                下一题
              </Button>
            )}
          </div>
        </div>

        <aside className="question-nav">
          <div className="nav-card">
            <h4>
              答题卡
              <span className="muted" style={{ fontWeight: 400 }}>
                {answeredCount}/{page.questions.length}
              </span>
            </h4>
            <div className="nav-grid">
              {page.questions.map((item, i) => (
                <button
                  key={item.id}
                  className={`nav-cell ${isAnswered(answers[String(item.id)] ?? null) ? 'answered' : ''} ${
                    i === index ? 'current' : ''
                  }`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="nav-legend">
              <span>
                <i style={{ background: 'var(--brand-soft)', border: '1px solid #c4d2f8' }} /> 已答
              </span>
              <span>
                <i style={{ background: '#fff', border: '1px solid var(--line-strong)' }} /> 未答
              </span>
            </div>
          </div>

          <div className="nav-card">
            <h4>提交前检查</h4>
            <div className="grade-line">
              <span>题目总数</span>
              <strong>{page.questions.length}</strong>
            </div>
            <div className="grade-line">
              <span>已作答</span>
              <strong>{answeredCount}</strong>
            </div>
            <div className="grade-line">
              <span>未作答</span>
              <strong style={{ color: unanswered ? 'var(--amber)' : undefined }}>{unanswered}</strong>
            </div>
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 8 }}>
              提交后不能修改，题目与答案会自动进入教师批改台。
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        title="确认提交试卷？"
        subtitle={`共 ${page.questions.length} 题，已作答 ${answeredCount} 题。`}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              再检查一下
            </Button>
            <Button loading={submitting} onClick={() => void doSubmit()}>
              确认提交
            </Button>
          </>
        }
      >
        {unanswered > 0 ? (
          <Alert tone="amber">
            还有 {unanswered} 题未作答，提交后这些题将按 0 分计入。仍要提交吗？
          </Alert>
        ) : (
          <Alert tone="green">所有题目均已作答，提交后自动进入批改流程。</Alert>
        )}
      </Modal>
    </>
  );
}
