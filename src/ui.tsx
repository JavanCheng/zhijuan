import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Typography } from 'antd';
import type { ExamStatus, QuestionSection, QuestionType, SubmissionStatus } from '../shared/types';
import { stripHtml, scoreText } from './format';
import { BRAND } from './brand';

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

/** 三套品牌色：教师端蓝、学生端绿、管理员端紫 */
const BRAND_TONE = {
  blue: { from: '#7d99ff', mid: '#3f63f3', to: '#1c34b4', check: '#2a49dd' },
  green: { from: '#7ef0c8', mid: '#23c79d', to: '#0a7259', check: '#0a7a5c' },
  purple: { from: '#c4b5fd', mid: '#7c5ce6', to: '#4c2fa8', check: '#5b3bc0' },
} as const;

export type BrandTone = keyof typeof BRAND_TONE;

/**
 * 品牌标记：渐变圆角方块 + 白色折角卷面（右下角留白）+ 内嵌判分勾。
 * 主体是一块实心白形，缩到 16px 仍可辨认，因此同一形状也用作浏览器 favicon（public/favicon.svg）。
 */
export function BrandMark({ size = 38, tone = 'blue' }: { size?: number; tone?: BrandTone }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = `bm${uid}`;
  const c = BRAND_TONE[tone];
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={BRAND.name}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c.from} />
          <stop offset="52%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.to} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11.5" fill={`url(#${gid})`} />
      <rect
        x="0.9"
        y="0.9"
        width="38.2"
        height="38.2"
        rx="10.8"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.1"
      />
      {/* 卷面（折角） */}
      <path d="M10.5 10.5 H22.8 L29.5 17.2 V29.5 H10.5 Z" fill="#fff" />
      <path d="M22.8 10.5 L29.5 17.2 H22.8 Z" fill={c.to} fillOpacity="0.3" />
      {/* 判分勾 */}
      <path
        d="M14.5 21 L18 24.5 L22.6 18.4"
        fill="none"
        stroke={c.check}
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 大题材料卡：综合题一~四的材料（背景、表格、图片）只展示一次，
 * 组内小题共用，不重复写进每题题干。
 */
export function SectionMaterial({
  section,
  defaultOpen = true,
  className = '',
}: {
  section: QuestionSection;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = stripHtml(section.html).length > 0;
  return (
    <div className={`mb-4 rounded-xl border border-[#e4e8f2] bg-[#fbfcff] p-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-[var(--brand-strong)] px-2.5 py-1 text-[12.5px] font-semibold text-white">{section.title}</span>
        {section.score != null ? (
          <span className="text-[12px] text-[#7b86a0]">本大题 {scoreText(section.score)} 分</span>
        ) : null}
        {hasBody ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-lg border border-[#e4e8f2] bg-white px-2 py-1 text-[11.5px] text-[#5b6479] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            {open ? '收起材料' : '展开材料'}
          </button>
        ) : null}
      </div>
      {hasBody && open ? <div className="stem section-stem" dangerouslySetInnerHTML={{ __html: section.html }} /> : null}
    </div>
  );
}

/** 题目所属大题的小标签（列表/预览里用） */
export function SectionTag({ section }: { section: QuestionSection }) {
  return <Pill tone="blue">{section.title}</Pill>;
}
