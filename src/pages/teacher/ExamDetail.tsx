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
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { TableProps, UploadProps } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { api, del, patch, post, put } from '../../api';
import type { ExamDetailTeacher, ImportResult, QuestionTeacher } from '../../../shared/types';
import { ExamStatusTag, Page, PageHeader, TypeTag } from '../../ui';
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
      style={{ width: 80 }}
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
  const { modal } = AntApp.useApp();

  const [exam, setExam] = useState<ExamDetailTeacher | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<ExamDetailTeacher>(`/api/teacher/exams/${examId}`);
      setExam(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runImport(body: FormData | { sample: true }) {
    setImporting(true);
    setError('');
    try {
      const result = await api<ImportResult>(`/api/teacher/exams/${examId}/import`, {
        method: 'POST',
        body: body as FormData,
      });
      setImportResult(result);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setImporting(false);
    }
  }

  const uploadProps: UploadProps = {
    accept: '.docx',
    showUploadList: false,
    disabled: importing,
    customRequest: async ({ file, onSuccess, onError }) => {
      const form = new FormData();
      form.append('file', file as File);
      try {
        await runImport(form);
        onSuccess?.({});
      } catch (err) {
        onError?.(err as Error);
      }
    },
  };

  async function confirmImport() {
    if (!importResult || !exam) return;
    setBusy(true);
    try {
      await put(`/api/teacher/exams/${exam.id}/questions`, {
        questions: importResult.questions as unknown as Record<string, unknown>[],
      });
      setImportOpen(false);
      setImportResult(null);
      setNotice('题目已导入，请核对分值后发布考试');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await post(`/api/teacher/exams/${examId}/publish`);
      setNotice('考试已发布，学生端现在可以看到并作答');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
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
        await post(`/api/teacher/exams/${examId}/close`);
        await load();
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
        await del(`/api/teacher/exams/${examId}`);
        navigate('/teacher', { replace: true });
      },
    });
  }

  async function updateScore(question: QuestionTeacher, value: number) {
    try {
      await patch(`/api/teacher/questions/${question.id}`, { score: value });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存分值失败');
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
          setError(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  }

  if (!exam) {
    return (
      <Page>
        {error ? <Alert type="error" showIcon message={error} /> : <Spin />}
      </Page>
    );
  }

  const hasQuestions = exam.questions.length > 0;
  const errorCount = importResult?.counts.errors ?? 0;

  const columns: TableProps<QuestionTeacher>['columns'] = [
    { title: '题号', dataIndex: 'seq', width: 64 },
    { title: '题型', dataIndex: 'type', width: 88, render: (_, q) => <TypeTag type={q.type} /> },
    {
      title: '题干',
      dataIndex: 'stemHtml',
      render: (_, q) => <div className="max-w-[460px] text-[13.5px] leading-6">{stripHtml(q.stemHtml).slice(0, 72)}</div>,
    },
    {
      title: '答案 / 测试点',
      width: 170,
      render: (_, q) => (
        <Text type="secondary" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
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
      width: 100,
      render: (_, q) => <ScoreCell question={q} onSave={(value) => updateScore(q, value)} />,
    },
    {
      title: '',
      width: 56,
      render: (_, q) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeQuestion(q)} />
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
        title={exam.title}
        subtitle={
          <Space size={10} wrap>
            <ExamStatusTag status={exam.status} />
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
              {exam.status === 'published' ? <Button onClick={closeExam}>结束考试</Button> : null}
              <Button type="primary" onClick={() => navigate(`/teacher/exam/${exam.id}/grading`)}>
                批改与出分
              </Button>
            </>
          )
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}
      {notice ? <Alert type="success" showIcon message={notice} className="mb-4" /> : null}

      <Card
        className="mb-5"
        title="导入 Word 试卷"
        extra={
          <Button size="small" icon={<DownloadOutlined />} href="/api/template.docx" download>
            下载模板
          </Button>
        }
      >
        <p className="mb-4 text-[12.5px] leading-6 text-[#7a839a]">
          按模板填写后上传，系统会先给出解析预览，确认无误再写入试卷。
        </p>

        <Upload.Dragger {...uploadProps} style={{ background: '#fafbff' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{importing ? '正在解析…' : '把 .docx 拖到这里，或点击选择文件'}</p>
          <p className="ant-upload-hint">
            {hasQuestions
              ? '重新导入会覆盖当前全部题目；已产生学生提交后不可再导入。'
              : '支持单选、多选、判断、填空、简答、代码六种题型。'}
          </p>
        </Upload.Dragger>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="small" loading={importing} onClick={() => runImport({ sample: true })}>
            使用示例模板试导入
          </Button>
          <span className="text-[12px] text-[#7a839a]">示例模板包含六种题型，可用于快速体验完整流程。</span>
        </div>
      </Card>

      <Card
        title="题目列表"
        extra={<Tag>{exam.questions.length} 题</Tag>}
        styles={{ body: { padding: hasQuestions ? 0 : 24 } }}
      >
        {hasQuestions ? (
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={exam.questions}
            pagination={false}
            scroll={{ x: 780 }}
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
              <Tag color="blue">{importResult.counts.total} 题</Tag>
              <Tag color="green">{importResult.counts.totalScore} 分</Tag>
              {importResult.counts.errors > 0 ? <Tag color="red">{importResult.counts.errors} 个错误</Tag> : null}
              {importResult.counts.warnings > 0 ? <Tag color="gold">{importResult.counts.warnings} 个警告</Tag> : null}
            </Space>

            {importResult.notes.length ? (
              <Alert type="info" message={importResult.notes.join('；')} className="mb-3" />
            ) : null}

            <div className="pr-1">
              {importResult.questions.map((q) => {
                const hardError = q.issues.some((i) => i.level === 'error');
                return (
                  <div
                    key={q.seq}
                    className={`mb-3 rounded-xl border p-3.5 ${hardError ? 'border-[#f3c4c4] bg-[#fffafa]' : 'border-[#e4e8f2]'}`}
                  >
                    <Space size={8} wrap className="mb-2">
                      <Tag>第 {q.seq} 题</Tag>
                      <TypeTag type={q.type} />
                      <Tag color="blue">{q.score} 分</Tag>
                      {q.type === 'code' ? <Tag color="purple">{q.testCases.length} 个测试点</Tag> : null}
                    </Space>
                    <div className="whitespace-pre-wrap text-[13.5px] leading-7 text-[#39445c]">
                      {stripHtml(q.stemHtml).slice(0, 220)}
                    </div>
                    <div className="mt-2 text-[12px] text-[#7a839a]">
                      {q.type === 'code'
                        ? `语言：${q.codeSpec?.languages.join(', ') ?? 'python'}`
                        : `答案：${formatAnswerSpec(q.type, q.answer, q.options).replace(/\n/g, '；').slice(0, 90)}`}
                    </div>
                    {q.issues.length ? (
                      <Space direction="vertical" size={4} className="mt-2">
                        {q.issues.map((issue, idx) => (
                          <Tag key={idx} color={issue.level === 'error' ? 'red' : 'gold'}>
                            {issue.level === 'error' ? '错误' : '提示'}：{issue.message}
                          </Tag>
                        ))}
                      </Space>
                    ) : null}
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
