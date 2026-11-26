import type { ReactNode } from 'react';

const surface = 'var(--ui-surface-default)';
const subtle = 'var(--ui-surface-subtle)';
const muted = 'var(--ui-background-muted)';
const line = 'var(--ui-border-default)';
const strongLine = 'var(--ui-border-strong)';
const ink = 'var(--ui-content-secondary)';

function Illustration({ children }: { children: ReactNode }) {
  return (
    <svg className="login-hero-art" viewBox="0 0 520 420" fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function Paper({ x, y, answers = false }: { x: number; y: number; answers?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="208" height="256" rx="18" fill={surface} stroke={strongLine} />
      <path d="M24 50h160" stroke={line} />
      <path d="M24 28h67" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      {[0, 1, 2, 3].map((row) => (
        <g key={row} transform={`translate(24 ${82 + row * 42})`}>
          {answers ? <circle cx="6" r="6" fill={row === 1 ? ink : 'none'} stroke={ink} /> : null}
          <path d={`M${answers ? 26 : 0} 0H${row % 2 === 0 ? 134 : 106}`} stroke={strongLine} strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

export function TeacherArt() {
  return (
    <Illustration>
      <rect x="62" y="93" width="208" height="256" rx="18" fill={muted} stroke={line} />
      <Paper x={82} y={70} />
      <rect x="248" y="174" width="210" height="158" rx="16" fill={subtle} stroke={strongLine} />
      <path d="M274 306h158" stroke={line} />
      {[33, 62, 46, 83, 104].map((height, index) => (
        <rect key={height} x={281 + index * 29} y={305 - height} width="17" height={height} rx="3" fill={index === 4 ? ink : strongLine} />
      ))}
    </Illustration>
  );
}

export function StudentArt() {
  return (
    <Illustration>
      <rect x="121" y="91" width="208" height="256" rx="18" fill={muted} stroke={line} />
      <Paper x={144} y={69} answers />
      <circle cx="366" cy="122" r="52" fill={subtle} stroke={strongLine} />
      <circle cx="366" cy="122" r="34" stroke={line} strokeWidth="3" />
      <path d="M366 98v25l15 9" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Illustration>
  );
}

export function ChooserArt() {
  return (
    <Illustration>
      <Paper x={62} y={65} />
      <Paper x={250} y={104} answers />
      <circle cx="261" cy="207" r="32" fill={subtle} stroke={strongLine} />
      <path d="m248 207 9 9 17-18" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Illustration>
  );
}
