import { useId, useMemo, useRef, useState } from 'react';
import { ArrowLeftOutlined, CheckOutlined, ClockCircleOutlined, EyeOutlined, FileTextOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ExamDetailTeacher, QuestionSection, QuestionTeacher } from '../../../shared/types';
import { scoreText, typeLabel } from '../../format';
import './teacher-paper-preview.css';

interface TeacherPaperPreviewProps {
  exam: ExamDetailTeacher;
  onBack?: () => void;
  draft?: boolean;
}

interface PaperGroup {
  key: string;
  section: QuestionSection | null;
  questions: QuestionTeacher[];
}

function groupQuestions(questions: QuestionTeacher[], sections: QuestionSection[]): PaperGroup[] {
  const sectionsByIndex = new Map(sections.map((section) => [section.index, section]));
  const sectionGroups = new Map<number, PaperGroup>();
  const groups: PaperGroup[] = [];
  for (const question of [...questions].sort((a, b) => a.seq - b.seq)) {
    const section = question.sectionIndex == null ? undefined : sectionsByIndex.get(question.sectionIndex);
    if (section) {
      const existing = sectionGroups.get(section.index);
      if (existing) existing.questions.push(question);
      else {
        const group = { key: `section-${section.index}`, section, questions: [question] };
        sectionGroups.set(section.index, group);
        groups.push(group);
      }
    } else {
      const previous = groups.at(-1);
      if (previous && !previous.section) previous.questions.push(question);
      else groups.push({ key: `standalone-${question.id}`, section: null, questions: [question] });
    }
  }
  return groups;
}

function hasReference(question: QuestionTeacher) {
  const answer = question.answer;
  switch (answer?.kind) {
    case 'choice': return answer.keys.some((key) => key.trim().length > 0);
    case 'bool': return typeof answer.value === 'boolean';
    case 'fill': return answer.blanks.some((blank) => blank.some((value) => value.trim().length > 0));
    case 'reference': return answer.text.trim().length > 0;
    default: return false;
  }
}

function NoReference({ children }: { children?: string }) {
  return <span className="teacher-paper-no-reference">{children ?? '未提供参考答案'}</span>;
}

function OptionRows({ options, keys, multiple = false }: {
  options: { key: string; text: string }[];
  keys: string[];
  multiple?: boolean;
}) {
  const chosenKeys = new Set(keys.map((key) => key.trim().toUpperCase()).filter(Boolean));
  const optionKeys = new Set(options.map((option) => option.key.trim().toUpperCase()));
  const unmatched = [...chosenKeys].filter((key) => !optionKeys.has(key));
  return (
    <>
      {!!options.length && <ul className="teacher-paper-options" aria-label="题目选项">
        {options.map((option, index) => {
          const chosen = chosenKeys.has(option.key.trim().toUpperCase());
          return (
            <li key={`${option.key}-${index}`} className={`teacher-paper-option${chosen ? ' is-reference' : ''}`}>
              <span className={`teacher-paper-indicator${multiple ? ' is-multiple' : ''}`} aria-hidden="true">
                {chosen && <CheckOutlined />}
              </span>
              {option.key !== option.text && <strong>{option.key}</strong>}
              <span className="teacher-paper-option-text">{option.text}</span>
              {chosen && <span className="teacher-paper-option-label">参考答案</span>}
            </li>
          );
        })}
      </ul>}
      {!chosenKeys.size && <NoReference />}
      {!!unmatched.length && <p className="teacher-paper-answer-note">参考选项：{unmatched.join('、')}（未匹配到对应选项）</p>}
    </>
  );
}

