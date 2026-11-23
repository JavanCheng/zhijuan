import type { ReactNode } from 'react';
import { Tag, Typography } from 'antd';
import type { ExamStatus, QuestionType, SubmissionStatus } from '../shared/types';

const { Title } = Typography;

/** 统一的页面容器：宽度、左右留白、上下间距 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-6 py-7 lg:px-8 ${className}`}>{children}</div>;
}

/** 统一的页头：标题、副标题、右侧操作区，可选返回链接 */
export function PageHeader({
  title,
  subtitle,
  extra,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back ? <div className="mb-2.5">{back}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Title level={3} style={{ margin: 0, fontSize: 22, lineHeight: 1.4 }}>
            {title}
          </Title>
          {subtitle ? <div className="mt-2 text-[13px] leading-6 text-[#7a839a]">{subtitle}</div> : null}
        </div>
        {extra ? <div className="flex flex-wrap items-center gap-2">{extra}</div> : null}
      </div>
    </div>
  );
}

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
