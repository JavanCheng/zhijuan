import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Progress, Spin, Steps, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, TrophyOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { StudentResultPage } from '../../../shared/types';
import { Page, PageHeader, Pill, TypeTag } from '../../ui';
import { formatAnswerSpec, formatDate, formatStudentAnswer, scoreText } from '../../format';

const { Title, Text } = Typography;

export function StudentResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<StudentResultPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const result = await api<StudentResultPage>(`/api/student/submissions/${id}`);
        if (!alive) return;
        setData(result);
        setError('');
        const pending = result.submission.status === 'grading' || result.submission.status === 'submitted';
        if (pending || !result.resultsPublished) {
          timer = window.setTimeout(load, 2500);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : '加载失败');
      }
    };

    void load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  if (!data) {
    return (
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
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

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      {published ? (
        <>
          <div className="score-hero mb-5 flex flex-wrap items-center gap-8">
            <div className="relative z-10">
              <div className="text-[20px] font-semibold">本次得分</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-white/60">
                <span>共 {data.questions.length} 题</span>
                <span className="text-white/25">·</span>
                <span>满分 {scoreText(data.totalScore)} 分</span>
                <span className="text-white/25">·</span>
                <span>提交于 {formatDate(data.submission.submittedAt)}</span>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Pill tone="green">得分率 {scoreRate}%</Pill>
                {data.score! >= data.totalScore * 0.85 ? <Pill tone="amber">优秀</Pill> : null}
              </div>
            </div>
            <div className="relative z-10 ml-auto flex items-center gap-7">
              <div className="text-right">
                <div className="text-[52px] font-bold leading-none tracking-wide">
                  {scoreText(data.score)}
                  <span className="ml-2 text-[15px] font-medium text-white/55">/ {scoreText(data.totalScore)}</span>
                </div>
                <div className="mt-2 text-[11.5px] text-white/45">感谢你的认真作答</div>
              </div>
              <Progress
                type="circle"
                percent={scoreRate}
                size={104}
                strokeWidth={7}
                trailColor="rgba(255,255,255,.14)"
                strokeColor={{ '0%': '#7dd3b0', '100%': '#38d9a9' }}
                format={(value) => (
                  <span className="text-[16px] font-semibold text-white">
                    {value}
                    <span className="text-[10px] text-white/55">%</span>
                  </span>
                )}
              />
            </div>
          </div>

          <div className="grid gap-3">
            {data.questions.map((question) => {
              const score = question.finalScore ?? 0;
              const rate = Math.round((score / Math.max(1, question.score)) * 100);
              const color = score <= 0 ? '#bf3737' : score >= question.score ? '#0f7a56' : '#a3680d';
              return (
                <Card key={question.id}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[12.5px] font-semibold text-[#1f3fae]">
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
                      trailColor="#eef1f8"
                      style={{ margin: 0, flex: 1 }}
                    />
                    <span className="w-10 text-right text-[11px] tabular-nums text-[#98a1b3]">{rate}%</span>
                  </div>

                  <div className="stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7b86a0]">我的答案</div>
                    <div className={`answer-panel ${question.raw ? '' : 'is-empty'} ${question.type === 'code' ? 'is-code' : ''}`}>
                      {formatStudentAnswer(question.type, question.raw, question.options)}
                    </div>
                  </div>

                  {question.type !== 'code' ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7b86a0]">参考答案</div>
                      <div className="answer-panel">{formatAnswerSpec(question.type, question.answer, question.options)}</div>
                    </div>
                  ) : null}

                  {question.comment ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7b86a0]">教师评语</div>
                      <div className="answer-panel">{question.comment}</div>
                    </div>
                  ) : null}

                  {question.explanationHtml ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7b86a0]">解析</div>
                      <div className="stem" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-[#98a1b3]">题目数</div>
              <div className="mt-1 text-[22px] font-semibold text-[#1a2338]">{data.questions.length} 题</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-[#98a1b3]">满分</div>
              <div className="mt-1 text-[22px] font-semibold text-[#1a2338]">{scoreText(data.totalScore)} 分</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-[#98a1b3]">得分率</div>
              <div className="mt-1 text-[22px] font-semibold text-[#3358e8]">{scoreRate}%</div>
            </Card>
            <Card styles={{ body: { padding: 16 } }}>
              <div className="text-[11.5px] text-[#98a1b3]">状态</div>
              <div className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-[#0f7a56]">
                <CheckCircleOutlined /> 已发布
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <div className="mx-auto max-w-[640px] px-2 py-10">
            <div className="mb-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eef2ff] text-[24px] text-[#3358e8]">
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

            <div className="mt-8 flex justify-center gap-2">
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