function CodeReference({ question, reference }: { question: QuestionTeacher; reference: string }) {
  const samples = question.testCases.filter((item) => item.visible || item.score <= 0);
  const languages = (question.codeSpec?.languages ?? []).map((language) => {
    if (language.toLowerCase() === 'python') return 'Python 3';
    if (language.toLowerCase() === 'javascript') return 'JavaScript';
    return language;
  });
  return (
    <>
      <div className="teacher-paper-code">
        <div className="teacher-paper-code-bar"><strong>参考代码</strong>{languages.length > 0 && <span>{languages.join(' / ')}</span>}</div>
        {reference ? <pre tabIndex={0}><code>{reference}</code></pre> : <div className="teacher-paper-code-empty"><NoReference>{question.needsManual ? '未提供参考代码 · 由教师人工评分' : '未提供参考代码 · 根据测试点评分'}</NoReference></div>}
      </div>
      {!!samples.length && <details className="teacher-paper-samples">
        <summary>学生可见的输入输出样例（{samples.length}）</summary>
        {samples.map((item, index) => (
          <div key={item.id} className="teacher-paper-sample">
            <div><strong>样例 {index + 1} · 输入</strong><pre>{item.stdin || '—'}</pre></div>
            <div><strong>预期输出</strong><pre>{item.expectedStdout || '—'}</pre></div>
          </div>
        ))}
      </details>}
    </>
  );
}

function AnswerPreview({ question }: { question: QuestionTeacher }) {
  const answer = question.answer;
  if (question.type === 'single' || question.type === 'multiple') {
    return <OptionRows options={question.options} keys={answer?.kind === 'choice' ? answer.keys : []} multiple={question.type === 'multiple'} />;
  }
  if (question.type === 'truefalse') {
    const value = answer?.kind === 'bool' ? answer.value : null;
    return <OptionRows options={[{ key: '正确', text: '正确' }, { key: '错误', text: '错误' }]} keys={value === null ? [] : [value ? '正确' : '错误']} />;
  }
  if (question.type === 'fill') {
    const fill = answer?.kind === 'fill' ? answer : null;
    if (!fill || !fill.blanks.length) return <NoReference />;
    return <ol className="teacher-paper-blanks" aria-label="各空参考答案">
      {fill.blanks.map((blank, index) => {
        const variants = [...new Set(blank.filter((value) => value.trim().length > 0))];
        return <li key={index}>
          <span className="teacher-paper-blank-label">第 {index + 1} 空{fill.blankScores?.[index] != null && <small>{scoreText(fill.blankScores[index])} 分</small>}</span>
          <div className="teacher-paper-blank-answer">
            {variants.length ? <><div className="teacher-paper-answer-value">{variants[0]}</div>{variants.length > 1 && <div className="teacher-paper-answer-note">也接受：{variants.slice(1).join('；')}</div>}</> : <NoReference>{fill.manualBlanks?.[index] ? '开放答案 · 由教师人工评分' : undefined}</NoReference>}
            {!!variants.length && fill.manualBlanks?.[index] && <div className="teacher-paper-answer-note">此空由教师人工评分</div>}
          </div>
        </li>;
      })}
    </ol>;
  }
  const reference = answer?.kind === 'reference' ? answer.text.trim() : '';
  if (question.type === 'code') return <CodeReference question={question} reference={reference} />;
  return reference ? <div className="teacher-paper-reference-text">{reference}</div> : <NoReference>{question.needsManual ? '未提供参考答案 · 由教师人工评分' : undefined}</NoReference>;
}

