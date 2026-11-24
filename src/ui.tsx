import type { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';
import type { ExamStatus, QuestionType, SubmissionStatus } from '../shared/types';

const { Title } = Typography;

/** 统一的页面容器：宽度、左右留白、上下间距 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`page-shell page-enter ${className}`}>{children}</div>;
}

/** 统一的页头：标题、副标题、右侧操作区，可选返回链接 */
export function PageHeader({
  title,
  subtitle,
  extra,
  back,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  back?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back ? <div className="mb-2.5">{back}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <div className="page-eyebrow mb-1.5">{eyebrow}</div> : null}
          <Title level={3} className="page-title">
            {title}
          </Title>
          {subtitle ? <div className="mt-2 text-[13px] leading-6 text-[#7b86a0]">{subtitle}</div> : null}
        </div>
        {extra ? <div className="flex flex-wrap items-center gap-2">{extra}</div> : null}
      </div>
    </div>
  );
}

export type PillTone = 'blue' | 'purple' | 'teal' | 'amber' | 'red' | 'gray' | 'green';

export function Pill({
  tone = 'gray',
  children,
  pulse = false,
}: {
  tone?: PillTone;
  children: ReactNode;
  pulse?: boolean;
}) {
  return <span className={`pill pill-${tone} ${pulse ? 'pill-dot-pulse' : ''}`}>{children}</span>;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  truefalse: '判断',
  fill: '填空',
  short: '简答',
  code: '代码',
};

const TYPE_TONE: Record<QuestionType, PillTone> = {
  single: 'blue',
  multiple: 'purple',
  truefalse: 'amber',
  fill: 'teal',
  short: 'gray',
  code: 'red',
};

export function TypeTag({ type }: { type: QuestionType }) {
  return <Pill tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Pill>;
}

const EXAM_META: Record<ExamStatus, { label: string; tone: PillTone }> = {
  draft: { label: '草稿', tone: 'gray' },
  published: { label: '进行中', tone: 'green' },
  closed: { label: '已结束', tone: 'amber' },
};

export function ExamStatusTag({ status }: { status: ExamStatus }) {
  const meta = EXAM_META[status];
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

const SUB_META: Record<SubmissionStatus, { label: string; tone: PillTone }> = {
  in_progress: { label: '作答中', tone: 'gray' },
  submitted: { label: '待批改', tone: 'amber' },
  grading: { label: '自动评分中', tone: 'blue' },
  graded: { label: '已评分', tone: 'green' },
};

export function SubmissionStatusTag({ status }: { status: SubmissionStatus }) {
  const meta = SUB_META[status];
  return (
    <Pill tone={meta.tone} pulse={status === 'grading'}>
      {meta.label}
    </Pill>
  );
}

const TONE_STYLE: Record<PillTone, { color: string; soft: string }> = {
  blue: { color: '#3358e8', soft: '#edf1ff' },
  purple: { color: '#7048c8', soft: '#f3edff' },
  teal: { color: '#0b7a63', soft: '#e8f8f3' },
  amber: { color: '#b87711', soft: '#fff5e5' },
  red: { color: '#c43c3c', soft: '#fdeeee' },
  gray: { color: '#626d85', soft: '#f1f3f8' },
  green: { color: '#0f7a56', soft: '#e9f8f1' },
};

/** 统一的指标卡：图标 + 标签 + 主数值 + 辅助说明 */
export function StatCard({
  label,
  value,
  suffix,
  icon,
  tone = 'blue',
  hint,
  precision,
}: {
  label: ReactNode;
  value: number | string;
  suffix?: ReactNode;
  icon?: ReactNode;
  tone?: PillTone;
  hint?: ReactNode;
  precision?: number;
}) {
  const palette = TONE_STYLE[tone];
  const display =
    typeof value === 'number' && precision != null ? value.toFixed(precision).replace(/\.0+$/, '') : value;
  return (
    <div className="stat-card" style={{ '--tone': palette.color, '--tone-soft': palette.soft } as CSSProperties}>
      <div className="stat-card-body">
        <div className="flex items-start justify-between gap-3">
          <div className="stat-label">{label}</div>
          {icon ? <div className="stat-icon">{icon}</div> : null}
        </div>
        <div className="stat-value">
          {display}
          {suffix ? <span className="stat-suffix">{suffix}</span> : null}
        </div>
        {hint ? <div className="stat-hint">{hint}</div> : null}
      </div>
    </div>
  );
}

/** 图表 / 内容面板，统一标题与说明排版 */
export function Panel({
  title,
  desc,
  extra,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: ReactNode;
  desc?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`chart-card h-full ${className}`}>
      <div className="chart-card-head">
        <div className="min-w-0">
          <div className="chart-card-title">{title}</div>
          {desc ? <div className="chart-card-desc">{desc}</div> : null}
        </div>
        {extra ? <div className="flex flex-wrap items-center gap-2">{extra}</div> : null}
      </div>
      <div className={`chart-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eef2ff] text-[22px] text-[#3358e8]">
        {icon ?? '✦'}
      </div>
      <div className="mt-4 text-[16px] font-semibold text-[#1a2338]">{title}</div>
      {description ? <div className="mt-2 max-w-[420px] text-[12.5px] leading-6 text-[#7b86a0]">{description}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>
      智
    </div>
  );
}
