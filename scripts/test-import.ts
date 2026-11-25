// 解析自检：pnpm exec tsx scripts/test-import.ts [试卷.docx] [参考答案.docx]
// 只传一个文件时会自动识别「模板格式（【题型】）」或「真实试卷格式（综合题 + 内联题型）」。
import fs from 'node:fs';
import path from 'node:path';
import { parseExamDocx } from '../server/import/docx.ts';
import type { AnswerSpec } from '../shared/types.ts';

const args = process.argv.slice(2);
const files = (args.length ? args : [path.resolve('templates/题目模板.docx')]).map((file) => ({
  buffer: fs.readFileSync(file),
  filename: path.basename(file),
}));

const result = await parseExamDocx(files);

console.log(`文件：${files.map((f) => f.filename).join(' + ')}`);
console.log(`标题：${result.title}`);
console.log(`统计：${JSON.stringify(result.counts)}`);
console.log(`大题：${result.sections.map((s) => `${s.title}(${s.score ?? '?'}分)`).join(' / ') || '无'}`);
console.log(`提示：${result.notes.join(' | ') || '无'}`);
console.log('');

let section = -1;
for (const q of result.questions) {
  if (q.sectionIndex != null && q.sectionIndex !== section) {
    section = q.sectionIndex;
    const s = result.sections[section];
    console.log(`══ ${s?.title ?? `大题${section}`}（${s?.score ?? '?'} 分）材料 ${(s?.html ?? '').replace(/<[^>]+>/g, '').slice(0, 40)}`);
  }
  const head = `#${q.seq} [${q.type}] ${q.score}分${q.needsManual ? '（需人工）' : ''}`;
  console.log(head);
  console.log('  题干：', q.stemHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 90));
  if (q.options.length) console.log('  选项：', q.options.map((o) => `${o.key}.${o.text}`).join(' | '));
  console.log('  答案：', formatAnswer(q.answer));
  if (q.testCases.length) console.log('  测试点：', JSON.stringify(q.testCases));
  if (q.issues.length) console.log('  问题：', JSON.stringify(q.issues));
}

function formatAnswer(answer: AnswerSpec): string {
  switch (answer.kind) {
    case 'choice':
      return `${answer.keys.join('')}${answer.missedDeduct != null ? `（漏选每个扣 ${answer.missedDeduct} 分）` : ''}`;
    case 'bool':
      return answer.value ? '正确' : '错误';
    case 'fill':
      return answer.blanks
        .map((accepted, i) => {
          const score = answer.blankScores?.[i];
          const manual = answer.manualBlanks?.[i] ? ' [人工]' : '';
          return `第${i + 1}空=${accepted.join(' / ')}${score != null ? `(${score}分)` : ''}${manual}`;
        })
        .join('；');
    case 'reference':
      return `参考：${answer.text.slice(0, 120).replace(/\n/g, ' ⏎ ')}`;
    default:
      return '—';
  }
}
