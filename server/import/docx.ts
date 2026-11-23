// Word(.docx) 题目解析：mammoth 转 HTML → 块级状态机 → 结构化题目。
// 只依赖模板约定，不做"通用试卷理解"，解析结果必须经教师预览确认后才会入库。
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import type {
  AnswerSpec,
  CodeSpec,
  ImportIssue,
  ImportResult,
  Option,
  ParsedQuestion,
  QuestionType,
} from '../../shared/types.ts';

const DEFAULT_SCORE: Record<QuestionType, number> = {
  single: 5,
  multiple: 5,
  truefalse: 3,
  fill: 5,
  short: 10,
  code: 20,
};

const TYPE_ALIASES: Record<string, QuestionType> = {
  单选: 'single',
  单选题: 'single',
  单项选择: 'single',
  单项选择题: 'single',
  多选: 'multiple',
  多选题: 'multiple',
  多项选择: 'multiple',
  多项选择题: 'multiple',
  判断: 'truefalse',
  判断题: 'truefalse',
  填空: 'fill',
  填空题: 'fill',
  简答: 'short',
  简答题: 'short',
  问答: 'short',
  问答题: 'short',
  主观题: 'short',
  代码: 'code',
  代码题: 'code',
  编程: 'code',
  编程题: 'code',
};

const LANG_ALIASES: Record<string, string> = {
  python: 'python',
  py: 'python',
  python3: 'python',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
};

const STEM_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'span', 'code', 'pre',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'h1', 'h2', 'h3', 'h4',
  'blockquote',
];

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: STEM_TAGS,
    allowedAttributes: {
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': { 'text-align': [/^(left|center|right)$/], 'font-weight': [/^(bold|normal|[0-9]{3})$/] },
    },
    allowedSchemes: ['data', 'http', 'https'],
    allowedSchemesByTag: { img: ['data', 'http', 'https'] },
    transformTags: {
      b: 'strong',
      i: 'em',
    },
  });
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|td|th|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

interface Block {
  tag: string;
  html: string;
  lines: string[];
}

