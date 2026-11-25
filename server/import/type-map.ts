// 题型 / 语言 / 缺省分值映射：模板格式与真实试卷格式共用一份，避免两套规则漂移。
import type { QuestionType } from '../../shared/types.ts';

export const DEFAULT_SCORE: Record<QuestionType, number> = {
  single: 5,
  multiple: 5,
  truefalse: 3,
  fill: 5,
  short: 10,
  code: 20,
};

/**
 * 题型别名。真实卷会出现「选填题」「匹配题」这类本地叫法：
 * 选填题本质是带选项提示的填空，匹配题按「每框一个空」的填空落库，
 * 这样不需要新增题型就能复用逐空判分。
 */
export const TYPE_ALIASES: Record<string, QuestionType> = {
  单选: 'single',
  单选题: 'single',
  单项选择: 'single',
  单项选择题: 'single',
  单项选择題: 'single',
  多选: 'multiple',
  多选题: 'multiple',
  多项选择: 'multiple',
  多项选择题: 'multiple',
  判断: 'truefalse',
  判断题: 'truefalse',
  填空: 'fill',
  填空题: 'fill',
  选填: 'fill',
  选填题: 'fill',
  匹配: 'fill',
  匹配题: 'fill',
  连线题: 'fill',
  简答: 'short',
  简答题: 'short',
  问答: 'short',
  问答题: 'short',
  主观题: 'short',
  名词解释: 'short',
  代码: 'code',
  代码题: 'code',
  编程: 'code',
  编程题: 'code',
};

export const LANG_ALIASES: Record<string, string> = {
  python: 'python',
  py: 'python',
  python3: 'python',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
};

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19,
  二十: 20,
};

/** '一' → 1，'十二' → 12，'3' → 3；无法识别时返回 NaN。 */
export function cnToNumber(raw: string): number {
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text);
  return CN_DIGITS[text] ?? NaN;
}

/** 把 1..20 的序号转成中文数字，用于生成「综合题一」这类标题。 */
export function numberToCn(n: number): string {
  const table = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n <= 10) return table[n] ?? String(n);
  if (n < 20) return `十${table[n - 10]}`;
  return String(n);
}
