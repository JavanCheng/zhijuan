// 纯函数判分引擎：不依赖数据库与网络，服务端与任何前端预览都可以复用。
import type { AnswerSpec, GradeDetail, GradeItem, StudentAnswer, QuestionType } from './types.ts';

/** 填空/简答归一化：全角转半角、空白折叠、大小写不敏感 */
export function normalizeText(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 更宽松的归一化：再去掉所有空白，容忍 `event = "x"` 与 `event="x"` 这类写法差异 */
export function normalizeLoose(input: string): string {
  return normalizeText(input).replace(/\s+/g, '');
}

/** 填空比对：先严格比，再忽略空白比一次 */
function fillMatches(accepted: string[], got: string): boolean {
  if (!got) return false;
  const strict = normalizeText(got);
  const loose = normalizeLoose(got);
  return accepted.some((a) => normalizeText(a) === strict || normalizeLoose(a) === loose);
}

/** 代码输出比对：行尾空白忽略、末尾空行忽略、换行统一 */
export function normalizeOutput(input: string): string {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export interface GradeResult {
  score: number;
  detail: GradeDetail;
}

export interface GradableQuestion {
  id: number;
  seq: number;
  type: QuestionType;
  score: number;
  answer: AnswerSpec | null;
}

function item(label: string, ok: boolean, score: number, maxScore: number, extra: Partial<GradeItem> = {}): GradeItem {
  return { label, ok, score, maxScore, ...extra };
}

export function gradeObjective(q: GradableQuestion, raw: StudentAnswer | null): GradeResult {
  const max = q.score;

  if (!raw || isEmptyAnswer(raw)) {
    return {
      score: 0,
      detail: { items: [item('未作答', false, 0, max)], note: '未作答' },
    };
  }

  switch (q.type) {
    case 'single':
    case 'multiple': {
      const spec = q.answer as Extract<AnswerSpec, { kind: 'choice' }> | null;
      const expected = spec?.keys ?? [];
      const got = (q.type === 'single' ? [raw.key] : raw.keys ?? []).filter(Boolean).map((k) => String(k).toUpperCase());
      const expectedSet = new Set(expected.map((k) => k.toUpperCase()));
      const gotSet = new Set(got);
      const exact = expectedSet.size === gotSet.size && [...expectedSet].every((k) => gotSet.has(k));
      if (exact) {
        return {
          score: max,
          detail: {
            items: [item('答案比对', true, max, max, { expected: expected.join(''), got: got.join('') })],
            note: '答案正确',
          },
        };
      }

      // 多选漏选扣分：只选对了一部分（没有选错）时，按漏选个数扣分
      const deduct = spec?.missedDeduct;
      const allPicked = [...gotSet].every((k) => expectedSet.has(k));
      if (q.type === 'multiple' && deduct != null && deduct >= 0 && gotSet.size > 0 && allPicked && gotSet.size < expectedSet.size) {
        const missed = expectedSet.size - gotSet.size;
        const score = Math.max(0, round2(max - missed * deduct));
        const note = `漏选 ${missed} 个，每个扣 ${deduct} 分`;
        return {
          score,
          detail: {
            items: [
              item('答案比对', score >= max, score, max, {
                expected: expected.join(''),
                got: got.join(''),
                note,
              }),
            ],
            note,
          },
        };
      }

      return {
        score: 0,
        detail: {
          items: [
            item('答案比对', false, 0, max, {
              expected: expected.join(''),
              got: got.join('') || '（空）',
            }),
          ],
          note: '答案错误',
        },
      };
    }

    case 'truefalse': {
      const spec = q.answer as Extract<AnswerSpec, { kind: 'bool' }> | null;
      const expected = !!spec?.value;
      const ok = raw.value === expected;
      return {
        score: ok ? max : 0,
        detail: {
          items: [item('判断', ok, ok ? max : 0, max, { expected: expected ? '正确' : '错误', got: raw.value ? '正确' : '错误' })],
          note: ok ? '判断正确' : '判断错误',
        },
      };
    }

    case 'fill': {
      const spec = q.answer as Extract<AnswerSpec, { kind: 'fill' }> | null;
      const blanks = spec?.blanks ?? [];
      const got = raw.blanks ?? [];
      const n = Math.max(blanks.length, 1);
      const explicit = spec?.blankScores;
      const manual = spec?.manualBlanks;
      const items: GradeItem[] = blanks.map((accepted, i) => {
        const per = explicit?.[i] ?? max / n;
        if (manual?.[i]) {
          return item(`第 ${i + 1} 空`, false, 0, per, {
            expected: accepted.join(' / '),
            got: got[i] ?? '（空）',
            note: '言之有理即给分，需教师评分',
          });
        }
        const ok = fillMatches(accepted, got[i] ?? '');
        return item(`第 ${i + 1} 空`, ok, ok ? per : 0, per, {
          expected: accepted.join(' / '),
          got: got[i] ?? '（空）',
        });
      });
      const score = items.reduce((s, it) => s + it.score, 0);
      const needsManual = Boolean(manual?.some(Boolean));
      return {
        score: round2(score),
        detail: {
          items,
          note: needsManual
            ? `自动判分 ${round2(score)} 分，另有空需教师评分`
            : `答对 ${items.filter((i) => i.ok).length}/${items.length} 空`,
          needsManual,
        },
      };
    }

    case 'short':
      return {
        score: 0,
        detail: { items: [], note: '主观题，需教师评分', needsManual: true },
      };

    case 'code':
      return {
        score: 0,
        detail: { items: [], note: '代码题由运行时评测生成结果' },
      };

    default:
      return { score: 0, detail: { items: [], note: '未知题型' } };
  }
}

export function isEmptyAnswer(raw: StudentAnswer | null): boolean {
  if (!raw) return true;
  if (raw.key !== undefined) return !String(raw.key).trim();
  if (raw.keys !== undefined) return !raw.keys.length;
  if (raw.value !== undefined) return false;
  if (raw.blanks !== undefined) return raw.blanks.every((b) => !String(b ?? '').trim());
  if (raw.text !== undefined) return !String(raw.text).trim();
  if (raw.code !== undefined) return !String(raw.code).trim();
  return true;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isAnswered(raw: StudentAnswer | null): boolean {
  return !isEmptyAnswer(raw);
}
