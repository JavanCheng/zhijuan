import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { api, post, put } from '../../api';
import type { QuestionStudent, StudentAnswer, StudentExamPage } from '../../../shared/types';
import { isAnswered } from '../../../shared/grading';
import { TypeTag, Page } from '../../ui';
import { formatCountdown, scoreText } from '../../format';

const { Text } = Typography;
const { TextArea } = Input;

const PY_TEMPLATE = `# 从标准输入读取数据，把结果打印到标准输出
def main():
    n = int(input())
    print(n)

main()
`;

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: QuestionStudent;
  value: StudentAnswer | undefined;
  onChange: (next: StudentAnswer) => void;
}) {
  if (question.type === 'single') {
    return (
      <Radio.Group
        className="option-list grid w-full gap-3"
        value={value?.key}
        onChange={(e) => onChange({ key: e.target.value })}
      >
        {question.options.map((option) => (
          <Radio key={option.key} value={option.key} style={{ margin: 0 }}>
            <span className="mr-2 font-semibold text-[#39445c]">{option.key}</span>
            {option.text}
          </Radio>
        ))}
      </Radio.Group>
    );
  }

  if (question.type === 'multiple') {
    return (
      <Checkbox.Group
        className="option-list grid w-full gap-3"
        value={value?.keys ?? []}
        onChange={(values) => onChange({ keys: [...(values as string[])].sort() })}
      >
        {question.options.map((option) => (
          <Checkbox key={option.key} value={option.key} style={{ margin: 0 }}>
            <span className="mr-2 font-semibold text-[#39445c]">{option.key}</span>
            {option.text}
          </Checkbox>
        ))}
      </Checkbox.Group>
    );
  }

  if (question.type === 'truefalse') {
    return (
      <Radio.Group
        optionType="button"
        buttonStyle="solid"
        size="large"
        value={value?.value}
        onChange={(e) => onChange({ value: e.target.value })}
      >
        <Radio.Button value={true} style={{ minWidth: 120, textAlign: 'center' }}>
          正确
        </Radio.Button>
        <Radio.Button value={false} style={{ minWidth: 120, textAlign: 'center' }}>
          错误
        </Radio.Button>
      </Radio.Group>
    );
  }

  if (question.type === 'fill') {
    const blanks = value?.blanks ?? [];
    return (
      <div className="grid gap-3">
        {Array.from({ length: Math.max(question.blanks, 1) }).map((_, i) => (
          <div className="flex items-center gap-3" key={i}>
            <span className="w-14 flex-none text-[12.5px] text-[#7a839a]">第 {i + 1} 空</span>
            <Input
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

  if (question.type === 'short') {
    return (
      <TextArea
        rows={6}
        placeholder="请在这里作答……"
        value={value?.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
      />
    );
  }

  const languages = question.codeSpec?.languages ?? ['python'];
  const language = value?.language ?? languages[0] ?? 'python';
  const code = value?.code ?? (question.codeSpec?.starterCode || (language === 'python' ? PY_TEMPLATE : ''));

  return (
    <div>
      <div className="code-shell">
        <div className="code-bar">
          <CodeOutlined />
          <span>代码编辑器</span>
          <span className="flex-1" />
          <span>语言</span>
          <Select
            size="small"
            value={language}
            style={{ width: 128 }}
            onChange={(next) => onChange({ language: next, code })}
            options={languages.map((l) => ({
              value: l,
              label: l === 'python' ? 'Python 3' : l === 'javascript' ? 'JavaScript' : l,
            }))}
          />
          <span className="text-[#64748b]">限时 {question.codeSpec?.timeLimitMs ?? 2000}ms / 测试点</span>
        </div>
        <textarea
          className="code-editor"
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

      {question.sampleCases.length ? (
        <div className="mt-4 grid gap-2">
          <Text type="secondary" style={{ fontSize: 12 }}>
            样例
          </Text>
          {question.sampleCases.map((sample, i) => (
            <div className="answer-panel" key={i} style={{ fontSize: 12.5 }}>
              <div className="mb-0.5 text-[11.5px] text-[#7a839a]">{sample.label} · 输入</div>
              {sample.stdin || '（无）'}
              <div className="mb-0.5 mt-2 text-[11.5px] text-[#7a839a]">{sample.label} · 输出</div>
              {sample.expectedStdout}
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
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </Page>
    );
  }

  const question = page.questions[index];
  const answeredCount = page.questions.filter((item) => isAnswered(answers[String(item.id)] ?? null)).length;
  const unanswered = page.questions.length - answeredCount;
  const urgent = remaining !== null && remaining < 5 * 60 * 1000;
  const saveLabel =
    saving === 'saving' ? '保存中…' : saving === 'saved' ? '已自动保存' : saving === 'error' ? '保存失败' : '自动保存已开启';

  return (
    <>
      <div className="sticky top-[62px] z-20 border-b border-[#e4e8f2] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-4 px-6 py-3 lg:px-8">
          <Button type="text" icon={<ArrowLeftOutlined />} aria-label="保存并退出" onClick={exit} />
          <div>
            <div className="text-[15.5px] font-semibold leading-tight">{page.exam.title}</div>
            <div className="mt-0.5 text-[10.5px] text-[#98a1b3]">
              {page.exam.teacherName} · 满分 {page.exam.totalScore} 分 · {page.questions.length} 题
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <span className={`exam-timer ${urgent ? 'urgent' : ''}`}>
              <ClockCircleOutlined />
              {remaining === null ? '--:--' : formatCountdown(remaining)}
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-[#98a1b3]">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  saving === 'error' ? 'bg-[#e86969]' : saving === 'saving' ? 'bg-[#f2a33c]' : 'bg-[#12b886]'
                }`}
              />
              {saveLabel}
            </span>
            <Button type="primary" onClick={() => setConfirmOpen(true)}>
              提交试卷
            </Button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-[#6f8cf5] to-[#3358e8] transition-all" style={{ width: `${(answeredCount / Math.max(1, page.questions.length)) * 100}%` }} />
      </div>

      <Page className="!py-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_288px]">
        <div>
          {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[12.5px] font-semibold text-[#1f3fae]">
                第 {index + 1} 题
              </span>
              <TypeTag type={question.type} />
              <span className="ml-auto text-[13px] text-[#7a839a]">本题 {scoreText(question.score)} 分</span>
            </div>

            <div className="stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

            <div className="mt-4">
              <QuestionInput
                question={question}
                value={answers[String(question.id)]}
                onChange={(next) => {
                  dirtyRef.current = true;
                  setAnswers((prev) => ({ ...prev, [String(question.id)]: next }));
                }}
              />
            </div>
          </Card>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              上一题
            </Button>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              已答 {answeredCount} / {page.questions.length} 题
            </Text>
            {index === page.questions.length - 1 ? (
              <Button type="primary" onClick={() => setConfirmOpen(true)}>
                检查并提交
              </Button>
            ) : (
              <Button type="primary" onClick={() => setIndex((i) => Math.min(page.questions.length - 1, i + 1))}>
                下一题
              </Button>
            )}
          </div>
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-[126px]">
          <Card
            size="small"
            title={
              <span className="flex items-center justify-between">
                <span>答题卡</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {answeredCount}/{page.questions.length}
                </Text>
              </span>
            }
          >
            <div className="grid grid-cols-6 gap-2">
              {page.questions.map((item, i) => {
                const answered = isAnswered(answers[String(item.id)] ?? null);
                const active = i === index;
                return (
                  <Button
                    key={item.id}
                    size="small"
                    type={active ? 'primary' : 'default'}
                    className={!active && answered ? '!border-[#c4d2f8] !bg-[#eef2ff] !text-[#1f3fae]' : ''}
                    onClick={() => setIndex(i)}
                  >
                    {i + 1}
                  </Button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-[#7a839a]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-[#c4d2f8] bg-[#eef2ff]" /> 已答
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-[#d3daea] bg-white" /> 未答
              </span>
            </div>
          </Card>

          <Card size="small" title="提交前检查">
            <div className="grid gap-2 text-[12.5px]">
              <div className="flex justify-between">
                <Text type="secondary">题目总数</Text>
                <strong>{page.questions.length}</strong>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">已作答</Text>
                <strong>{answeredCount}</strong>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">未作答</Text>
                <strong style={{ color: unanswered ? '#d48806' : undefined }}>{unanswered}</strong>
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              提交后不能修改，题目与答案会自动进入教师批改台。
            </Text>
          </Card>
        </aside>
        </div>
      </Page>

      <Modal
        open={confirmOpen}
        title="确认提交试卷？"
        okText="确认提交"
        cancelText="再检查一下"
        confirmLoading={submitting}
        onOk={() => void doSubmit()}
        onCancel={() => setConfirmOpen(false)}
      >
        <p className="mb-3 text-[13px] text-[#5b6479]">
          共 {page.questions.length} 题，已作答 {answeredCount} 题。
        </p>
        {unanswered > 0 ? (
          <Alert type="warning" showIcon message={`还有 ${unanswered} 题未作答，提交后这些题将按 0 分计入。`} />
        ) : (
          <Alert type="success" showIcon message="所有题目均已作答，提交后自动进入批改流程。" />
        )}
      </Modal>
    </>
  );
}
