// 真实试卷格式解析：综合题（材料大题）+ 题干末尾内联题型 + 独立的参考答案文档。
//
// 与 templates/题目模板.docx 的「【题型】」格式并存：本文件只负责真实卷，
// 模板格式仍走 docx.ts 的旧状态机（两套规则互不影响）。
//
// 真实卷特征（以川沙中学信息技术综合练习卷为例）：
//   综合题一：<材料…>（23分）      ← 大题，材料由全组小题共用
//   1.<题干>…（单选题，2分）        ← 题号 1..8 每题重新开始
//   A.数据\t\tB.信息\t\tC.知识      ← 选项卡一行，制表符分隔
//   …（填空题，6分，每空2分）        ← 逐空分值
//   参考答案（单独 docx）：
//   综合题一（23分）
//   1.（2分）C
//   5.（3分）BCD（漏选1个扣1分）
//   4.（6分，每空2分）
//   第一空：有损压缩
//   第二空：压缩率高/大幅节省存储空间（言之有理即给分）
import type {
  AnswerSpec,
  ImportIssue,
  ImportResult,
  Option,
  ParsedQuestion,
  QuestionSection,
  QuestionType,
} from '../../shared/types.ts';
import { docxToBlocks, escapeHtml, sanitize, stripTags, type Block } from './html.ts';
import { DEFAULT_SCORE, TYPE_ALIASES, cnToNumber } from './type-map.ts';

/* ───────────────────────── 参考答案模型 ───────────────────────── */

interface AnswerEntry {
  /** 所属大题序号（1 起），null 表示全文没有大题 */
  section: number | null;
  /** 印刷题号 1..N */
  number: number;
  score: number | null;
  /** 「每空 2 分 / 每框 2 分」 */
  blankUnit: number | null;
  /** 「第一空 2 分，第二空 3 分」 */
  blankScores: number[] | null;
  /** 单行答案值 */
  value: string;
  /** 「第一空：…」逐空答案 */
  blanks: string[];
  /** 参考代码（编程题） */
  code: string | null;
  order: number;
}

/* ───────────────────────── 小题草稿 ───────────────────────── */

interface Draft {
  number: number | null;
  /** 推断序号（题号缺失时用于对齐参考答案） */
  ordinal: number;
  type: QuestionType | null;
  sectionIndex: number | null;
  stemParts: string[];
  score: number | null;
  blankUnit: number | null;
  blankScores: number[] | null;
  options: Option[];
  issues: ImportIssue[];
  answer: AnswerEntry | null;
}

const SCORE_TAIL_RE = /[（(]\s*(\d+(?:\.\d+)?)\s*分\s*[）)]\s*$/;
const SECTION_RE = /^(综合题|综合大题)\s*([一二三四五六七八九十百零〇]+|\d+)\s*[：:、.．]?\s*([\s\S]*)$/;
const SECTION_ALT_RE = /^第\s*([一二三四五六七八九十百零〇]+|\d+)\s*(?:大题|部分|题组)\s*[：:、.．]?\s*([\s\S]*)$/;
const MARKER_TAIL_RE = /[（(]\s*([^（）()]{2,60}?)\s*[）)]\s*$/;
const ANSWER_NUMBER_RE = /^(\d{1,2})\s*[.、．)）]\s*(?:[（(]([^）)]*)[）)])?\s*([\s\S]*)$/;
const BLANK_LABEL_RE = /^第\s*([一二三四五六七八九十\d]+)\s*(?:空|框|处|小题)\s*[:：]\s*([\s\S]*)$/;
const BLANK_RUN_RE = /[ \u3000]{6,}/g;

/* ───────────────────────── 题型标记 ───────────────────────── */

interface Marker {
  type: QuestionType;
  score: number | null;
  blankUnit: number | null;
  blankScores: number[] | null;
  index: number;
}