const BLOCK_RE = /<(p|h[1-6]|table|ul|ol|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;

function linesOf(block: Block): string[] {
  if (block.tag === 'table') {
    return [...block.html.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((m) => stripTags(m[2]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  if (block.tag === 'ul' || block.tag === 'ol') {
    return [...block.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripTags(m[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return stripTags(block.html)
    .split('\n')
    .map((l) => l.replace(/\u3000/g, ' ').trim())
    .filter(Boolean);
}

function blockify(html: string): Block[] {
  const out: Block[] = [];
  for (const m of html.matchAll(BLOCK_RE)) {
    const tag = m[1].toLowerCase();
    out.push({ tag, html: m[0], lines: [] });
  }
  if (!out.length) {
    const text = stripTags(html).trim();
    if (text) out.push({ tag: 'p', html: `<p>${escapeHtml(text)}</p>`, lines: [text] });
  }
  out.forEach((b) => (b.lines = linesOf(b)));
  return out;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function matchHeader(line: string): { type: QuestionType; rest: string } | null {
  const idx = line.search(/[\[【]/);
  if (idx < 0 || idx > 24) return null;
  const m = /^[\[【]\s*([^\]】]{1,12}?)\s*[\]】]\s*([\s\S]*)$/.exec(line.slice(idx));
  if (!m) return null;
  const type = TYPE_ALIASES[m[1].replace(/\s+/g, '')];
  if (!type) return null;
  const prefix = line.slice(0, idx).trim();
  let rest = m[2].trim();
  if (prefix && !/^第?\s*\d+\s*题?[.、．)）]?$/.test(prefix)) rest = `${prefix} ${rest}`.trim();
  rest = rest.replace(/^(?:第\s*\d+\s*题\s*[.、．:：]?|\d+\s*[.、．)）])\s*/, '');
  return { type, rest };
}

function takeTrailingScore(text: string): { text: string; score: number | null } {
  const m = /[（(]\s*(\d+(?:\.\d+)?)\s*分\s*[）)]\s*$/.exec(text);
  if (!m) return { text, score: null };
  return { text: text.slice(0, m.index).trim(), score: Number(m[1]) };
}

const META_RE = /^(参考答案|答案|解析|语言|分值|说明|样例输入|样例输出|测试点)\s*[:：]\s*([\s\S]*)$/;

function parseOptionLine(line: string): Option[] {
  const text = line.trim();
  const re = /([A-H])\s*[.、．)）]\s*/g;
  const matches = [...text.matchAll(re)];
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

/** 一行一个选项（A. ROM）时使用 */
function parseSingleOption(line: string): Option | null {
  const m = /^\s*([A-H])\s*[.、．)）]\s*(\S[\s\S]*)$/.exec(line);
  if (!m) return null;
  const body = m[2].replace(/[；;]\s*$/, '').trim();
  if (!body) return null;
  return { key: m[1], text: body };
}

function choiceOptionsOf(line: string): Option[] {
  const multi = parseOptionLine(line);
  if (multi.length) return multi;
  const single = parseSingleOption(line);
  return single ? [single] : [];
}

function parseChoiceKeys(raw: string): string[] {
  const cleaned = raw.replace(/[\s,，、;；:：]/g, '').toUpperCase();
  if (/^[A-H]+$/.test(cleaned)) return cleaned.split('');
  return [];
}

function parseBool(raw: string): boolean | null {
  const t = raw.replace(/\s/g, '');
  if (/^(对|正确|√|✓|是|真|T|TRUE|Y|YES|1)$/i.test(t)) return true;
  if (/^(错|错误|×|✗|否|假|F|FALSE|N|NO|0)$/i.test(t)) return false;
  return null;
}

function unescapeNewlines(raw: string): string {
  return raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

interface DraftCase {
  stdin: string;
  expectedStdout: string;
  score: number | null;
  visible: boolean;
}

function parseTestCaseLine(line: string): DraftCase | null {
  let text = line.trim();
  text = text.replace(/^(?:#?\s*\d+\s*[.、．)）]\s*)/, '');
  const parts = text.split(/\s*[|｜]\s*/);
  if (parts.length < 2) return null;
  let stdin: string | null = null;
  let stdout: string | null = null;
  let score: number | null = null;
  let visible = false;
  let touched = false;

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (/^(公开|可见|样例)$/.test(p)) {
      visible = true;
      touched = true;
      continue;
    }
    if (/^(隐藏)$/.test(p)) {
      visible = false;
      touched = true;
      continue;
    }
    const scoreOnly = /^(\d+(?:\.\d+)?)\s*分$/.exec(p);
    if (scoreOnly) {
      score = Number(scoreOnly[1]);
      touched = true;
      continue;
    }
    const m = /^(输入|输出|分值|分数)\s*[=:：]\s*([\s\S]*)$/.exec(p);
    if (!m) return null;
    touched = true;
    if (m[1] === '输入') stdin = unescapeNewlines(m[2]);
    else if (m[1] === '输出') stdout = unescapeNewlines(m[2]);
    else score = Number(m[2].trim());
  }

  if (!touched || stdin === null || stdout === null) return null;
  return { stdin, expectedStdout: stdout, score, visible };
}

interface Draft {
  type: QuestionType;
  stemParts: string[];
  score: number | null;
  options: Option[];
  answerRaw: string | null;
  explanationRaw: string | null;
  languages: string[];
  cases: DraftCase[];
  issues: ImportIssue[];
}

function newDraft(type: QuestionType): Draft {
  return {
    type,
    stemParts: [],
    score: null,
    options: [],
    answerRaw: null,
    explanationRaw: null,
    languages: type === 'code' ? ['python'] : [],
    cases: [],
    issues: [],
  };
}

function buildAnswer(d: Draft): AnswerSpec {
  switch (d.type) {
    case 'single':
    case 'multiple':
      return { kind: 'choice', keys: parseChoiceKeys(d.answerRaw ?? '') };
    case 'truefalse':
      return { kind: 'bool', value: parseBool(d.answerRaw ?? '') ?? false };
    case 'fill': {
      const blanks = (d.answerRaw ?? '')
        .split(/\|\||｜｜/)
        .map((part) => part.split(/[|｜]/).map((s) => s.trim()).filter(Boolean))
        .filter((arr) => arr.length > 0);
      return { kind: 'fill', blanks };
    }
    case 'short':
      return { kind: 'reference', text: (d.answerRaw ?? '').trim() };
    case 'code':
      return { kind: 'none' };
  }
}

function finalize(d: Draft, index: number): ParsedQuestion {
  const issues = [...d.issues];
  let score = d.score;
  if (score == null || Number.isNaN(score) || score <= 0) {
    score = DEFAULT_SCORE[d.type];
    issues.push({ level: 'warn', message: `未识别到分值，按 ${score} 分处理` });
  }

  const stemHtml = sanitize(d.stemParts.join('\n'));
  if (!stripTags(stemHtml).trim() && d.type !== 'code') {
    issues.push({ level: 'error', message: '题干为空' });
  }

  let answer = buildAnswer(d);

  if (d.type === 'single' || d.type === 'multiple') {
    if (d.options.length < 2) issues.push({ level: 'error', message: '选项少于 2 个' });
    const keys = (answer as Extract<AnswerSpec, { kind: 'choice' }>).keys;
    if (!keys.length) issues.push({ level: 'error', message: '缺少答案（格式：答案：B 或 答案：A,C）' });
    else if (keys.some((k) => !d.options.find((o) => o.key === k))) {
      issues.push({ level: 'error', message: `答案 ${keys.join(',')} 不在选项范围内` });
    }
    if (d.type === 'single' && keys.length > 1) {
      issues.push({ level: 'error', message: '单选题答案只能有一个' });
    }
  }

  if (d.type === 'truefalse' && d.answerRaw != null && parseBool(d.answerRaw) === null) {
    issues.push({ level: 'error', message: '判断题答案应为 对/错（也支持 √/×、T/F）' });
  }
  if (d.type === 'truefalse' && d.answerRaw == null) {
    issues.push({ level: 'error', message: '缺少答案（格式：答案：对）' });
  }

  if (d.type === 'fill') {
    const blanks = (answer as Extract<AnswerSpec, { kind: 'fill' }>).blanks;
    if (!blanks.length) issues.push({ level: 'error', message: '缺少答案（多空用 || 分隔，同一空的多种写法用 | 分隔）' });
    if (blanks.length && blanks.some((b) => b.length === 0)) {
      issues.push({ level: 'warn', message: '存在空答案的填空' });
    }
  }

  if (d.type === 'short' && !(answer as Extract<AnswerSpec, { kind: 'reference' }>).text) {
    issues.push({ level: 'warn', message: '没有参考答案，教师需完全手工评分' });
  }

  let codeSpec: CodeSpec | null = null;
  let testCases: ParsedQuestion['testCases'] = [];
  if (d.type === 'code') {
    if (!d.cases.length) {
      issues.push({ level: 'error', message: '代码题缺少测试点（测试点：下方每行一个用例）' });
    }
    const explicit = d.cases.reduce((s, c) => s + (c.score ?? 0), 0);
    const missing = d.cases.filter((c) => c.score == null);
    const remain = Math.max(0, score - explicit);
    const each = missing.length ? Math.round((remain / missing.length) * 100) / 100 : 0;
    testCases = d.cases.map((c) => ({
      stdin: c.stdin,
      expectedStdout: c.expectedStdout,
      score: c.score ?? each,
      visible: c.visible,
    }));
    if (explicit > score) {
      issues.push({ level: 'warn', message: `测试点分值合计 ${explicit} 超过题目分值 ${score}` });
    }
    codeSpec = {
      languages: d.languages.length ? d.languages : ['python'],
      starterCode: '',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
    };
  }

  return {
    seq: index + 1,
    type: d.type,
    stemHtml,
    score,
    options: d.options,
    answer,
    explanationHtml: d.explanationRaw ? sanitize(`<p>${escapeHtml(d.explanationRaw)}</p>`) : null,
    codeSpec,
    testCases,
    issues,
  };
}

export async function parseDocx(buffer: Buffer): Promise<ImportResult> {
  const { value: rawHtml, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='标题'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
      ],
    },
  );

  const blocks = blockify(rawHtml);
  const notes: string[] = [];
  const warnings = messages.filter((m) => m.type === 'warning');
  if (warnings.length) notes.push(`Word 转换提示 ${warnings.length} 条（不影响解析）`);

  let title: string | null = null;
  let current: Draft | null = null;
  let mode: string = 'body';
  const results: ParsedQuestion[] = [];

  const flush = () => {
    if (!current) return;
    results.push(finalize(current, results.length));
    current = null;
    mode = 'body';
  };

  const appendStemHtml = (html: string) => {
    if (!current) return;
    current.stemParts.push(html);
  };

  const appendStemText = (text: string) => {
    if (!current) return;
    current.stemParts.push(`<p>${escapeHtml(text)}</p>`);
  };

  for (const block of blocks) {
    const lines = block.lines;
    if (!lines.length) continue;

    const header = matchHeader(lines[0]);
    if (header) {
      flush();
      current = newDraft(header.type);
      mode = 'body';
      let rest = header.rest;
      if (rest) {
        const scored = takeTrailingScore(rest);
        if (scored.score != null) current.score = scored.score;
        rest = scored.text;
        if (rest) appendStemText(rest);
      }
      // 首行若还带选项（少见），尝试拆出
      for (const extra of lines.slice(1)) {
        handleLine(extra);
      }
      continue;
    }

    if (!current) {
      if (!title) {
        const text = lines[0].trim();
        if (text && text.length <= 60 && !/^(说明|使用|填写|注意)[:：]/.test(text)) {
          title = text.replace(/^[【\[]|[】\]]$/g, '').trim();
        }
      }
      continue;
    }

    // 整块都不含字段/选项/测试点时，原样保留 HTML，避免表格与图片被拆成纯文本
    const isChoice = current.type === 'single' || current.type === 'multiple';
    const consumable =
      mode === 'cases' ||
      lines.some(
        (line) =>
          META_RE.test(line) ||
          (isChoice && choiceOptionsOf(line).length > 0) ||
          (mode === 'cases' && parseTestCaseLine(line) !== null),
      );
    if (!consumable) {
      appendStemHtml(block.html);
      continue;
    }

    for (const line of lines) handleLine(line);
  }
  flush();

  function handleLine(line: string): void {
    if (!current) return;

    const meta = META_RE.exec(line);
    if (meta) {
      const label = meta[1];
      const value = meta[2].trim();
      switch (label) {
        case '答案':
        case '参考答案':
          current.answerRaw = value;
          return;
        case '解析':
          current.explanationRaw = value;
          return;
        case '语言': {
          const langs = value
            .split(/[,，/、\s]+/)
            .map((s) => LANG_ALIASES[s.toLowerCase()])
            .filter(Boolean);
          if (langs.length) current.languages = [...new Set(langs)];
          else current.issues.push({ level: 'warn', message: `未识别的语言：${value}` });
          return;
        }
        case '分值': {
          const n = Number(value.replace(/[分\s]/g, ''));
          if (Number.isFinite(n) && n > 0) current.score = n;
          return;
        }
        case '说明':
          appendStemText(value);
          return;
        case '样例输入':
        case '样例输出': {
          const caseLine = current.cases[current.cases.length - 1];
          if (label === '样例输入') {
            current.cases.push({ stdin: unescapeNewlines(value), expectedStdout: '', score: 0, visible: true });
          } else if (caseLine && !caseLine.expectedStdout) {
            caseLine.expectedStdout = unescapeNewlines(value);
          } else {
            current.cases.push({ stdin: '', expectedStdout: unescapeNewlines(value), score: 0, visible: true });
          }
          return;
        }
        case '测试点':
          mode = 'cases';
          if (value) {
            const c = parseTestCaseLine(value);
            if (c) current.cases.push(c);
          }
          return;
      }
    }

    if (mode === 'cases') {
      const c = parseTestCaseLine(line);
      if (c) {
        current.cases.push(c);
        return;
      }
      if (matchHeader(line)) return; // 交给外层（不会发生）
      if (/输入|输出/.test(line)) {
        current.issues.push({ level: 'warn', message: `测试点格式无法识别：${line.slice(0, 40)}` });
      }
      return;
    }

    if (current.type === 'single' || current.type === 'multiple') {
      const options = choiceOptionsOf(line);
      if (options.length) {
        current.options.push(...options);
        return;
      }
    }

    if (current.type === 'code') {
      const c = parseTestCaseLine(line);
      if (c && line.includes('输出')) {
        current.cases.push(c);
        return;
      }
    }

    const scored = takeTrailingScore(line);
    if (scored.score != null && current.score == null) current.score = scored.score;
    appendStemText(scored.text);
  }

  // 题目排序、统计
  results.forEach((q, i) => (q.seq = i + 1));
  const errors = results.reduce((s, q) => s + q.issues.filter((i) => i.level === 'error').length, 0);
  const warns = results.reduce((s, q) => s + q.issues.filter((i) => i.level === 'warn').length, 0);
  const totalScore = results.reduce((s, q) => s + q.score, 0);

  if (!results.length) notes.push('未识别到任何题目，请检查是否使用了 [题型] 标记');
  if (results.length && totalScore !== 100) notes.push(`全卷合计 ${totalScore} 分（不是 100 分，如为预期可忽略）`);

  return {
    title,
    questions: results,
    counts: { total: results.length, errors, warnings: warns, totalScore },
    notes,
  };
}
