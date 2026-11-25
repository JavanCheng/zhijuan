import type { AnswerSpec, Option, QuestionType, StudentAnswer } from '../shared/types';

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  truefalse: '判断题',
  fill: '填空题',
  short: '简答题',
  code: '代码题',
};

export function typeLabel(type: QuestionType): string {
  return TYPE_LABEL[type];
}

export function optionText(options: Option[], key: string): string {
  return options.find((o) => o.key === key)?.text ?? '';
}

export function formatStudentAnswer(
  type: QuestionType,
  raw: StudentAnswer | null | undefined,
  options: Option[] = [],
): string {
  if (!raw) return '（未作答）';
  switch (type) {
    case 'single':
      return raw.key ? `${raw.key}. ${optionText(options, raw.key)}` : '（未作答）';
    case 'multiple':
      return raw.keys?.length ? raw.keys.map((k) => `${k}. ${optionText(options, k)}`).join('\n') : '（未作答）';
    case 'truefalse':
      return raw.value === undefined ? '（未作答）' : raw.value ? '正确' : '错误';
    case 'fill':
      return raw.blanks?.map((b, i) => `第 ${i + 1} 空：${b || '（空）'}`).join('\n') ?? '（未作答）';
    case 'short':
      return raw.text?.trim() || '（未作答）';
    case 'code':
      return raw.code?.trim() || '（未作答）';
    default:
      return '（未作答）';
  }
}

export function formatAnswerSpec(
  type: QuestionType,
  spec: AnswerSpec | null | undefined,
  options: Option[] = [],
): string {
  if (!spec) return '—';
  switch (spec.kind) {
    case 'choice': {
      const missed = spec.missedDeduct != null ? `（漏选每个扣 ${spec.missedDeduct} 分）` : '';
      return spec.keys.map((k) => `${k}. ${optionText(options, k)}`).join('\n') + missed;
    }
    case 'bool':
      return spec.value ? '正确' : '错误';
    case 'fill':
      return spec.blanks
        .map((accepted, i) => {
          const score = spec.blankScores?.[i];
          const notes = [score != null ? `${score} 分` : '', spec.manualBlanks?.[i] ? '需人工评分' : ''].filter(Boolean);
          return `第 ${i + 1} 空：${accepted.join(' / ')}${notes.length ? `（${notes.join('，')}）` : ''}`;
        })
        .join('\n');
    case 'reference':
      return spec.text || '（无参考答案）';
    default:
      return '由测试点判定';
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function scoreText(value: number | null | undefined, digits = 1): string {
  if (value == null) return '—';
  const fixed = Number(value).toFixed(digits);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