/** 解析题干末尾的「（题型，N分，每空M分）」；不是题型标记时返回 null。 */
function parseInlineMarker(text: string): Marker | null {
  const tail = MARKER_TAIL_RE.exec(text);
  if (!tail) return null;
  const parts = tail[1]
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const type = TYPE_ALIASES[parts[0].replace(/\s+/g, '')];
  if (!type) return null;

  let score: number | null = null;
  let blankUnit: number | null = null;
  let blankScores: number[] | null = null;
  for (const part of parts.slice(1)) {
    const bare = /^(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (bare) {
      score = Number(bare[1]);
      continue;
    }
    const unit = /^每\s*(?:空|框|处|小题|小问)\s*(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (unit) {
      blankUnit = Number(unit[1]);
      continue;
    }
    const per = /^第\s*([一二三四五六七八九十\d]+)\s*(?:空|框|处|小题|小问)\s*(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (per) {
      (blankScores ??= []).push(Number(per[2]));
      continue;
    }
  }
  return { type, score, blankUnit, blankScores, index: tail.index ?? text.length };
}

/** 参考答案里的「（6分，每空2分）」这类分值说明。 */
function parseScoreInfo(inner: string): {
  score: number | null;
  blankUnit: number | null;
  blankScores: number[] | null;
} {
  const parts = inner
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let score: number | null = null;
  let blankUnit: number | null = null;
  let blankScores: number[] | null = null;
  for (const part of parts) {
    const bare = /^(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (bare) {
      score = Number(bare[1]);
      continue;
    }
    const unit = /^每\s*(?:空|框|处|小题|小问)\s*(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (unit) {
      blankUnit = Number(unit[1]);
      continue;
    }
    const per = /^第\s*([一二三四五六七八九十\d]+)\s*(?:空|框|处|小题|小问)\s*(\d+(?:\.\d+)?)\s*分$/.exec(part);
    if (per) {
      (blankScores ??= []).push(Number(per[2]));
    }
  }
  return { score, blankUnit, blankScores };
}

/* ───────────────────────── 选项 ───────────────────────── */

const OPTION_RE = /([A-H])\s*[.、．)）]\s*/g;

function parseOptionLine(line: string): Option[] {
  const text = line.trim();
  const matches = [...text.matchAll(OPTION_RE)];
  if (!matches.length) return [];
  if ((matches[0].index ?? 0) > 1) return [];
  const options: Option[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).replace(/[；;]\s*$/, '').trim();
    if (body) options.push({ key: matches[i][1], text: body });
  }
  return options.length >= 2 ? options : [];
}

function parseSingleOption(line: string): Option | null {
  const m = /^\s*([A-H])\s*[.、．)）]\s*(\S[\s\S]*)$/.exec(line);
  if (!m) return null;
  const body = m[2].replace(/[；;]\s*$/, '').trim();
  return body ? { key: m[1], text: body } : null;
}

function optionsOf(line: string): Option[] {
  const multi = parseOptionLine(line);
  if (multi.length) return multi;
  const single = parseSingleOption(line);
  return single ? [single] : [];
}

/* ───────────────────────── 参考答案解析 ───────────────────────── */

function parseAnswerKey(blocks: Block[]): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  let section: number | null = null;
  let current: AnswerEntry | null = null;
  let codeMode = false;

  // 通过函数读取，避免 TS 把闭包里赋值的 current 收窄成 null
  const getCurrent = (): AnswerEntry | null => current;

  const start = (number: number, info: string | undefined, value: string): void => {
    const parsed = info ? parseScoreInfo(info) : { score: null, blankUnit: null, blankScores: null };
    const entry: AnswerEntry = {
      section,
      number,
      score: parsed.score,
      blankUnit: parsed.blankUnit,
      blankScores: parsed.blankScores,
      value: value.trim(),
      blanks: [],
      code: null,
      order: entries.length,
    };
    current = entry;
    entries.push(entry);
    codeMode = false;
    if (/参考代码|参考程序|代码如下|参考答案如下/.test(entry.value)) {
      codeMode = true;
      entry.code = '';
    }
  };

  for (const block of blocks) {
    for (const raw of block.lines) {
      const line = raw.trim();
      if (!line) continue;

      const sectionMatch = SECTION_RE.exec(line);
      if (sectionMatch) {
        const idx = cnToNumber(sectionMatch[2]);
        if (Number.isFinite(idx)) {
          section = idx;
          current = null;
          codeMode = false;
          continue;
        }
      }

      const codeTarget = getCurrent();
      if (codeMode && codeTarget) {
        codeTarget.code = codeTarget.code ? `${codeTarget.code}\n${raw}` : raw;
        continue;
      }

      const answerMatch = ANSWER_NUMBER_RE.exec(line);
      if (answerMatch) {
        start(Number(answerMatch[1]), answerMatch[2], answerMatch[3] ?? '');
        continue;
      }

      const entry = getCurrent();
      const blankMatch = BLANK_LABEL_RE.exec(line);
      if (blankMatch && entry) {
        const idx = cnToNumber(blankMatch[1]);
        if (Number.isFinite(idx) && idx >= 1) {
          entry.blanks[idx - 1] = blankMatch[2].trim();
          continue;
        }
      }

      if (entry) {
        // 「第一种」「输出结果：…」等续行归到上一题的答案里
        entry.value = entry.value ? `${entry.value}\n${raw}` : raw;
      }
    }
  }
  return entries;
}

/* ───────────────────────── 答案归一化 ───────────────────────── */

/**
 * 填空答案的可接受写法：
 * - `a/b` 为两种写法（`B/S架构` 这种词内斜杠不拆，要求两侧都 ≥2 字）
 * - 「（言之有理即给分）」这类括号说明会被去掉，并把该空标记为人工评分
 */
function splitAlternatives(raw: string): { accepted: string[]; manual: boolean } {
  let text = String(raw ?? '').trim();
  const manual = /言之有理|酌情|意思对即可|其他合理|合理即可/.test(text);
  text = text
    .replace(/[（(][^（）()]*?(?:言之有理|酌情|意思对|其他合理|合理即可)[^（）()]*?[）)]/g, '')
    .replace(/[（(]\s*[）)]/g, '')
    .trim();

  let accepted: string[] = text ? [text] : [];
  if (/[/｜]/.test(text)) {
    const parts = text
      .split(/\s*[/｜]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length >= 2)) accepted = parts;
  }
  return { accepted: [...new Set(accepted.filter(Boolean))], manual };
}

