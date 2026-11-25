// 登录页左侧的纯图形视觉（不含任何文字）：
// - TeacherArt：卷面层叠 + 成绩环 + 柱状趋势
// - StudentArt：单张答题卡 + 计时环 + 选项与进度
// - ChooserArt：卷面卡与答题卡合流 + 一枚判分徽标
// 所有图形都留出 24px 以上安全边距，并由 CSS 的 overflow: visible 兜底，避免边缘被视口裁切。
import { useId } from 'react';

export type ArtAccent = [string, string];

interface ArtIds {
  accent: string;
  bar: string;
  glow: string;
  edge: string;
  shadow: string;
}

function useArtIds(): ArtIds {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  return {
    accent: `ac${raw}`,
    bar: `ba${raw}`,
    glow: `gl${raw}`,
    edge: `ed${raw}`,
    shadow: `sh${raw}`,
  };
}

function ArtDefs({ ids, from, to }: { ids: ArtIds; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={ids.accent} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
      <linearGradient id={ids.bar} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={to} stopOpacity="0.16" />
        <stop offset="100%" stopColor={from} stopOpacity="0.9" />
      </linearGradient>
      <radialGradient id={ids.glow}>
        <stop offset="0%" stopColor={from} stopOpacity="0.48" />
        <stop offset="62%" stopColor={from} stopOpacity="0.12" />
        <stop offset="100%" stopColor={from} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.edge} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="rgba(255,255,255,0.44)" />
        <stop offset="52%" stopColor="rgba(255,255,255,0.13)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
      </linearGradient>
      <filter id={ids.shadow} x="-45%" y="-45%" width="190%" height="190%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#020a1f" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

/** 四角星：用二次曲线画，比十字更像「亮点」 */
function Sparkle({ x, y, r = 9, opacity = 0.5 }: { x: number; y: number; r?: number; opacity?: number }) {
  const k = r * 0.16;
  return (
    <path
      d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`}
      fill="#fff"
      opacity={opacity}
    />
  );
}

const TEACHER_ROWS = [
  { y: 290, w: 168 },
  { y: 322, w: 136 },
  { y: 354, w: 182 },
  { y: 386, w: 150 },
  { y: 418, w: 104 },
];
const TEACHER_CELLS = Array.from({ length: 6 }, (_, i) => ({
  x: 165 + (i % 3) * 32,
  y: 462 + Math.floor(i / 3) * 32,
  filled: i === 0,
}));
const TEACHER_BARS = [
  { x: 304, h: 54 },
  { x: 352, h: 92 },
  { x: 400, h: 72 },
  { x: 448, h: 132 },
  { x: 496, h: 104 },
];

export function TeacherArt({ accent }: { accent: ArtAccent }) {
  const ids = useArtIds();
  const [from, to] = accent;
  return (
    <svg
      className="login-hero-art"
      viewBox="0 0 600 700"
      role="presentation"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ArtDefs ids={ids} from={from} to={to} />

      {/* 环境光 */}
      <circle cx="446" cy="176" r="150" fill={`url(#${ids.glow})`} className="login-art-breathe" />
      <circle cx="150" cy="566" r="118" fill={`url(#${ids.glow})`} opacity="0.5" />

      {/* 成绩环 */}
      <g className="login-art-float">
        <circle
          cx="462"
          cy="214"
          r="100"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1.4"
          strokeDasharray="2 9"
        />
        <circle cx="462" cy="214" r="82" fill="rgba(255,255,255,0.04)" />
        <circle cx="462" cy="214" r="82" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="9" />
        <circle
          cx="462"
          cy="214"
          r="82"
          fill="none"
          stroke={`url(#${ids.accent})`}
          strokeWidth="18"
          opacity="0.14"
          strokeLinecap="round"
          strokeDasharray="402 515"
          transform="rotate(-90 462 214)"
        />
        <circle
          cx="462"
          cy="214"
          r="82"
          fill="none"
          stroke={`url(#${ids.accent})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="402 515"
          transform="rotate(-90 462 214)"
        />
        <circle cx="382" cy="199" r="5.5" fill="#fff" />
      </g>

      {/* 卷面层叠 */}
      <g transform="rotate(-10 280 370)">
        <rect
          x="130"
          y="205"
          width="300"
          height="330"
          rx="26"
          fill="rgba(255,255,255,0.03)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.2"
        />
      </g>
      <g transform="rotate(-4.5 280 370)" filter={`url(#${ids.shadow})`}>
        <rect
          x="130"
          y="205"
          width="300"
          height="330"
          rx="26"
          fill="rgba(255,255,255,0.055)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.2"
        />
      </g>
      <g transform="rotate(1 280 370)">
        <rect
          x="130"
          y="205"
          width="300"
          height="330"
          rx="26"
          fill="rgba(255,255,255,0.085)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.3"
          filter={`url(#${ids.shadow})`}
        />
        <path d="M170 206.5 H390" stroke="rgba(255,255,255,0.30)" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="165" y="245" width="92" height="10" rx="5" fill="rgba(255,255,255,0.52)" />
        {TEACHER_ROWS.map((row) => (
          <g key={row.y}>
            <rect x="165" y={row.y} width={row.w} height="9" rx="4.5" fill="rgba(255,255,255,0.20)" />
            <circle cx="382" cy={row.y + 4.5} r="7.5" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1.6" />
          </g>
        ))}
        {TEACHER_CELLS.map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            width="22"
            height="22"
            rx="7"
            fill={cell.filled ? `url(#${ids.accent})` : 'none'}
            fillOpacity={cell.filled ? 0.7 : 1}
            stroke={cell.filled ? 'none' : 'rgba(255,255,255,0.16)'}
            strokeWidth="1.3"
          />
        ))}
      </g>

      {/* 判分徽标：落在成绩环下方、卷面右侧的空白处 */}
      <g transform="rotate(6 455 325)">
        <rect x="423" y="293" width="64" height="64" rx="22" fill={`url(#${ids.accent})`} opacity="0.16" />
        <rect
          x="432"
          y="302"
          width="46"
          height="46"
          rx="15"
          fill={`url(#${ids.accent})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1"
        />
        <path
          d="M444 326 l7.5 7.5 l14 -16"
          fill="none"
          stroke="#fff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* 柱状趋势 */}
      <g>
        <line x1="292" y1="624" x2="566" y2="624" stroke="rgba(255,255,255,0.13)" strokeWidth="1.6" strokeLinecap="round" />
        {TEACHER_BARS.map((bar, i) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={624 - bar.h}
            width="26"
            height={bar.h}
            rx="10"
            fill={`url(#${ids.bar})`}
            opacity={0.55 + i * 0.1}
          />
        ))}
        <polyline
          points="317,570 365,532 413,552 461,492 509,520"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.8"
          strokeDasharray="4 6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="509" cy="520" r="4.5" fill="#fff" />
      </g>

      <Sparkle x={536} y={96} r={10} opacity={0.42} />
      <Sparkle x={168} y={126} r={6} opacity={0.28} />
      <circle cx="126" cy="330" r="3" fill="rgba(255,255,255,0.30)" />
      <circle cx="566" cy="452" r="2.6" fill="rgba(255,255,255,0.24)" />
      <circle cx="140" cy="566" r="52" fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="3 10" />
    </svg>
  );
}

const STUDENT_OPTIONS = [
  { y: 300, w: 150, picked: false },
  { y: 362, w: 124, picked: true },
  { y: 424, w: 142, picked: false },
  { y: 486, w: 112, picked: false },
];
const STUDENT_DOTS = Array.from({ length: 12 }, (_, i) => ({
  x: 150 + (i % 4) * 30,
  y: 636 + Math.floor(i / 4) * 24,
  on: i % 5 === 0,
}));

export function StudentArt({ accent }: { accent: ArtAccent }) {
  const ids = useArtIds();
  const [from, to] = accent;
  return (
    <svg
      className="login-hero-art"
      viewBox="0 0 600 700"
      role="presentation"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ArtDefs ids={ids} from={from} to={to} />

      {/* 环境光 */}
      <circle cx="300" cy="340" r="220" fill={`url(#${ids.glow})`} className="login-art-breathe" />
      <circle cx="470" cy="560" r="120" fill={`url(#${ids.glow})`} opacity="0.4" />

      {/* 后面露出的一张卷面，制造层叠深度 */}
      <g transform="rotate(7 311 384)">
        <rect
          x="146"
          y="182"
          width="330"
          height="404"
          rx="30"
          fill="rgba(255,255,255,0.03)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.1"
        />
      </g>

      {/* 主答题卡 */}
      <g transform="rotate(-6 293 398)">
        <rect
          x="128"
          y="196"
          width="330"
          height="404"
          rx="30"
          fill="rgba(255,255,255,0.10)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.3"
          filter={`url(#${ids.shadow})`}
        />
        <path d="M170 197.5 H414" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="176" cy="244" r="6" fill={`url(#${ids.accent})`} />

        {STUDENT_OPTIONS.map((option) => (
          <g key={option.y}>
            <circle
              cx="196"
              cy={option.y + 5}
              r="12"
              fill={option.picked ? `url(#${ids.accent})` : 'none'}
              stroke={option.picked ? 'none' : 'rgba(255,255,255,0.28)'}
              strokeWidth="1.8"
            />
            {option.picked ? (
              <path
                d={`M190 ${option.y + 5} l4.5 4.5 l9 -10`}
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <rect
              x="224"
              y={option.y}
              width={option.w}
              height="11"
              rx="5.5"
              fill={option.picked ? `url(#${ids.accent})` : 'rgba(255,255,255,0.18)'}
              opacity={option.picked ? 0.72 : 1}
            />
          </g>
        ))}

        <rect x="162" y="548" width="262" height="10" rx="5" fill="rgba(255,255,255,0.12)" />
        <rect x="162" y="548" width="160" height="10" rx="5" fill={`url(#${ids.accent})`} />
      </g>

      {/* 代码编辑窗：呼应代码题（无百分比、无文字） */}
      <g transform="rotate(7 470 196)" className="login-art-float">
        <rect
          x="402"
          y="142"
          width="136"
          height="104"
          rx="18"
          fill="rgba(8,16,34,0.74)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.2"
        />
        <circle cx="420" cy="160" r="3.4" fill={`url(#${ids.accent})`} />
        <circle cx="432" cy="160" r="3.4" fill="rgba(255,255,255,0.28)" />
        <circle cx="444" cy="160" r="3.4" fill="rgba(255,255,255,0.16)" />
        <line x1="402" y1="174" x2="538" y2="174" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <path
          d="M418 192 l6 5 l-6 5"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="432" y="189" width="66" height="7" rx="3.5" fill={`url(#${ids.accent})`} opacity="0.8" />
        <rect x="432" y="206" width="44" height="7" rx="3.5" fill="rgba(255,255,255,0.22)" />
        <rect x="442" y="223" width="58" height="7" rx="3.5" fill={`url(#${ids.accent})`} opacity="0.5" />
        <rect x="484" y="203" width="2.5" height="13" rx="1.2" fill="rgba(255,255,255,0.55)" />
      </g>

      {/* 作答反馈：贴在卡片左上角 */}
      <g>
        <circle cx="118" cy="212" r="35" fill={`url(#${ids.accent})`} opacity="0.16" />
        <circle
          cx="118"
          cy="212"
          r="26"
          fill={`url(#${ids.accent})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1"
        />
        <path
          d="M107 212 l6.6 6.6 l13 -14"
          fill="none"
          stroke="#fff"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* 答题卡点阵 */}
      <g>
        {STUDENT_DOTS.map((dot) => (
          <circle
            key={`${dot.x}-${dot.y}`}
            cx={dot.x}
            cy={dot.y}
            r="4.5"
            fill={dot.on ? `url(#${ids.accent})` : 'rgba(255,255,255,0.16)'}
          />
        ))}
      </g>

      <Sparkle x={486} y={470} r={9} opacity={0.4} />
      <Sparkle x={100} y={196} r={7} opacity={0.26} />
      <circle cx="546" cy="356" r="3" fill="rgba(255,255,255,0.26)" />
      <circle cx="84" cy="520" r="2.6" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

const CHOOSER_LINES = [
  { y: 322, w: 130 },
  { y: 346, w: 104 },
  { y: 370, w: 144 },
  { y: 394, w: 112 },
];
const CHOOSER_OPTIONS = [
  { y: 340, w: 118, picked: false },
  { y: 382, w: 92, picked: true },
  { y: 424, w: 110, picked: false },
];

export function ChooserArt({ accent }: { accent: ArtAccent }) {
  const ids = useArtIds();
  const [from, to] = accent;
  return (
    <svg
      className="login-hero-art"
      viewBox="0 0 600 700"
      role="presentation"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ArtDefs ids={ids} from={from} to={to} />

      <circle cx="300" cy="330" r="210" fill={`url(#${ids.glow})`} className="login-art-breathe" />

      {/* 背景弧 */}
      <g>
        <circle
          cx="300"
          cy="310"
          r="152"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.4"
          strokeDasharray="3 10"
        />
        <circle
          cx="300"
          cy="310"
          r="120"
          fill="none"
          stroke={`url(#${ids.accent})`}
          strokeWidth="2"
          opacity="0.45"
          strokeDasharray="300 460"
          strokeLinecap="round"
          transform="rotate(-120 300 310)"
        />
      </g>

      {/* 卷面卡 */}
      <g transform="rotate(-9 228 392)" filter={`url(#${ids.shadow})`}>
        <rect
          x="118"
          y="256"
          width="220"
          height="272"
          rx="24"
          fill="rgba(255,255,255,0.06)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.2"
        />
        <path d="M150 257.5 H306" stroke="rgba(255,255,255,0.26)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="146" y="290" width="76" height="9" rx="4.5" fill="rgba(255,255,255,0.45)" />
        {CHOOSER_LINES.map((line) => (
          <rect key={line.y} x="146" y={line.y} width={line.w} height="8" rx="4" fill="rgba(255,255,255,0.18)" />
        ))}
        <rect x="146" y="440" width="60" height="8" rx="4" fill="rgba(255,255,255,0.14)" />
      </g>

      {/* 答题卡 */}
      <g transform="rotate(8 404 424)">
        <rect
          x="296"
          y="300"
          width="216"
          height="268"
          rx="24"
          fill="rgba(255,255,255,0.09)"
          stroke={`url(#${ids.edge})`}
          strokeWidth="1.3"
          filter={`url(#${ids.shadow})`}
        />
        <path d="M328 301.5 H482" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" />
        {CHOOSER_OPTIONS.map((option) => (
          <g key={option.y}>
            <circle
              cx="336"
              cy={option.y + 5}
              r="10"
              fill={option.picked ? `url(#${ids.accent})` : 'none'}
              stroke={option.picked ? 'none' : 'rgba(255,255,255,0.26)'}
              strokeWidth="1.7"
            />
            {option.picked ? (
              <path
                d={`M331 ${option.y + 5} l4 4 l8 -9`}
                fill="none"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <rect
              x="358"
              y={option.y}
              width={option.w}
              height="10"
              rx="5"
              fill={option.picked ? `url(#${ids.accent})` : 'rgba(255,255,255,0.16)'}
              opacity={option.picked ? 0.72 : 1}
            />
          </g>
        ))}
        <rect x="326" y="482" width="156" height="9" rx="4.5" fill="rgba(255,255,255,0.12)" />
        <rect x="326" y="482" width="96" height="9" rx="4.5" fill={`url(#${ids.accent})`} />
      </g>

      {/* 判分徽标（两卡交汇处） */}
      <g className="login-art-float">
        <circle cx="300" cy="214" r="40" fill={`url(#${ids.accent})`} opacity="0.16" />
        <circle
          cx="300"
          cy="214"
          r="30"
          fill={`url(#${ids.accent})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1"
        />
        <path
          d="M286 214 l8 8 l16 -17"
          fill="none"
          stroke="#fff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <Sparkle x={470} y={190} r={10} opacity={0.4} />
      <Sparkle x={128} y={190} r={7} opacity={0.26} />
      <circle cx="92" cy="470" r="3" fill="rgba(255,255,255,0.26)" />
      <circle cx="536" cy="486" r="2.6" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}
