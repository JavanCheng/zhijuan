import { memo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Radio } from 'antd';
import type { AnswerSpec, QuestionTeacher } from '../../../shared/types';
import { patch } from '../../api';
import { TypeTag } from '../../ui';

const EditableHtml = memo(function EditableHtml({ label, initial, target }: { label: string; initial: string; target: React.RefObject<HTMLDivElement | null> }) {
  return <div className="paper-edit-field">
    <span className="paper-edit-label">{label}</span>
    <div className="paper-edit-html prose-question" ref={target} role="textbox" aria-label={label} aria-multiline="true"
      contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initial }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }} onDrop={(event) => event.preventDefault()} />
  </div>;
});

export function QuestionEditor({ question, onCancel, onSaved }: {
  question: QuestionTeacher; onCancel: () => void; onSaved: (question: QuestionTeacher) => void;
}) {
  const stem = useRef<HTMLDivElement>(null);
  const explanation = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState<number | null>(question.score);
  const [options, setOptions] = useState(question.options);
  const original = question.answer;
  const [keys, setKeys] = useState(original?.kind === 'choice' ? original.keys : []);
  const [truth, setTruth] = useState(original?.kind === 'bool' ? original.value : undefined);
  const [reference, setReference] = useState(original?.kind === 'reference' ? original.text : '');
  const [blanks, setBlanks] = useState(original?.kind === 'fill' ? original.blanks.map((list) => list.join('\n')) : ['']);

  async function save() {
    if (busy.current || !stem.current || !explanation.current) return;
    const stemHtml = stem.current.innerHTML;
    const explanationHtml = explanation.current.innerHTML;
    if ((!stem.current.textContent?.trim() && !stem.current.querySelector('img')) || score == null || score <= 0) {
      setError('请填写题干并输入大于 0 的分值。'); return;
    }
    let answer: AnswerSpec = { kind: 'none' };
    if (question.type === 'single' || question.type === 'multiple') {
      if (options.some((option) => !option.text.trim()) || keys.length === 0) { setError('请填写选项并勾选参考答案。'); return; }
      answer = { ...(original?.kind === 'choice' ? original : {}), kind: 'choice', keys };
    } else if (question.type === 'truefalse') {
      if (truth == null) { setError('请选择正确或错误。'); return; }
      answer = { kind: 'bool', value: truth };
    } else if (question.type === 'fill') {
      answer = { ...(original?.kind === 'fill' ? original : {}), kind: 'fill', blanks: blanks.map((value) => value.split('\n').map((item) => item.trim()).filter(Boolean)) };
    } else if (reference.trim()) answer = { kind: 'reference', text: reference.trim() };
    busy.current = true;
    setError('');
    setSaving(true);
    try {
      const result = await patch<{ ok: true; question: QuestionTeacher }>(`/api/teacher/questions/${question.id}`, {
        stemHtml, explanationHtml: explanationHtml || null, score, options, answer,
      });
      onSaved(result.question);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存题目失败，请重试。');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <Modal open width={760} title={<span>编辑第 {question.seq} 题 <TypeTag type={question.type} /></span>}
    okText="保存题目" confirmLoading={saving} onOk={() => void save()} onCancel={() => { if (!busy.current) onCancel(); }}
    mask={{ closable: !saving }} keyboard={!saving} styles={{ body: { maxHeight: '64vh', overflowY: 'auto', paddingInlineEnd: 4 } }}>
    <div className="paper-edit-fields">
      <EditableHtml label="题干" initial={question.stemHtml} target={stem} />
      <span className="text-xs text-ui-secondary">可直接修改文字，原有图片和表格会保留，也可选中删除。</span>
      <Form.Item label="分值" className="!mb-0"><InputNumber aria-label="分值" min={0.01} max={200} value={score} onChange={setScore} /></Form.Item>
      {question.type === 'single' || question.type === 'multiple' ? <div className="paper-edit-field">
        <span className="paper-edit-label">选项与参考答案</span>
        {options.map((option, i) => <div className="paper-edit-option" key={option.key}>
          <Checkbox aria-label={`将 ${option.key} 设为参考答案`} checked={keys.includes(option.key)} onChange={(event) => {
            const checked = event.target.checked;
            setKeys((previous) => checked ? (question.type === 'single' ? [option.key] : [...previous, option.key]) : previous.filter((key) => key !== option.key));
          }}>{option.key}</Checkbox>
          <Input aria-label={`选项 ${option.key}`} value={option.text} onChange={(event) => setOptions((previous) => previous.map((item, index) => index === i ? { ...item, text: event.target.value } : item))} />
        </div>)}
      </div> : question.type === 'truefalse' ? <div className="paper-edit-field">
        <span className="paper-edit-label">参考答案</span>
        <Radio.Group value={truth} onChange={(event) => setTruth(event.target.value)} options={[{ value: true, label: '正确' }, { value: false, label: '错误' }]} />
      </div> : question.type === 'fill' ? <div className="paper-edit-field">
        <span className="paper-edit-label">各空参考答案（每行一种可接受答案）</span>
        {blanks.map((value, index) => <Input.TextArea key={index} aria-label={`第 ${index + 1} 空答案`} placeholder={`第 ${index + 1} 空`} rows={2} value={value}
          onChange={(event) => setBlanks((previous) => previous.map((item, i) => i === index ? event.target.value : item))} />)}
        {!original || original.kind === 'none' ? <Button size="small" onClick={() => setBlanks((previous) => [...previous, ''])}>添加一个空</Button> : null}
      </div> : <div className="paper-edit-field"><span className="paper-edit-label">参考答案</span><Input.TextArea aria-label="参考答案" rows={4} value={reference} onChange={(event) => setReference(event.target.value)} /></div>}
      <EditableHtml label="答案解析（可选）" initial={question.explanationHtml ?? ''} target={explanation} />
      {error ? <Alert type="error" title={error} showIcon /> : null}
    </div>
  </Modal>;
}