function parseChoiceKeys(raw: string): string[] {
  const text = raw.replace(/[（(][\s\S]*$/, '').trim();
  const letters = text.match(/[A-Ha-h]/g) ?? [];
  return [...new Set(letters.map((k) => k.toUpperCase()))];
}

function parseMissedDeduct(raw: string): number | undefined {
  const m = /漏选\s*(?:\d+\s*)?个?\s*扣\s*(\d+(?:\.\d+)?)\s*分/.exec(raw);
  return m ? Number(m[1]) : undefined;
}

function parseBool(raw: string): boolean | null {
  const t = raw.replace(/\s/g, '');
  if (/^(对|正确|√|✓|是|真|T|TRUE|Y|YES|1)$/i.test(t)) return true;
  if (/^(错|错误|×|✗|否|假|F|FALSE|N|NO|0)$/i.test(t)) return false;
  return null;
}

/** 匹配题答案「A→②  B→①  C→③」按字母顺序拆成逐空答案。 */
function matchPairs(raw: string): Array<{ key: string; target: string }> | null {
  const pairs = [...raw.matchAll(/([A-H])\s*(?:→|->|—>|⇒|＝|=)\s*([^\s,，;；、|]+)/g)].map((m) => ({
    key: m[1].toUpperCase(),
    target: m[2].trim(),
  }));
  if (pairs.length < 2) return null;
  return pairs.sort((a, b) => a.key.localeCompare(b.key));
}

/* ───────────────────────── 试卷解析 ───────────────────────── */

function blankify(html: string): string {
  // Word 里的填空位是一长串空格，HTML 会把连续空格折叠掉，这里换成可见的下划线空位
  return html.replace(BLANK_RUN_RE, '<u>\u3000\u3000\u3000\u3000</u>');
}

function countBlankRuns(html: string): number {
  return [...html.matchAll(/<u>\u3000{4}<\/u>/g)].length;
}

export interface PaperParseResult {  title: string | null;
  drafts: Draft[];
  sections: QuestionSection[];
  notes: string[];
  warnings: number;
}

/** 解析真实试卷正文（不含参考答案）。 */
export function parsePaperBlocks(blocks: Block[], docWarnings = 0): PaperParseResult {
  const notes: string[] = [];
  if (docWarnings) notes.push(`Word 转换提示 ${docWarnings} 条（不影响解析）`);

  const drafts: Draft[] = [];
  const sections: QuestionSection[] = [];
  const sectionBlocks = new Map<number, string[]>();

  let title: string | null = null;
  let current: Draft | null = null;
  let section: QuestionSection | null = null;
  let ignore = false;
  let ordinalInSection = 0;

  const flush = (): void => {
    if (!current) return;
    drafts.push(current);
    current = null;
  };

  const sectionHtml = (index: number): string => (sectionBlocks.get(index) ?? []).join('\n');

  for (const block of blocks) {
    if (ignore) continue;
    const images = block.html.match(/<img\b[^>]*>/gi) ?? [];
    if (!block.lines.length) {
      if (images.length && current) current.stemParts.push(block.html);
      else if (images.length && section) sectionBlocks.set(section.index, [...(sectionBlocks.get(section.index) ?? []), block.html]);
      continue;
    }
    const first = block.lines[0].trim();
    if (!first) continue;

    // 附录（数字化资源 / 帮助贴士）之后全部忽略，避免被并进最后一题题干
    if (/^[【\[]/.test(first) && !parseInlineMarker(first)) {
      flush();
      ignore = true;
      continue;
    }

    const sectionMatch = SECTION_RE.exec(first) ?? null;
    const altMatch = sectionMatch ? null : SECTION_ALT_RE.exec(first);
    if (sectionMatch || altMatch) {
      flush();
      // SECTION_RE: [1]=前缀 [2]=序号 [3]=材料；SECTION_ALT_RE: [1]=序号 [2]=材料
      const key = sectionMatch ? sectionMatch[2] : altMatch![1];
      const wrapped = /^[一二三四五六七八九十百零〇]+$/.test(key);
      const index = cnToNumber(key);
      const tailText = (sectionMatch ? sectionMatch[3] : altMatch![2]) ?? '';

      let material = tailText.trim();
      let declared: number | null = null;
      const scored = SCORE_TAIL_RE.exec(material);
      if (scored) {
        declared = Number(scored[1]);
        material = material.slice(0, scored.index).trim();
      }
      const label = wrapped ? key : String(Number.isFinite(index) ? index : key);
      section = {
        index: sections.length,
        key: String(key),
        title: sectionMatch ? `综合题${label}` : `第${label}大题`,
        score: declared,
        html: '',
      };
      sections.push(section);
      ordinalInSection = 0;
      if (material || images.length) sectionBlocks.set(section.index, [...(material ? [`<p>${escapeHtml(material)}</p>`] : []), ...images]);
      continue;
    }

    // 题目起始
    const question = matchQuestionStart(first, section !== null);
    if (question) {
      flush();
      ordinalInSection += 1;
      const draft: Draft = {
        number: question.number,
        ordinal: ordinalInSection,
        type: question.type,
        sectionIndex: section ? section.index : null,
        stemParts: [],
        score: question.score,
        blankUnit: question.blankUnit,
        blankScores: question.blankScores,
        options: [],
        issues: [],
        answer: null,
      };
      current = draft;
      const rest = question.rest;
      const extra = block.lines.slice(1);
      if (rest) draft.stemParts.push(`<p>${escapeHtml(rest)}</p>`);
      for (const line of extra) draft.stemParts.push(`<p>${escapeHtml(line)}</p>`);
      draft.stemParts.push(...images);
      continue;
    }

    if (!current) {
      // 卷首：标题 / 时间说明 / 大题材料
      if (!title) {
        const candidate = first.replace(/^[【\[]|[】\]]$/g, '').trim();
        if (
          candidate.length > 0 &&
          candidate.length <= 60 &&
          !/^[（(]/.test(candidate) &&
          !/分钟|满分|考试时间/.test(candidate)
        ) {
          title = candidate;
          continue;
        }
      }
      if (section) {
        const list = sectionBlocks.get(section.index) ?? [];
        list.push(block.html);
        sectionBlocks.set(section.index, list);
      }
      continue;
    }

    // 题内：选项 or 题干（同一个块里用 <br> 分行的选项也认）
    if (current.type === 'single' || current.type === 'multiple') {
      const everyLineIsOptions = block.lines.every((line) => optionsOf(line).length > 0);
      if (everyLineIsOptions) {
        for (const line of block.lines) current.options.push(...optionsOf(line));
        current.stemParts.push(...images);
        continue;
      }
    }
    current.stemParts.push(block.html);
  }
  flush();

  if (section !== null) {
    for (const item of sections) item.html = sectionHtml(item.index);
  }
  return { title, drafts, sections, notes, warnings: docWarnings };
}

function matchQuestionStart(
  line: string,
  inSection: boolean,
): {
  number: number | null;
  rest: string;
  type: QuestionType | null;
  score: number | null;
  blankUnit: number | null;
  blankScores: number[] | null;
} | null {
  if (optionsOf(line).length) return null;

  const numbered = /^(\d{1,2})\s*[.、．)）]\s*([\s\S]*)$/.exec(line);
  let number: number | null = null;
  let body = line.trim();
  if (numbered) {
    number = Number(numbered[1]);
    body = numbered[2].trim();
    if (!body) return null;
  }

  const marker = parseInlineMarker(body);
  if (!marker) {
    // 无题型标记：只有已在大题内、且像题干的行才当新题（真实卷几乎都带标记）
    if (number == null || !inSection) return null;
    if (body.length < 6) return null;
    return { number, rest: body, type: null, score: null, blankUnit: null, blankScores: null };
  }
  if (number == null && !inSection) {
    // 卷首说明里偶尔出现「（…分）」，没有大题也没有题号时不当题目
    return null;
  }
  const rest = body.slice(0, marker.index).trim();
  return {
    number,
    rest,
    type: marker.type,
    score: marker.score,
    blankUnit: marker.blankUnit,
    blankScores: marker.blankScores,
  };
}

/* ───────────────────────── 合并与定稿 ───────────────────────── */

function entryKey(section: number | null, number: number): string {
  return `${section ?? 'x'}#${number}`;
}

function indexAnswers(entries: AnswerEntry[]): Map<string, AnswerEntry> {
  const map = new Map<string, AnswerEntry>();
  for (const entry of entries) map.set(entryKey(entry.section, entry.number), entry);
  return map;
}

function sectionOrdinal(draft: Draft, sections: QuestionSection[]): number | null {
  if (draft.sectionIndex == null) return null;
  const section = sections[draft.sectionIndex];
  if (!section) return null;
  const n = cnToNumber(section.key);
  return Number.isFinite(n) ? n : null;
}

interface BuiltAnswer {
  answer: AnswerSpec;
  issues: ImportIssue[];
  needsManual: boolean;
  blankCount: number;
}

function buildAnswer(
  type: QuestionType,
  draft: Draft,
  entry: AnswerEntry | null,
  optionsCount: number,
): BuiltAnswer {
  const issues: ImportIssue[] = [];
  const raw = (entry?.value ?? '').trim();

  if (type === 'single' || type === 'multiple') {
    const keys = parseChoiceKeys(raw);
    if (!keys.length) {
      issues.push({ level: 'error', message: '缺少答案（参考答案中该题没有选项字母）' });
    } else if (optionsCount > 0) {
      const missing = keys.filter((k) => !draft.options.find((o) => o.key === k));
      if (missing.length) issues.push({ level: 'error', message: `答案 ${keys.join('')} 不在选项范围内` });
    }
    if (type === 'single' && keys.length > 1) {
      issues.push({ level: 'error', message: `单选题答案只能有一个，参考答案写的是 ${keys.join('')}` });
    }
    const missedDeduct = type === 'multiple' ? parseMissedDeduct(raw) : undefined;
    const spec: AnswerSpec = missedDeduct ? { kind: 'choice', keys, missedDeduct } : { kind: 'choice', keys };
    return { answer: spec, issues, needsManual: false, blankCount: 0 };
  }

  if (type === 'truefalse') {
    const value = parseBool(raw);
    if (value == null) issues.push({ level: 'error', message: `判断题答案应为 对/错，参考答案写的是「${raw.slice(0, 16)}」` });
    return { answer: { kind: 'bool', value: value ?? false }, issues, needsManual: false, blankCount: 0 };
  }

  if (type === 'fill') {
    const blanks: Array<{ accepted: string[]; manual: boolean }> = [];
    const fromLabels = (entry?.blanks ?? []).filter((b) => b !== undefined && b !== null);

    const pairs = fromLabels.length ? null : matchPairs(raw);
    if (pairs) {
      for (const pair of pairs) {
        const { accepted, manual } = splitAlternatives(pair.target);
        blanks.push({ accepted, manual });
      }
    } else if (fromLabels.length) {
      for (const label of fromLabels) blanks.push(splitAlternatives(label));
    } else if (raw) {
      blanks.push(splitAlternatives(raw));
    }

    if (!blanks.length) {
      issues.push({ level: 'error', message: '缺少答案（参考答案中该题没有内容）' });
      return { answer: { kind: 'fill', blanks: [] }, issues, needsManual: false, blankCount: 0 };
    }

    const count = blanks.length;
    let blankScores: number[] | undefined;
    const declared = entry?.blankScores ?? draft.blankScores;
    const unit = entry?.blankUnit ?? draft.blankUnit;
    if (declared && declared.length === count) blankScores = declared;
    else if (unit != null) blankScores = Array.from({ length: count }, () => unit);
    else if (declared) {
      issues.push({
        level: 'warn',
        message: `逐空分值有 ${declared.length} 个，但答案有 ${count} 个空，已按平均分处理`,
      });
    }

    const manualBlanks = blanks.map((b) => b.manual);
    const needsManual = manualBlanks.some(Boolean);
    const spec: AnswerSpec = { kind: 'fill', blanks: blanks.map((b) => b.accepted) };
    if (blankScores) spec.blankScores = blankScores;
    if (needsManual) spec.manualBlanks = manualBlanks;
    return { answer: spec, issues, needsManual, blankCount: count };
  }

  if (type === 'code') {
    const text = (entry?.code ?? '').trim() || raw;
    const needsManual = true;
    return {
      answer: text ? { kind: 'reference', text } : { kind: 'none' },
      issues: text ? [] : [{ level: 'warn', message: '没有参考答案代码，教师需完全手工评分' }],
      needsManual,
      blankCount: 0,
    };
  }

  const text = (entry?.code ?? '').trim() || raw;
  return {
    answer: text ? { kind: 'reference', text } : { kind: 'none' },
    issues: text ? [] : [{ level: 'warn', message: '没有参考答案，教师需完全手工评分' }],
    needsManual: true,
    blankCount: 0,
  };
}

function finalizeDraft(draft: Draft, sections: QuestionSection[], answers: Map<string, AnswerEntry>): ParsedQuestion & { blankCount: number } {
  const issues = [...draft.issues];
  let type = draft.type;
  const ordinal = sectionOrdinal(draft, sections);
  const printed = draft.number ?? draft.ordinal;
  const entry = answers.get(entryKey(ordinal, printed)) ?? null;

  if (!type) {
    if (entry) {
      type = inferType(entry);
      issues.push({ level: 'warn', message: '题干缺少题型标记，已按参考答案推断题型' });
    } else {
      type = 'fill';
      issues.push({ level: 'warn', message: '题干缺少题型标记，默认按填空题处理' });
    }
  }

  let score = draft.score ?? entry?.score ?? null;
  if (score == null || Number.isNaN(score) || score <= 0) {
    score = DEFAULT_SCORE[type];
    issues.push({ level: 'warn', message: `未识别到分值，按 ${score} 分处理` });
  } else if (draft.score != null && entry?.score != null && Math.abs(draft.score - entry.score) > 0.001) {
    issues.push({
      level: 'warn',
      message: `试卷标注 ${draft.score} 分，参考答案标注 ${entry.score} 分，以试卷为准`,
    });
  }

  let stemHtml = sanitize(draft.stemParts.join('\n'));
  if (type === 'fill') stemHtml = blankify(stemHtml);
  if (!stripTags(stemHtml).trim() && !/<img\b/i.test(stemHtml) && type !== 'code') {
    issues.push({ level: 'error', message: '题干为空' });
  }

  if (!entry) {
    issues.push({
      level: type === 'code' || type === 'short' ? 'warn' : 'error',
      message: '参考答案里没有找到对应题号',
    });
  }

  const built = buildAnswer(type, draft, entry, draft.options.length);
  issues.push(...built.issues);

  if (type === 'single' || type === 'multiple') {
    if (draft.options.length < 2) issues.push({ level: 'error', message: '选项少于 2 个' });
    const usedKeys = new Set(draft.options.map((o) => o.key));
    if (draft.options.length && usedKeys.size !== draft.options.length) {
      issues.push({ level: 'warn', message: '选项字母有重复' });
    }
  }

  if (type === 'fill' && built.blankCount > 0) {
    const runs = countBlankRuns(stemHtml);
    if (runs > 0 && runs !== built.blankCount) {
      issues.push({
        level: 'warn',
        message: `题干里有 ${runs} 处空位，参考答案给了 ${built.blankCount} 个空，请核对`,
      });
    }
    const sum = (built.answer as Extract<AnswerSpec, { kind: 'fill' }>).blankScores?.reduce((s, n) => s + n, 0);
    if (sum != null && Math.abs(sum - score) > 0.001) {
      issues.push({ level: 'warn', message: `逐空分值合计 ${sum} 分，与题目分值 ${score} 分不一致` });
    }
  }

  let codeSpec: ParsedQuestion['codeSpec'] = null;
  if (type === 'code') {
    codeSpec = { languages: ['python'], starterCode: '', timeLimitMs: 2000, memoryLimitMb: 256 };
  }

  const needsManual =
    type === 'short' ||
    type === 'code' ||
    (built.answer.kind === 'fill' && Boolean(built.answer.manualBlanks?.some(Boolean)));

  return {
    seq: 0,
    type,
    stemHtml,
    score,
    options: draft.options,
    answer: built.answer,
    explanationHtml: null,
    codeSpec,
    testCases: [],
    issues,
    sectionIndex: draft.sectionIndex,
    needsManual,
    blankCount: built.blankCount,
  };
}

function inferType(entry: AnswerEntry): QuestionType {
  if (entry.code) return 'code';
  const raw = entry.value.replace(/[（(][\s\S]*$/, '').trim();
  if (/^[A-Ha-h]{1,8}$/.test(raw)) return raw.length > 1 ? 'multiple' : 'single';
  if (parseBool(raw) != null) return 'truefalse';
  return 'fill';
}

/* ───────────────────────── 对外入口 ───────────────────────── */

/** 判断一份 docx 是否使用旧的「【题型】」模板格式。 */
export function isLegacyTemplate(blocks: Block[]): boolean {
  for (const block of blocks) {
    const first = block.lines[0];
    if (!first) continue;
    if (/^[\[【]\s*([^\]】]{1,12}?)\s*[\]】]/.test(first)) {
      const inner = /^[\[【]\s*([^\]】]{1,12}?)\s*[\]】]/.exec(first)![1].replace(/\s+/g, '');
      if (TYPE_ALIASES[inner]) return true;
    }
  }
  return false;
}

/** 解析真实试卷（+ 可选参考答案），返回统一的 ImportResult。 */
export async function parseRealPaper(
  paperBuffer: Buffer | null,
  answerBuffer: Buffer | null,
  preparsed?: { blocks: Block[]; warnings: number },
): Promise<ImportResult> {
  const paper = preparsed ?? (await docxToBlocks(paperBuffer as Buffer));
  const result = parsePaperBlocks(paper.blocks, paper.warnings);
  const notes = [...result.notes];

  let answerEntries: AnswerEntry[] = [];
  if (answerBuffer) {
    const keyDoc = await docxToBlocks(answerBuffer);
    answerEntries = parseAnswerKey(keyDoc.blocks);
    notes.push(`参考答案识别到 ${answerEntries.length} 条`);
  } else {
    notes.push('没有提供参考答案文件，客观题会缺答案');
  }

  const answers = indexAnswers(answerEntries);
  const questions = result.drafts.map((draft) => finalizeDraft(draft, result.sections, answers));
  questions.forEach((q, i) => (q.seq = i + 1));

  const matched = questions.filter((q) => q.issues.every((i) => i.message !== '参考答案里没有找到对应题号')).length;

  const missing = questions
    .filter((q) => q.issues.some((i) => i.message === '参考答案里没有找到对应题号'))
    .map((q) => q.seq);
  if (missing.length) notes.push(`第 ${missing.join('、')} 题没有匹配到参考答案`);

  const errors = questions.reduce((s, q) => s + q.issues.filter((i) => i.level === 'error').length, 0);
  const warnings = questions.reduce((s, q) => s + q.issues.filter((i) => i.level === 'warn').length, 0);
  const totalScore = questions.reduce((s, q) => s + q.score, 0);

  if (!questions.length) notes.push('未识别到任何题目：真实卷需要「综合题X」材料 + 题干末尾的（题型，N分）标记');
  if (result.sections.length) {
    const declared = result.sections.reduce((s, sec) => s + (sec.score ?? 0), 0);
    notes.push(`识别到 ${result.sections.length} 道大题，标注合计 ${declared} 分`);
  }
  if (questions.length && totalScore !== 100) notes.push(`全卷合计 ${totalScore} 分（不是 100 分，如为预期可忽略）`);
  if (answerEntries.length && matched === 0) notes.push('参考答案与试卷题号完全对不上，请检查两份文件是否属于同一套卷');

  return {
    title: result.title,
    questions: questions.map(({ blankCount: _blankCount, ...rest }) => rest),
    sections: result.sections,
    counts: { total: questions.length, errors, warnings, totalScore },
    notes,
  };
}
