// Word(.docx) → HTML 块 的公共工具：两种解析器（模板格式 / 真实试卷格式）共用。
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';

export const STEM_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'span', 'code', 'pre',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'h1', 'h2', 'h3', 'h4',
  'blockquote', 'div',
];

export function sanitize(html: string): string {
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
    allowedSchemes: ['data'],
    allowProtocolRelative: false,
    allowedSchemesByTag: { img: ['data'] },
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/]+=*$/i.test(frame.attribs.src ?? ''),
    transformTags: {
      b: 'strong',
      i: 'em',
    },
  });
}

export function decodeEntities(input: string): string {
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

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|td|th|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface Block {
  tag: string;
  html: string;
  lines: string[];
}

const BLOCK_RE = /<(p|h[1-6]|table|ul|ol|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function linesOf(block: Block): string[] {
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

export function blockify(html: string): Block[] {
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

/** mammoth 把 docx 转成 HTML 再切成块；样式映射让 Word 标题变成 h1/h2。 */
export async function docxToBlocks(buffer: Buffer): Promise<{ blocks: Block[]; warnings: number }> {
  const { value, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='标题'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
      ],
    },
  );
  const warnings = messages.filter((m) => m.type === 'warning').length;
  return { blocks: blockify(value), warnings };
}
