import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { StudentResultPage } from '../../../shared/types';
import { Alert, Card, Icon, Spinner, TypeBadge } from '../../ui';
import { formatAnswerSpec, formatStudentAnswer, scoreText } from '../../format';

export function StudentResult() {
  const { id } = useParams();
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
        const notPublished = !result.resultsPublished;
        if (pending || notPublished) {
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
      <div className="page">
        {error ? <Alert tone="red">{error}</Alert> : <Spinner label="加载成绩…" />}
      </div>
    );
  }

  const published = data.resultsPublished && data.score != null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/student" className="row muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <Icon name="arrow-left" size={15} /> 返回考试列表
          </Link>
          <h1 className="page-title">{data.exam.title}</h1>
          <p className="page-sub">
            {published ? '成绩已发布，可查看每道题的得分与解析。' : '试卷已提交，正在等待评分与发布。'}
          </p>
        </div>
      </div>

      {error ? <Alert tone="red">{error}</Alert> : null}

      {published ? (
        <>
          <div className="result-hero">
            <div>
              <div className="r-title">本次得分</div>
              <div className="r-sub">
                共 {data.questions.length} 题 · 满分 {scoreText(data.totalScore, 2)} 分
              </div>
            </div>
            <div className="score-big">
              {scoreText(data.score, 2)}
              <small>/ {scoreText(data.totalScore, 2)}</small>
            </div>
          </div>

          <div className="result-list">
            {data.questions.map((q) => {
              const s = q.finalScore ?? 0;
              const cls = s <= 0 ? 'zero' : s >= q.score ? 'full' : '';
              return (
                <div className="result-item" key={q.id}>
                  <div className="ri-head">
                    <span className="q-num">第 {q.seq} 题</span>
                    <TypeBadge type={q.type} />
                    <span className={`ri-score ${cls}`}>
                      {scoreText(s, 2)} / {scoreText(q.score, 2)}
                    </span>
                  </div>
                  <div className="stem" dangerouslySetInnerHTML={{ __html: q.stemHtml }} />

                  <div className="result-detail">
                    <div style={{ marginTop: 10 }}>
                      <div className="rd-label">我的答案</div>
                      <div className="answer-panel" style={{ fontSize: 13 }}>
                        {formatStudentAnswer(q.type, q.raw, q.options)}
                      </div>
                    </div>
                    {q.type !== 'code' ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="rd-label">参考答案</div>
                        <div className="answer-panel" style={{ fontSize: 13 }}>
                          {formatAnswerSpec(q.type, q.answer, q.options)}
                        </div>
                      </div>
                    ) : null}
                    {q.comment ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="rd-label">教师评语</div>
                        <div className="answer-panel" style={{ fontSize: 13 }}>
                          {q.comment}
                        </div>
                      </div>
                    ) : null}
                    {q.explanationHtml ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="rd-label">解析</div>
                        <div className="stem" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: q.explanationHtml }} />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Card>
          <div className="waiting">
            <div className="ring" />
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>
              {data.submission.status === 'grading' ? '正在自动评分…' : '等待教师批改与发布'}
            </h3>
            <p className="muted" style={{ maxWidth: 380, lineHeight: 1.8 }}>
              客观题由系统自动判分；简答题和代码题需要教师确认。成绩发布后刷新本页即可查看每题得分与解析。
            </p>
            <div style={{ marginTop: 18 }}>
              <Link className="btn btn-ghost btn-md" to="/student">
                返回考试列表
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
