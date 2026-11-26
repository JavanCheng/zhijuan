import './result.css';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Card, Progress, Spin, Steps, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, TrophyOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { StudentResultPage } from '../../../shared/types';
import { EmptyState, Page, PageHeader, Pill, SectionMaterial, TypeTag } from '../../ui';
import { formatAnswerSpec, formatDate, formatStudentAnswer, scoreText } from '../../format';

const { Title, Text } = Typography;

export function StudentResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<StudentResultPage | null>(null);
  const { message } = App.useApp();
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoadFailed(false);
    let alive = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const result = await api<StudentResultPage>(`/api/student/submissions/${id}`);
        if (!alive) return;
        setData(result);
        const pending = result.submission.status === 'grading' || result.submission.status === 'submitted';
        if (pending || !result.resultsPublished) {
          timer = window.setTimeout(load, 2500);
        }
      } catch (err) {
        if (!alive) return;
        setLoadFailed(true);
        void message.error(err instanceof Error ? err.message : '加载失败');
      }
    };

    void load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, attempt, message]);

  if (!data) {
    return (
      <Page>
        {loadFailed ? <EmptyState title="暂时无法显示成绩" action={<Button onClick={() => setAttempt((n) => n + 1)}>重试</Button>} /> : <Spin />}
      </Page>
    );
  }

  const published = data.resultsPublished && data.score != null;
  const scoreRate = published ? Math.round((data.score! / Math.max(1, data.totalScore)) * 100) : 0;
  const stepCurrent =
    data.submission.status === 'grading' || data.submission.status === 'submitted'
      ? 1
      : data.resultsPublished
        ? 4
        : 2;

  return (
    <Page>
      <PageHeader
        back={
          <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/student')}>
            返回考试列表
          </Button>
        }
        eyebrow="Result"
        title={data.exam.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {user?.className ? <Pill tone="teal">{user.className}</Pill> : null}
            <span>{published ? '成绩已发布，可查看每道题的得分与解析。' : '试卷已提交，正在等待评分与发布。'}</span>
          </span>
        }
      />


      {published ? (
        <>
          <div className="score-hero mb-5 flex flex-wrap items-center gap-4 sm:gap-8">
            <div className="relative z-10">
              <div className="text-[20px] font-semibold">本次得分</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ui-secondary">
                <span>共 {data.questions.length} 题</span>
                <span className="text-ui-tertiary">·</span>
                <span>满分 {scoreText(data.totalScore)} 分</span>
                <span className="text-ui-tertiary">·</span>
                <span>提交于 {formatDate(data.submission.submittedAt)}</span>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Pill tone="green">得分率 {scoreRate}%</Pill>
                {data.score! >= data.totalScore * 0.85 ? <Pill tone="amber">优秀</Pill> : null}
              </div>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4 sm:ml-auto sm:gap-7">
              <div className="text-right">
                <div className="text-[52px] font-bold [overflow-wrap:anywhere] leading-none tracking-wide">
                  {scoreText(data.score)}
                  <span className="ml-2 text-[15px] font-medium text-ui-secondary">/ {scoreText(data.totalScore)}</span>
                </div>
                <div className="mt-2 text-[11.5px] text-ui-secondary">感谢你的认真作答</div>
              </div>
              <Progress
                type="circle"
                percent={scoreRate}
                size={104}
                strokeWidth={7}
                trailColor="var(--ui-background-muted)"
                strokeColor="var(--ui-status-success-accent)"
                format={(value) => (
                  <span className="text-[16px] font-semibold text-ui-primary">
                    {value}
                    <span className="text-[10px] text-ui-secondary">%</span>
                  </span>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {data.questions.map((question, qIndex) => {
              const score = question.finalScore ?? 0;
              const rate = Math.round((score / Math.max(1, question.score)) * 100);
              const color = score <= 0 ? 'var(--ui-status-danger-text)' : score >= question.score ? 'var(--ui-status-success-text)' : 'var(--ui-status-warning-text)';
              const section =
                question.sectionIndex != null ? data.sections.find((s) => s.index === question.sectionIndex) : undefined;
              const isSectionStart =
                Boolean(section) && data.questions.findIndex((q) => q.sectionIndex === question.sectionIndex) === qIndex;
              return (
                <div key={question.id}>
                  {isSectionStart && section ? <SectionMaterial section={section} /> : null}
                  <Card>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-ui-muted px-2.5 py-1 text-[12.5px] font-semibold text-ui-primary">
                      第 {question.seq} 题
                    </span>
                    <TypeTag type={question.type} />
                    {score >= question.score ? <Pill tone="green">满分</Pill> : score <= 0 ? <Pill tone="red">0 分</Pill> : null}
                    <span className="ml-auto text-[14px] font-semibold tabular-nums" style={{ color }}>
                      {scoreText(score)} / {scoreText(question.score)}
                    </span>
                  </div>

                  <div className="mb-3 flex items-center gap-2">
                    <Progress
                      percent={rate}
                      showInfo={false}
                      size="small"
                      strokeColor={color}
                      trailColor="var(--ui-background-muted)"
                      style={{ margin: 0, flex: 1 }}
                    />
                    <span className="w-10 text-right text-[11px] tabular-nums text-ui-tertiary">{rate}%</span>
                  </div>

                  <div className="stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-ui-secondary">我的答案</div>
                    <div className={`answer-panel ${question.raw ? '' : 'is-empty'} ${question.type === 'code' ? 'is-code' : ''}`}>
                      {formatStudentAnswer(question.type, question.raw, question.options)}
                    </div>
                  </div>

                  {question.type !== 'code' ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-ui-secondary">参考答案</div>
                      <div className="answer-panel">{formatAnswerSpec(question.type, question.answer, question.options)}</div>
                    </div>
                  ) : null}

                  {question.comment ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-ui-secondary">教师评语</div>
                      <div className="answer-panel">{question.comment}</div>
                    </div>
                  ) : null}

                  {question.explanationHtml ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-ui-secondary">解析</div>
                      <div className="stem" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
                    </div>
                  ) : null}
                </Card>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-ui-tertiary">题目数</div>
              <div className="mt-1 text-[22px] font-semibold text-ui-primary">{data.questions.length} 题</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-ui-tertiary">满分</div>
              <div className="mt-1 text-[22px] font-semibold text-ui-primary">{scoreText(data.totalScore)} 分</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-ui-tertiary">得分率</div>
              <div className="mt-1 text-[22px] font-semibold text-ui-primary">{scoreRate}%</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-ui-tertiary">状态</div>
              <div className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-[var(--ui-status-success-text)]">
                <CheckCircleOutlined /> 已发布
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <div className="mx-auto max-w-[640px] px-2 py-10">
            <div className="mb-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ui-muted text-[24px] text-ui-primary">
                {data.submission.status === 'grading' ? <Spin /> : <ClockCircleOutlined />}
              </div>
              <Title level={4} className="!mb-2 !mt-5">
                {data.submission.status === 'grading' ? '正在自动评分…' : '等待教师批改与发布'}
              </Title>
              <Text type="secondary">
                客观题由系统自动判分；简答题和代码题需要教师确认。成绩发布后刷新本页即可查看每题得分与解析。
              </Text>
            </div>

            <Steps
              size="small"
              current={stepCurrent}
              items={[
                { title: '提交试卷', description: formatDate(data.submission.submittedAt) },
                { title: '自动评分', description: '客观题与代码题' },
                { title: '教师校准', description: '简答与主观分' },
                { title: '发布成绩', description: '查看解析' },
              ]}
            />

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/student')}>返回考试列表</Button>
              <Button type="primary" icon={<TrophyOutlined />} onClick={() => window.location.reload()}>
                刷新进度
              </Button>
            </div>
          </div>
        </Card>
      )}
    </Page>
  );
}
