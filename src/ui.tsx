import { Tag } from 'antd';
import type { ExamStatus, QuestionType, SubmissionStatus } from '../shared/types';

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  truefalse: '判断',
  fill: '填空',
  short: '简答',
  code: '代码',
};

const TYPE_COLOR: Record<QuestionType, string> = {
  single: 'blue',
  multiple: 'purple',
  truefalse: 'gold',
  fill: 'green',
  short: 'default',
  code: 'red',
};

export function TypeTag({ type }: { type: QuestionType }) {
  return (
    <Tag color={TYPE_COLOR[type]} style={{ marginInlineEnd: 0 }}>
      {TYPE_LABEL[type]}
    </Tag>
  );
}

const EXAM_META: Record<ExamStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  published: { label: '进行中', color: 'success' },
  closed: { label: '已结束', color: 'warning' },
};

export function ExamStatusTag({ status }: { status: ExamStatus }) {
  const meta = EXAM_META[status];
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

const SUB_META: Record<SubmissionStatus, { label: string; color: string }> = {
  in_progress: { label: '作答中', color: 'default' },
  submitted: { label: '待批改', color: 'warning' },
  grading: { label: '自动评分中', color: 'processing' },
  graded: { label: '已评分', color: 'success' },
};

export function SubmissionStatusTag({ status }: { status: SubmissionStatus }) {
  const meta = SUB_META[status];
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>
      智
    </div>
  );
}
