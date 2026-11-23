import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Space, Spin, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../../api';
import type { StudentResultPage } from '../../../shared/types';
import { TypeTag, Page, PageHeader } from '../../ui';
import { formatAnswerSpec, formatStudentAnswer, scoreText } from '../../format';

const { Title, Text } = Typography;

export function StudentResult() {  const { id } = useParams();
  const navigate = useNavigate();
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

  return (
    <Page>
      <PageHeader
        back={
          <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/student')}>
            返回考试列表
          </Button>
        }
        title={data.exam.title}
        subtitle={published ? '成绩已发布，可查看每道题的得分与解析。' : '试卷已提交，正在等待评分与发布。'}
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      {published ? (
        <>
          <div className="score-hero flex flex-wrap items-center gap-10">
            <div>
              <div className="text-[20px] font-semibold">本次得分</div>
              <div className="mt-2 text-[13px] text-white/60">
                共 {data.questions.length} 题 · 满分 {scoreText(data.totalScore)} 分
              </div>
            </div>
            <div className="text-[54px] font-bold leading-none tracking-wide">
              {scoreText(data.score)}
              <span className="ml-2 text-[16px] font-medium text-white/55">/ {scoreText(data.totalScore)}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {data.questions.map((question) => {
              const score = question.finalScore ?? 0;
              const color = score <= 0 ? '#d33c3c' : score >= question.score ? '#0f9d6e' : '#121826';
              return (
                <Card key={question.id}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[12.5px] font-semibold text-[#1f3fae]">
                      第 {question.seq} 题
                    </span>
                    <TypeTag type={question.type} />
                    <span className="ml-auto text-[14px] font-semibold" style={{ color }}>
                      {scoreText(score)} / {scoreText(question.score)}
                    </span>
                  </div>

                  <div className="stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[12px] text-[#7a839a]">我的答案</div>
                    <div className={`answer-panel ${question.raw ? '' : 'is-empty'}`}>
                      {formatStudentAnswer(question.type, question.raw, question.options)}
                    </div>
                  </div>

                  {question.type !== 'code' ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7a839a]">参考答案</div>
                      <div className="answer-panel">{formatAnswerSpec(question.type, question.answer, question.options)}</div>
                    </div>
                  ) : null}

                  {question.comment ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7a839a]">教师评语</div>
                      <div className="answer-panel">{question.comment}</div>
                    </div>
                  ) : null}

                  {question.explanationHtml ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[12px] text-[#7a839a]">解析</div>
                      <div className="stem" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card>
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <Spin size="large" />
            <Title level={4} className="!mb-2 !mt-7">
              {data.submission.status === 'grading' ? '正在自动评分…' : '等待教师批改与发布'}
            </Title>
            <Space direction="vertical" size={4} className="max-w-[420px]">
              <Text type="secondary">
                客观题由系统自动判分；简答题和代码题需要教师确认。成绩发布后刷新本页即可查看每题得分与解析。
              </Text>
            </Space>
            <Button className="mt-6" onClick={() => navigate('/student')}>
              返回考试列表
            </Button>
          </div>
        </Card>
      )}
    </Page>
  );
}
