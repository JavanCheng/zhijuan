import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  InputNumber,
  Modal,
  Space,
  Checkbox,
  Radio,
  Spin,
  Steps,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { TableProps, UploadProps } from 'antd';
import {
  ArrowLeftOutlined,
  BarChartOutlined,
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { api, del, patch, post, put } from '../../api';
import type { ExamDetailTeacher, ImportResult, QuestionTeacher } from '../../../shared/types';
import { EmptyState, ExamStatusTag, IconButton, Page, PageHeader, Pill, SectionMaterial, SectionTag, TypeTag } from '../../ui';
import { formatAnswerSpec, scoreText, stripHtml } from '../../format';

const { Text } = Typography;

function ScoreCell({ question, onSave }: { question: QuestionTeacher; onSave: (value: number) => void }) {
  const [value, setValue] = useState<number | null>(question.score);
  return (
    <InputNumber
      size="small"
      min={0.5}
      max={200}
      step={1}
      value={value}
      style={{ width: 82 }}
      onChange={setValue}
      onBlur={() => {
        if (value != null && value !== question.score) onSave(value);
      }}
    />
  );
}

export function TeacherExam() {
  const { id } = useParams();
  const examId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const from: unknown = location.state?.returnTo;
  const returnTo = typeof from === 'string' && /^\/teacher(?:\?|$)/.test(from) ? from : '/teacher';
  const { message, modal } = AntApp.useApp();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [audience, setAudience] = useState<'classes' | 'school'>('classes');
  const [classIds, setClassIds] = useState<number[]>([]);
  const [classes, setClasses] = useState<Array<{ id: number; name: string; activeCount: number }> | null>(null);
  const [publishError, setPublishError] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [studentPreview, setStudentPreview] = useState(false);
  const [closeAction, setCloseAction] = useState<'collect' | 'discard'>('collect');
  const [runtimeAvailable, setRuntimeAvailable] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [files, setFiles] = useState<Partial<Record<'paper' | 'answer', File>>>({});
  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    try {
      const data = await api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`);
      if (!isCurrent()) return;
      setExam(data);
      setLoadFailed(false);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadFailed(true);
      void message.error({ key: 'teacher-exam-load', content: err instanceof Error ? err.message : '加载失败' });
    }
  }, [message, examId]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  async function runImport(body: FormData | { sample: true }) {
    setImporting(true);
    try {
      const result = await api<ImportResult>(`/api/teacher/exams/${examId}/import`, {
        method: 'POST',
        body: body as FormData,
      });
      setImportResult(result);
      setImportOpen(true);
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '解析失败');
    } finally {
      setImporting(false);
    }
  }

  function uploadProps(role: 'paper' | 'answer'): UploadProps {
    const file = files[role];
    return {
      accept: '.docx', maxCount: 1,
      fileList: file ? [{ uid: role, name: file.name, status: 'done' }] : [],
      disabled: importing || (exam?.submissionCount ?? 0) > 0,
      beforeUpload: (next) => {
        if (!/\.docx$/i.test(next.name)) { void message.warning('请选择 .docx 文件'); return Upload.LIST_IGNORE; }
        setFiles((current) => ({ ...current, [role]: next }));
        return false;
      },
      onRemove: () => { setFiles((current) => ({ ...current, [role]: undefined })); },
    };
  }

  async function startImport() {
    if (!files.paper) return;
    const form = new FormData();
    form.append('paper', files.paper);
    if (files.answer) form.append('answer', files.answer);
    await runImport(form);
  }
  async function confirmImport() {
    if (!importResult || !exam) return;
    setBusy(true);
    try {
      await put(`/api/teacher/exams/${exam.id}/questions`, {
        questions: importResult.questions as unknown as Record<string, unknown>[],
        sections: importResult.sections as unknown as Record<string, unknown>[],
      });
      setImportOpen(false);
      setImportResult(null);
      setFiles({});
      void message.success('题目已导入，请核对分值后发布考试');
      await load();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function openPublish() {
    setPublishOpen(true);
    setPublishError('');
    setRuntimeAvailable(null);
    if (exam?.questions.some((question) => question.type === 'code')) {
      void api<{ python: boolean }>('/api/auth/runtime').then((runtime) => setRuntimeAvailable(Boolean(runtime.python)), () => setRuntimeAvailable(false));
    }
    try {
      const result = await api<{ classes: Array<{ id: number; name: string; activeCount: number }> }>('/api/teacher/classes/overview');
      setClasses(result.classes);
    } catch {
      setPublishError('班级名册加载失败，请关闭后重试。');
    }
  }

  async function publish() {
    setBusy(true);
    setPublishError('');
    try {
      await post(`/api/teacher/exams/${examId}/publish`, { audience: audience === 'school' ? { type: 'school' } : { type: 'classes', classIds } });
      setPublishOpen(false);
      void message.success('考试已发布，应考名单已保存');
      await load();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setBusy(false);
    }
  }

  function closeExam() {
    setCloseAction('collect');
    setCloseOpen(true);
  }

  async function confirmClose() {
    setBusy(true);
    try {
      const result = await post<{ collected: number; discarded: number }>(`/api/teacher/exams/${examId}/close`, { action: closeAction });
      setCloseOpen(false);
      void message.success(`考试已结束 · 已收卷 ${result.collected} 份 · 未收卷 ${result.discarded} 份`);
      await load();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '结束考试失败');
    } finally {
      setBusy(false);
    }
  }

  function removeExam() {
    modal.confirm({
      title: '删除考试',
      content: '删除后不可恢复，确定删除这场考试吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await del(`/api/teacher/exams/${examId}`);
          navigate(returnTo, { replace: true });
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '删除考试失败');
          throw err;
        }
      },
    });
  }

  async function updateScore(question: QuestionTeacher, value: number) {
    try {
      await patch(`/api/teacher/questions/${question.id}`, { score: value });
      await load();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '保存分值失败');
    }
  }

  function removeQuestion(question: QuestionTeacher) {
    modal.confirm({
      title: `删除第 ${question.seq} 题`,
      content: '删除后题号会自动重排，确定删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await del(`/api/teacher/questions/${question.id}`);
          await load();
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  }

  if (!exam) {
    return (
      <Page>
        {loadFailed ? <EmptyState title="试卷详情暂不可用" action={<Button onClick={() => void load()}>重试</Button>} /> : <Spin />}
      </Page>
    );
  }

  const hasQuestions = exam.questions.length > 0;
  const locked = exam.submissionCount > 0;
  const errorCount = importResult?.counts.errors ?? 0;
  const previewQuestions = importResult?.questions ?? [];
  const reviewQuestions = previewQuestions.filter((question) => question.needsManual).length;
  const missingAnswers = previewQuestions.filter((question) => !question.needsManual && question.type !== 'code' && question.answer.kind === 'none').length;
  const problemQuestions = previewQuestions.filter((question) => question.issues.length > 0);
  // 每个大题的第一题（用于预览里只展示一次材料）
  const sectionFirstSeq = new Map<number, number>();
  for (const q of importResult?.questions ?? []) {
    if (q.sectionIndex != null && !sectionFirstSeq.has(q.sectionIndex)) sectionFirstSeq.set(q.sectionIndex, q.seq);
  }

  let stepCurrent = 0;
  if (hasQuestions) stepCurrent = 1;
  if (exam.status !== 'draft') stepCurrent = 2;
  if (exam.resultsPublished) stepCurrent = 4;

  const columns: TableProps<QuestionTeacher>['columns'] = [
    { title: '题号', dataIndex: 'seq', width: 64 },
    {
      title: '大题',
      width: 104,
      render: (_, q) => {
        const section = q.sectionIndex != null ? exam.sections[q.sectionIndex] : undefined;
        return section ? <SectionTag section={section} /> : <span className="text-[12px] text-ui-tertiary">—</span>;
      },
    },
    { title: '题型', dataIndex: 'type', width: 88, render: (_, q) => <TypeTag type={q.type} /> },
    {
      title: '题干',
      dataIndex: 'stemHtml',
      render: (_, q) => (
        <div className="max-w-[520px] [overflow-wrap:anywhere] text-[13.5px] leading-6 text-ui-primary">{stripHtml(q.stemHtml).slice(0, 90)}</div>
      ),
    },
    {
      title: '答案 / 测试点',
      width: 170,
      render: (_, q) => (
        <Text type="secondary" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {q.type === 'code'
            ? `${q.testCases.length} 个测试点`
            : q.type === 'short'
              ? '人工评分'
              : formatAnswerSpec(q.type, q.answer, q.options).split('\n')[0]}
        </Text>
      ),
    },
    {
      title: '分值',
      width: 108,
      render: (_, q) => <ScoreCell question={q} onSave={(value) => updateScore(q, value)} />,
    },
    {
      title: '',
      width: 56,
      render: (_, q) => (
        <IconButton
          type="text"
          label={`删除第 ${q.seq} 题`}
          danger
          size="small"
          disabled={locked}
          icon={<DeleteOutlined />}
          onClick={() => removeQuestion(q)}
        />
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        back={
          <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate(returnTo)}>
            返回考试列表
          </Button>
        }
        eyebrow="Exam"
        title={exam.title}
        subtitle={
          <Space size={10} wrap>
            <ExamStatusTag status={exam.status} />
            {exam.resultsPublished ? <Pill tone="green">成绩已发布</Pill> : null}
            <span>
              共 {exam.questionCount} 题 · 合计 {exam.totalScore} 分 · {exam.progress.submitted} 人交卷
            </span>
          </Space>
        }
        extra={
          exam.status === 'draft' ? (
            <>
              <Button disabled={!hasQuestions} onClick={() => setStudentPreview(true)}>学生视角预览</Button>
              <Button danger onClick={removeExam}>
                删除
              </Button>
              <Button type="primary" loading={busy} disabled={!hasQuestions} onClick={() => void openPublish()}>
                发布考试
              </Button>
            </>
          ) : (
            <>
              <Button icon={<BarChartOutlined />} onClick={() => navigate(`/teacher/analytics?examId=${exam.id}`)}>
                学情看板
              </Button>
              {exam.status === 'published' ? <Button onClick={closeExam}>结束考试</Button> : null}
              <Button type="primary" onClick={() => navigate(`/teacher/exam/${exam.id}/grading`)}>
                批改与出分
              </Button>
            </>
          )
        }
      />


      <Card className="mb-5" styles={{ body: { padding: '18px 22px' } }}>
        <Steps
          size="small"
          current={Math.min(stepCurrent, 4)}
          items={[
            { title: '导入题目', description: `${exam.questionCount} 题` },
            { title: '发布考试', description: '学生开始作答' },
            { title: '批改与校准', description: `${exam.progress.submitted} 份已交卷` },
            { title: '成绩发布', description: exam.resultsPublished ? '已发布' : '待发布' },
          ]}
        />
      </Card>

      <Card
        className="mb-5"
        title="导入 Word 试卷"
        extra={
          <Button size="small" icon={<DownloadOutlined />} href="/api/template.docx" download>
            下载模板
          </Button>
        }
      >
        <p className="mb-4 text-[12.5px] leading-6 text-ui-secondary">
          分别上传试卷和可选的参考答案，无需修改文件名。
          系统先给出解析预览，确认无误再写入试卷。
          {locked ? ' 当前已有学生提交，题目与分值已锁定，不能重新导入。' : ''}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Upload.Dragger {...uploadProps('paper')} style={{ background: 'var(--ui-surface-subtle)' }}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">试卷 Word（必选）</p>
            <p className="ant-upload-hint">拖入试卷，或点击选择 .docx</p>
          </Upload.Dragger>
          <Upload.Dragger {...uploadProps('answer')} style={{ background: 'var(--ui-surface-subtle)' }}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">参考答案（可选）</p>
            <p className="ant-upload-hint">答案已写在试卷内时可留空</p>
          </Upload.Dragger>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="primary" size="small" loading={importing} disabled={locked || !files.paper} onClick={() => void startImport()}>
            解析并预览
          </Button>
          <Button size="small" loading={importing} disabled={locked} onClick={() => runImport({ sample: true })}>
            使用示例模板试导入
          </Button>
          <span className="text-[12px] text-ui-secondary">示例模板包含六种题型，可用于快速体验完整流程。</span>
        </div>
      </Card>

      <Card
        title="题目列表"
        extra={
          <Space size={8} wrap>
            {exam.sections.length ? <Pill>{exam.sections.length} 道大题</Pill> : null}
            <Pill>{exam.questions.length} 题</Pill>
            <Pill>合计 {scoreText(exam.totalScore)} 分</Pill>
          </Space>
        }
        styles={{ body: { padding: hasQuestions ? 0 : 24 } }}
      >
        {hasQuestions ? (
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={exam.questions}
            pagination={false}
            scroll={{ x: 940 }}
          />
        ) : (
          <Empty description="试卷还没有题目，上传 Word 或使用示例模板试导入" />
        )}
      </Card>

      <Modal
        open={importOpen}
        width={860}
        title="解析预览"
        onCancel={() => setImportOpen(false)}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
        footer={[
          <Button key="cancel" onClick={() => setImportOpen(false)}>
            取消
          </Button>,
          <Button key="ok" type="primary" loading={busy} disabled={errorCount > 0 || !previewQuestions.length} onClick={confirmImport}>
            {errorCount > 0 ? '请先修正 Word 中的错误' : hasQuestions ? '替换现有题目' : '确认导入'}
          </Button>,
        ]}
      >
        {importResult ? (
          <>
            <Space size={8} wrap className="mb-3">
              {importResult.sections.length ? <Pill tone="purple">{importResult.sections.length} 道大题</Pill> : null}
              <Pill tone="blue">{importResult.counts.total} 题</Pill>
              <Pill tone="green">{importResult.counts.totalScore} 分</Pill>
              {importResult.counts.errors > 0 ? <Pill tone="red">{importResult.counts.errors} 个错误</Pill> : null}
              {importResult.counts.warnings > 0 ? <Pill tone="amber">{importResult.counts.warnings} 个警告</Pill> : null}
            </Space>

            {reviewQuestions > 0 || missingAnswers > 0 ? (
              <Space size={8} wrap className="mb-3">
                {reviewQuestions ? <Pill tone="amber">{reviewQuestions} 题需人工评分</Pill> : null}
                {missingAnswers ? <Pill tone="amber">{missingAnswers} 题缺少自动评分答案</Pill> : null}
              </Space>
            ) : null}
            {hasQuestions ? <Alert className="mb-3" type="warning" showIcon title="确认后会替换现有全部题目" /> : null}
            {problemQuestions.length ? (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ui-secondary">定位问题题目：</span>
                {problemQuestions.map((q) => <Button key={q.seq} size="small" type="link" onClick={() => {
                  const target = document.getElementById(`import-preview-q-${q.seq}`);
                  target?.scrollIntoView({ block: 'nearest' });
                  target?.focus({ preventScroll: true });
                }}>第 {q.seq} 题</Button>)}
              </div>
            ) : null}
            {importResult.notes.length ? (
              <Alert type="info" message={importResult.notes.join('；')} className="mb-3" />
            ) : null}

            <div className="pr-1">
              {importResult.questions.map((q) => {
                const hardError = q.issues.some((i) => i.level === 'error');
                const section = q.sectionIndex != null ? importResult.sections[q.sectionIndex] : undefined;
                const showSection = Boolean(section) && sectionFirstSeq.get(q.sectionIndex!) === q.seq;
                return (
                  <div key={q.seq} id={`import-preview-q-${q.seq}`} tabIndex={-1}>
                    {showSection && section ? <SectionMaterial section={section} defaultOpen={false} /> : null}
                    <div
                      className={`mb-3 rounded-xl border p-3.5 ${hardError ? 'border-[var(--ui-status-danger-accent)] bg-[var(--ui-status-danger-bg)]' : 'border-ui-line'}`}
                    >
                      <Space size={8} wrap className="mb-2">
                        <Pill>第 {q.seq} 题</Pill>
                        {section ? <Pill>{section.title}</Pill> : null}
                        <TypeTag type={q.type} />
                        <Pill>{q.score} 分</Pill>
                        {q.needsManual ? <Pill tone="amber">需人工评分</Pill> : null}
                        {q.type === 'code' ? <Pill>{q.testCases.length} 个测试点</Pill> : null}
                      </Space>
                      <div className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[13.5px] leading-7 text-ui-primary">
                        {stripHtml(q.stemHtml).slice(0, 220)}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-[12px] text-ui-secondary">
                        {q.type === 'code'
                          ? `语言：${q.codeSpec?.languages.join(', ') ?? 'python'}`
                          : `答案：${formatAnswerSpec(q.type, q.answer, q.options).slice(0, 160)}`}
                      </div>
                      {q.issues.length ? (
                        <Space direction="vertical" size={4} className="mt-2">
                          {q.issues.map((issue, idx) => (
                            <Pill key={idx} tone={issue.level === 'error' ? 'red' : 'amber'}>
                              {issue.level === 'error' ? '错误' : '提示'}：{issue.message}
                            </Pill>
                          ))}
                        </Space>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </Modal>
      <Modal open={studentPreview} title="学生视角预览" width={820} footer={null} onCancel={() => setStudentPreview(false)}
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}>
        <div className="grid gap-4">
          {exam.questions.map((question, index) => {
            const section = exam.sections.find((item) => item.index === question.sectionIndex);
            const firstInSection = index === 0 || exam.questions[index - 1]?.sectionIndex !== question.sectionIndex;
            return <article key={question.id} className="rounded-lg border border-ui-line p-4">
              {section && firstInSection ? <SectionMaterial section={section} /> : null}
              <div className="mb-2 font-medium">第 {question.seq} 题 · {scoreText(question.score)} 分 <TypeTag type={question.type} /></div>
              <div className="question-html" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
              {question.options.length ? <ul className="mt-2 list-none pl-0">{question.options.map((option) => <li key={option.key}>{option.key}. {option.text}</li>)}</ul> : null}
            </article>;
          })}
        </div>
      </Modal>
      <Modal open={publishOpen} title="检查并发布考试" okText="发布考试" confirmLoading={busy} onOk={() => void publish()}
        onCancel={() => setPublishOpen(false)} okButtonProps={{ disabled: !classes || (audience === 'classes' && classIds.length === 0) }}>
        <div className="grid gap-3">
          <p>发布时会保存启用学生的应考名单，之后转班不会改变本场考试的名单。</p>
          {runtimeAvailable === false ? <Alert type="warning" showIcon title="暂无法确认 Python 运行环境" description="代码题可能无法自动评分。建议先联系管理员检查运行环境，或准备人工评分。" /> : null}
          <Radio.Group value={audience} onChange={(event) => setAudience(event.target.value)} options={[
            { value: 'classes', label: '指定班级' }, { value: 'school', label: '全校启用学生' },
          ]} />
          {audience === 'classes' ? <div role="group" aria-label="应考班级" className="max-h-56 overflow-auto rounded-lg border border-ui-line p-3">
            {!classes ? (publishError ? null : <Spin size="small" />) : classes.length ? (
              <Checkbox.Group className="!grid gap-2" value={classIds} onChange={(values) => setClassIds(values.map(Number))}
                options={classes.map((item) => ({ value: item.id, label: `${item.name}（${item.activeCount} 位启用）`, disabled: item.activeCount === 0 }))} />
            ) : <p>暂无班级，请先在班级管理中添加。</p>}
            {classes && classIds.length ? <p className="mt-3 text-ui-secondary">预计应考 {classes.filter((item) => classIds.includes(item.id)).reduce((total, item) => total + item.activeCount, 0)} 人，最终以发布时名册为准。</p> : null}
          </div> : (
            <Alert type="warning" showIcon title="全校启用学生均可参加考试" />
          )}
          {publishError ? <Alert type="error" showIcon title={publishError} /> : null}
        </div>
      </Modal>
      <Modal open={closeOpen} title="结束考试" okText="确认结束" confirmLoading={busy} onOk={() => void confirmClose()}
        onCancel={() => setCloseOpen(false)}>
        <div className="grid gap-3">
          <p>当前显示有 {exam.progress.inProgress} 位学生答题中。结束后不能继续作答。</p>
          <Radio.Group value={closeAction} onChange={(event) => setCloseAction(event.target.value)} options={[
            { value: 'collect', label: '按已保存答案收卷，并进入评分' },
            { value: 'discard', label: '不收未交草稿，不计入成绩' },
          ]} />
        </div>
      </Modal>
    </Page>
  );
}