export function TeacherPaperPreview({ exam, onBack, draft = exam.status === 'draft' }: TeacherPaperPreviewProps) {
  const groups = useMemo(() => groupQuestions(exam.questions, exam.sections), [exam.questions, exam.sections]);
  const questionCount = exam.questions.length;
  const missingCount = exam.questions.filter((question) => !hasReference(question)).length;
  const id = useId();
  const questionRefs = useRef(new Map<number, HTMLElement>());
  const [jumpedTo, setJumpedTo] = useState<number | null>(null);

  function jumpTo(questionId: number) {
    const question = questionRefs.current.get(questionId);
    if (!question) return;
    setJumpedTo(questionId);
    question.scrollIntoView({ block: 'start' });
    question.focus({ preventScroll: true });
  }

  return (
    <div className="teacher-paper-preview" aria-label="试卷预览">
      {onBack && <Button className="teacher-paper-back" type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>返回考试列表</Button>}
      <header className="teacher-paper-hero">
        <div className="teacher-paper-hero-main">
          <div className="teacher-paper-eyebrow"><EyeOutlined aria-hidden="true" /> 试卷预览 <span>{draft ? '草稿' : '只读'}</span></div>
          <h2>{exam.title}</h2>
          {exam.description && <p className="teacher-paper-description">{exam.description}</p>}
          <div className="teacher-paper-meta">
            <span><FileTextOutlined aria-hidden="true" /> {questionCount} 题 · 满分 {scoreText(exam.totalScore)} 分</span>
            <span><ClockCircleOutlined aria-hidden="true" /> {exam.durationMin} 分钟</span>
          </div>
        </div>
        <div className="teacher-paper-reference-banner"><CheckOutlined aria-hidden="true" /><div><strong>教师核对版</strong><p>按学生答题样式展示，已填入参考答案。此预览不记录作答。</p></div></div>
      </header>
      {questionCount ? (
        <div className="teacher-paper-layout">
          <nav className="teacher-paper-nav" aria-label="题目导航">
            <div className="teacher-paper-nav-title"><UnorderedListOutlined aria-hidden="true" /><strong>题目导航</strong><span>{questionCount} 题</span></div>
            <div className="teacher-paper-nav-groups">
              {groups.map(({ key, section, questions }) => (
                <div key={key} className="teacher-paper-nav-group">
                  <div className="teacher-paper-nav-group-title">{section?.title ?? '独立题目'}</div>
                  <div className="teacher-paper-nav-numbers">{questions.map((question) => (
                    <button key={question.id} type="button" aria-label={`跳转第 ${question.seq} 题`}
                      aria-current={jumpedTo === question.id ? 'location' : undefined}
                      className={!hasReference(question) ? 'is-missing' : undefined}
                      onClick={() => jumpTo(question.id)}>{question.seq}</button>
                  ))}</div>
                </div>
              ))}
            </div>
            {missingCount > 0 && <div className="teacher-paper-nav-note"><i aria-hidden="true" /> {missingCount} 题未录入参考答案</div>}
          </nav>
          <div className="teacher-paper-body">
            {groups.map(({ key, section, questions }) => (
              <section className="teacher-paper-group" key={key} aria-labelledby={`${id}-${key}`}>
                <div className="teacher-paper-group-heading">
                  <h3 id={`${id}-${key}`}>{section?.title ?? '独立题目'}</h3>
                  <span>{questions.length} 题{section?.score != null ? ` · ${scoreText(section.score)} 分` : ''}</span>
                </div>
                {section?.html && <div className="stem section-stem teacher-paper-material" dangerouslySetInnerHTML={{ __html: section.html }} />}
                <div className="teacher-paper-question-list">
                  {questions.map((question) => (
                    <article key={question.id} tabIndex={-1} aria-labelledby={`${id}-question-${question.id}`} className="teacher-paper-question"
                      ref={(node) => { if (node) questionRefs.current.set(question.id, node); else questionRefs.current.delete(question.id); }}>
                      <div className="teacher-paper-question-header">
                        <span className="teacher-paper-number" aria-hidden="true">{question.seq}</span>
                        <h4 id={`${id}-question-${question.id}`}><span className="sr-only">第 {question.seq} 题 · </span>{typeLabel(question.type)}</h4>
                        {question.needsManual && <span className="teacher-paper-manual">人工评分</span>}
                        <span className="teacher-paper-score">{scoreText(question.score)} 分</span>
                      </div>
                      <div className="stem teacher-paper-stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
                      <div className="teacher-paper-answer"><div className="teacher-paper-answer-title">参考答案</div><AnswerPreview question={question} /></div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : <div className="teacher-paper-empty"><FileTextOutlined aria-hidden="true" /><strong>暂时没有题目</strong><p>导入试卷后，题目和参考答案会在这里显示。</p></div>}
    </div>
  );
}
