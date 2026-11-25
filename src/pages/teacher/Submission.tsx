import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled, SaveOutlined } from '@ant-design/icons';
import { api, patch } from '../../api';
import type { GradeDetail, QuestionTeacher, SubmissionDetailTeacher } from '../../../shared/types';
import { Page, PageHeader, Pill, SectionMaterial, SubmissionStatusTag, TypeTag } from '../../ui';
import { formatAnswerSpec, formatDate, formatStudentAnswer, scoreText } from '../../format';

const { Text } = Typography;
const { TextArea } = Input;

interface Draft {
  score: string;
  comment: string;
}

export function TeacherSubmission() {
  const { id } = useParams();
  const submissionId = Number(id);
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const [data, setData] = useState<SubmissionDetailTeacher | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');

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

  const answerOf = (questionId: number) => data?.answers.find((a) => a.questionId === questionId);

  const totals = useMemo(() => {
    if (!data) return { auto: 0, final: 0, graded: 0 };
    let auto = 0;
    let final = 0;
    let graded = 0;
    for (const q of data.questions) {
      const a = data.answers.find((x) => x.questionId === q.id);
      auto += a?.autoScore ?? 0;
      const draft = drafts[q.id];
      const value = draft ? Number(draft.score) : (a?.finalScore ?? a?.autoScore ?? 0);
      final += Number.isFinite(value) ? value : 0;
      if (a?.finalScore != null) graded += 1;
    }
    return { auto, final, graded };
  }, [data, drafts]);

  async function save(question: QuestionTeacher) {
    const answer = answerOf(question.id);
    const draft = drafts[question.id];
    if (!answer || !draft) return;
    if (!answer.id) {
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
      await patch(`/api/teacher/answers/${answer.id}`, {
        finalScore: value,
        comment: draft.comment.trim() || null,
      });
      message.success(`第 ${question.seq} 题已保存`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingId(null);
    }
  }

  function jumpTo(questionId: number) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!data) {
    return (
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </Page>
    );
  }

  function questionTone(question: QuestionTeacher): string {
    const answer = answerOf(question.id);
    const draft = drafts[question.id];
    const score = draft ? Number(draft.score) : (answer?.finalScore ?? answer?.autoScore ?? 0);
    if (!answer?.raw) return '#c7cedd';
    if (!Number.isFinite(score) || score <= 0) return '#e86969';
    if (score >= question.score) return '#12b886';
    return '#f2a33c';
  }

  return (
    <Page>
      <PageHeader
        back={
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            className="!px-0"
            onClick={() => navigate(`/teacher/exam/${data.examId}/grading`)}
          >
            返回批改列表
          </Button>
        }
        eyebrow="Review"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.studentName}
            <span className="text-[13px] font-normal text-[#98a1b3]">学号 {data.studentNo}</span>
            {data.className ? <Pill tone="teal">{data.className}</Pill> : null}
          </span>
        }
        subtitle={
          <Space size={10} wrap>
            <SubmissionStatusTag status={data.status} />
            <span>
              {data.examTitle} · 提交于 {formatDate(data.submittedAt)}
            </span>
          </Space>
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" closable onClose={() => setError('')} /> : null}

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={17}>
          {data.questions.map((q, qIndex) => {
            const answer = answerOf(q.id);
            const draft = drafts[q.id];
            const detail: GradeDetail | null = answer?.autoDetail ?? null;
            const items = detail?.items ?? [];
            const isManual = q.needsManual || q.type === 'short';
            const answered = !!answer?.raw;
            const tone = questionTone(q);
            const section = q.sectionIndex != null ? data.sections.find((s) => s.index === q.sectionIndex) : undefined;
            const isSectionStart =
              Boolean(section) && data.questions.findIndex((item) => item.sectionIndex === q.sectionIndex) === qIndex;

            return (
              <Fragment key={q.id}>
                {isSectionStart && section ? <SectionMaterial section={section} /> : null}
                <Card
                  id={`question-${q.id}`}
                  className="mb-4"
                  style={{ scrollMarginTop: 84, borderLeft: `3px solid ${tone}` }}
                >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[12.5px] font-semibold text-[#1f3fae]">
                    第 {q.seq} 题
                  </span>
                  <TypeTag type={q.type} />
                  {isManual ? <Pill tone="amber">需人工评分</Pill> : null}
                  {!answered ? <Pill tone="red">未作答</Pill> : null}
                  <span className="ml-auto text-[12.5px] text-[#7b86a0]">
                    满分 {scoreText(q.score)} · 自动得分 {scoreText(answer?.autoScore)}
                  </span>
                </div>

                <div className="stem" dangerouslySetInnerHTML={{ __html: q.stemHtml }} />

                {q.options.length ? (
                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7b86a0]">选项</div>
                    <div className="leading-8">
                      {q.options.map((o) => (
                        <div key={o.key}>
                          {o.key}. {o.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3.5">
                  <div className="mb-1.5 text-[12px] text-[#7b86a0]">学生作答</div>
                  <div className={`answer-panel ${answered ? '' : 'is-empty'} ${q.type === 'code' ? 'is-code' : ''}`}>
                    {q.type === 'code' ? answer?.raw?.code || '（未作答）' : formatStudentAnswer(q.type, answer?.raw ?? null, q.options)}
                  </div>
                </div>

                <div className="mt-3.5">
                  <div className="mb-1.5 text-[12px] text-[#7b86a0]">参考答案</div>
                  <div className="answer-panel">{formatAnswerSpec(q.type, q.answer, q.options)}</div>
                </div>

                {items.length ? (
                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7b86a0]">自动评分依据</div>
                    <div className="grid gap-2">
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border px-3 py-2 text-[12.5px] ${item.ok ? 'border-[#c7ebdd] bg-[#e7f7f0]' : 'border-[#f4d2d2] bg-[#fdeeee]'}`}
                        >
                          <div className="flex items-start gap-2">
                            {item.ok ? (
                              <CheckCircleFilled style={{ color: '#0f9d6e', marginTop: 3 }} />
                            ) : (
                              <CloseCircleFilled style={{ color: '#d33c3c', marginTop: 3 }} />
                            )}
                            <div className="min-w-0">
                              <div>
                                {item.label}　
                                <strong>
                                  {scoreText(item.score)} / {scoreText(item.maxScore)}
                                </strong>
                                {item.note ? <span className="text-[#7b86a0]">　{item.note}</span> : null}
                              </div>
                              {item.expected !== undefined || item.got !== undefined ? (
                                <div className="mt-1 whitespace-pre-wrap font-mono text-[11.5px] text-[#5b6479]">
                                  <div>期望：{item.expected ?? '—'}</div>
                                  <div>实际：{item.got ?? '—'}</div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl border border-[#eef1f8] bg-[#fbfcff] p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-[#4b5670]">评分</span>
                    <span className="text-[11.5px] text-[#98a1b3]">改动会写入审计日志</span>
                    <div className="ml-auto flex gap-1">
                      <Button size="small" type="text" onClick={() => setDrafts((prev) => ({ ...prev, [q.id]: { score: '0', comment: prev[q.id]?.comment ?? '' } }))}>
                        0 分
                      </Button>
                      <Button size="small" type="text" onClick={() => setDrafts((prev) => ({ ...prev, [q.id]: { score: String(q.score), comment: prev[q.id]?.comment ?? '' } }))}>
                        满分
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <InputNumber
                      min={0}
                      max={q.score}
                      step={1}
                      style={{ width: 110 }}
                      value={draft?.score != null ? Number(draft.score) : null}
                      onChange={(value) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [q.id]: { score: value == null ? '' : String(value), comment: prev[q.id]?.comment ?? '' },
                        }))
                      }
                    />
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      / {scoreText(q.score)} 分
                    </Text>
                    <div className="flex-1" />
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<SaveOutlined />}
                      loading={savingId === q.id}
                      onClick={() => save(q)}
                    >
                      保存本题
                    </Button>
                  </div>
                  <TextArea
                    rows={2}
                    className="mt-2.5"
                    placeholder="评语（可选，学生发布成绩后可见）"
                    value={draft?.comment ?? ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [q.id]: {
                          score: prev[q.id]?.score ?? String(answer?.autoScore ?? 0),
                          comment: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                </Card>
              </Fragment>
            );
          })}
        </Col>

        <Col xs={24} xl={7}>
          <Card style={{ position: 'sticky', top: 82 }}>
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-semibold text-[#26304a]">本卷得分</div>
              <Tag bordered={false} color="blue">
                {data.questions.length} 题
              </Tag>
            </div>
            <Statistic
              value={totals.final}
              precision={Number.isInteger(totals.final) ? 0 : 1}
              suffix={`/ ${scoreText(data.examTotalScore)}`}
              valueStyle={{ fontSize: 31, fontWeight: 700, color: '#1a2338' }}
            />

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef1f8]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6f8cf5] to-[#3358e8]"
                style={{ width: `${Math.min(100, (totals.final / Math.max(1, data.examTotalScore)) * 100)}%` }}
              />
            </div>

            <Divider style={{ margin: '14px 0' }} />

            <div className="grid gap-2 text-[12.5px]">
              <div className="flex justify-between">
                <Text type="secondary">自动评分合计</Text>
                <strong>{scoreText(totals.auto)}</strong>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">已人工确认</Text>
                <strong>
                  {totals.graded} / {data.questions.length} 题
                </strong>
              </div>
              <div className="flex justify-between">
                <Text type="secondary">作答进度</Text>
                <strong>
                  {data.answered} / {data.questionCount} 题
                </strong>
              </div>
            </div>

            <Progress
              percent={Math.round((totals.graded / Math.max(1, data.questions.length)) * 100)}
              size="small"
              className="mt-3"
              showInfo={false}
            />

            <div className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-[#98a1b3]">题目导航</div>
            <div className="grid grid-cols-6 gap-1.5">
              {data.questions.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  title={`第 ${q.seq} 题`}
                  onClick={() => jumpTo(q.id)}
                  className="grid h-8 place-items-center rounded-lg border text-[11.5px] font-medium transition hover:border-[#3358e8]"
                  style={{
                    borderColor: `${questionTone(q)}55`,
                    background: `${questionTone(q)}14`,
                    color: questionTone(q),
                  }}
                >
                  {q.seq}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10.5px] text-[#98a1b3]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#12b886]" /> 满分
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#f2a33c]" /> 部分分
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#e86969]" /> 0 分
              </span>
            </div>

            <Text type="secondary" style={{ fontSize: 11.5, lineHeight: 1.8, display: 'block', marginTop: 12 }}>
              修改分数后点「保存本题」立即生效，所有改动都会写入审计日志。
            </Text>

            <Button block className="mt-3" onClick={() => navigate(`/teacher/exam/${data.examId}/grading`)}>
              完成，返回列表
            </Button>
          </Card>
        </Col>
      </Row>
    </Page>
  );
}
