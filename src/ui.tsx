import {
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { ExamStatus, QuestionType, SubmissionStatus } from '../shared/types';

const ICONS: Record<string, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />,
  download: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
  'arrow-left': <path d="M19 12H5M11 18l-6-6 6-6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </>
  ),
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  code: <path d="M8 6l-4 6 4 6M16 6l4 6-4 6" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  refresh: <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  save: <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'success';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: string;
}) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={rest.disabled || loading} {...rest}>
      {loading ? <span className="btn-spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'violet';

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

const TYPE_TONE: Record<QuestionType, Tone> = {
  single: 'blue',
  multiple: 'violet',
  truefalse: 'amber',
  fill: 'green',
  short: 'gray',
  code: 'red',
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  truefalse: '判断',
  fill: '填空',
  short: '简答',
  code: '代码',
};

export function TypeBadge({ type }: { type: QuestionType }) {
  return <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>;
}

const EXAM_STATUS: Record<ExamStatus, { label: string; tone: Tone }> = {
  draft: { label: '草稿', tone: 'gray' },
  published: { label: '进行中', tone: 'green' },
  closed: { label: '已结束', tone: 'amber' },
};

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const s = EXAM_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const SUB_STATUS: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  in_progress: { label: '作答中', tone: 'gray' },
  submitted: { label: '待批改', tone: 'amber' },
  grading: { label: '自动评分中', tone: 'blue' },
  graded: { label: '已评分', tone: 'green' },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const s = SUB_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button className="icon-btn" onClick={onClose} aria-label="关闭">
              <Icon name="x" />
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="inline-spinner">
      <span className="spinner" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name="file" size={26} />
      </div>
      <h3>{title}</h3>
      {desc ? <p>{desc}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'green' | 'blue'; children: ReactNode }) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}
