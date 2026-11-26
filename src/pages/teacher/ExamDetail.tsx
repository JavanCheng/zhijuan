import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  InputNumber,
  Modal,
  Space,
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
  const { message, modal } = AntApp.useApp();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // 已选文件（试卷 + 参考答案）；用原始 File 作为唯一数据源，避免依赖 antd 的 originFileObj
  const [picked, setPicked] = useState<File[]>([]);

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

  // 先本地收集文件（试卷 + 参考答案），点「解析并预览」再统一提交
  const uploadProps: UploadProps = {
    accept: '.docx',
    multiple: true,
    fileList: picked.map((file, i) => ({
      uid: `${i}-${file.name}-${file.size}`,
      name: file.name,
      size: file.size,
      status: 'done' as const,
    })),
    disabled: importing || (exam?.submissionCount ?? 0) > 0,
    beforeUpload: (file) => {
      setPicked((prev) => [...prev.filter((item) => item.name !== file.name), file as File].slice(-2));
      return false;
    },
    onRemove: (file) => {
      setPicked((prev) => prev.filter((item) => item.name !== file.name));
    },
    showUploadList: { showPreviewIcon: false },
  };

  async function startImport() {
    if (!picked.length) return;
    const form = new FormData();
    for (const file of picked) form.append('file', file, file.name);
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
      setPicked([]);
      void message.success('题目已导入，请核对分值后发布考试');
      await load();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/publish`);
      void message.success('考试已发布，学生工作台现在可以看到并作答');
      await load();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '发布失败');
    } finally {
      setBusy(false);
    }
  }

  function closeExam() {
    modal.confirm({
      title: '结束考试',
      content: '结束后学生将无法继续作答，确定结束吗？',
      okText: '结束考试',
      cancelText: '取消',
      onOk: async () => {
        try {
          await post(`/api/teacher/exams/${examId}/close`);
          await load();
        } catch (err) {
          void message.error(err instanceof Error ? err.message : '结束考试失败');
          throw err;
        }
      },
    });
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
          navigate('/teacher', { replace: true });
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
          <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/teacher')}>
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
              共 {exam.questionCount} 题 · 合计 {exam.totalScore} 分 · {exam.submissionCount} 人提交
            </span>
          </Space>
        }
        extra={
          exam.status === 'draft' ? (
            <>
              <Button danger onClick={removeExam}>
                删除
              </Button>
              <Button type="primary" loading={busy} disabled={!hasQuestions} onClick={publish}>
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
            { title: '批改与校准', description: `${exam.submissionCount} 份答卷` },
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
          一次可上传两份 docx：<strong>试卷</strong> + <strong>参考答案</strong>（文件名含「答案/参考」的会被识别为参考答案）。
          系统先给出解析预览，确认无误再写入试卷。
          {locked ? ' 当前已有学生提交，题目与分值已锁定，不能重新导入。' : ''}
        </p>

        <Upload.Dragger {...uploadProps} style={{ background: 'var(--ui-surface-subtle)' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {importing ? '正在解析…' : locked ? '已有学生提交，暂不可重新导入' : '把试卷和参考答案拖到这里，或点击选择文件'}
          </p>
          <p className="ant-upload-hint">
            {locked
              ? '如需修改题目，请先删除学生提交记录（当前版本未开放）或新建一场考试。'
              : hasQuestions
                ? '重新导入会覆盖当前全部题目；已产生学生提交后不可再导入。'
                : '支持两种格式：① 真实试卷（综合题材料 + 题干末尾「（单选题，2分）」+ 独立参考答案）；② 模板格式（【题型】标记）。'}
          </p>
        </Upload.Dragger>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="primary" size="small" loading={importing} disabled={locked || !picked.length} onClick={() => void startImport()}>
            解析并预览{picked.length ? `（${picked.length} 个文件）` : ''}
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
          <Button key="ok" type="primary" loading={busy} disabled={errorCount > 0} onClick={confirmImport}>
            {errorCount > 0 ? '请先修正 Word 中的错误' : '确认导入'}
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

            {importResult.notes.length ? (
              <Alert type="info" message={importResult.notes.join('；')} className="mb-3" />
            ) : null}

            <div className="pr-1">
              {importResult.questions.map((q) => {
                const hardError = q.issues.some((i) => i.level === 'error');
                const section = q.sectionIndex != null ? importResult.sections[q.sectionIndex] : undefined;
                const showSection = Boolean(section) && sectionFirstSeq.get(q.sectionIndex!) === q.seq;
                return (
                  <div key={q.seq}>
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
    </Page>
  );
}
