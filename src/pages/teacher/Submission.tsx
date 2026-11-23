import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SubmissionStatusTag, TypeTag } from '../../ui';
import { formatAnswerSpec, formatDate, formatStudentAnswer, scoreText } from '../../format';

const { Title, Text } = Typography;
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
      const value = draft ? Number(draft.score) : a?.finalScore ?? a?.autoScore ?? 0;
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

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="!mb-2 !px-0"
        onClick={() => navigate(`/teacher/exam/${data.examId}/grading`)}
      >
        返回批改列表
      </Button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title level={3} style={{ marginBottom: 6 }}>
            {data.studentName}
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 10 }}>
              {data.studentNo}
            </Text>
          </Title>
          <Space size={10} wrap>
            <SubmissionStatusTag status={data.status} />
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {data.examTitle} · 提交于 {formatDate(data.submittedAt)}
            </Text>
          </Space>
        </div>
      </div>

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={17}>
          {data.questions.map((q) => {
            const answer = answerOf(q.id);
            const draft = drafts[q.id];
            const detail: GradeDetail | null = answer?.autoDetail ?? null;
            const items = detail?.items ?? [];
            const isManual = q.type === 'short';

            return (
              <Card key={q.id} className="mb-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[12.5px] font-semibold text-[#1f3fae]">
                    第 {q.seq} 题
                  </span>
                  <TypeTag type={q.type} />
                  {isManual ? <Tag color="gold">需人工评分</Tag> : null}
                  <span className="ml-auto text-[13px] text-[#7a839a]">
                    满分 {scoreText(q.score, 2)} · 自动得分 {scoreText(answer?.autoScore)}
                  </span>
                </div>

                <div className="stem" dangerouslySetInnerHTML={{ __html: q.stemHtml }} />

                {q.options.length ? (
                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7a839a]">选项</div>
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
                  <div className="mb-1.5 text-[12px] text-[#7a839a]">学生作答</div>
                  <div
                    className={`answer-panel ${answer?.raw ? '' : 'is-empty'} ${q.type === 'code' ? 'is-code' : ''}`}
                  >
                    {q.type === 'code' ? answer?.raw?.code || '（未作答）' : formatStudentAnswer(q.type, answer?.raw ?? null, q.options)}
                  </div>
                </div>

                <div className="mt-3.5">
                  <div className="mb-1.5 text-[12px] text-[#7a839a]">参考答案</div>
                  <div className="answer-panel">{formatAnswerSpec(q.type, q.answer, q.options)}</div>
                </div>

                {items.length ? (
                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7a839a]">自动评分依据</div>
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
                                  {scoreText(item.score, 2)} / {scoreText(item.maxScore, 2)}
                                </strong>
                                {item.note ? <span className="text-[#7a839a]">　{item.note}</span> : null}
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

                <div className="mt-4">
                  <div className="mb-1.5 text-[12px] text-[#7a839a]">评分</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <InputNumber
                      min={0}
                      max={q.score}
                      step={0.5}
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
                      / {scoreText(q.score, 2)} 分
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
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [q.id]: {
                          score: prev[q.id]?.score ?? String(answer?.autoScore ?? 0),
                          comment: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </Card>
            );
          })}
        </Col>

        <Col xs={24} xl={7}>
          <Card style={{ position: 'sticky', top: 20 }}>
            <div className="text-[14px] font-semibold">本卷得分</div>
            <Statistic
              value={Number(scoreText(totals.final, 2))}
              precision={1}
              suffix={`/ ${scoreText(data.examTotalScore, 2)}`}
              valueStyle={{ fontSize: 30, fontWeight: 700 }}
            />

            <Divider style={{ margin: '14px 0' }} />

            <div className="grid gap-2 text-[12.5px]">
              <div className="flex justify-between">
                <Text type="secondary">自动评分合计</Text>
                <strong>{scoreText(totals.auto, 2)}</strong>
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

            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.8 }}>
              修改分数后点「保存本题」立即生效，所有改动都会写入审计日志。
            </Text>

            <Button
              block
              className="mt-3"
              onClick={() => navigate(`/teacher/exam/${data.examId}/grading`)}
            >
              完成，返回列表
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
