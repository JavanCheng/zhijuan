// 解析自检：pnpm exec tsx scripts/test-import.ts [文件路径]
import fs from 'node:fs';
import path from 'node:path';
import { parseDocx } from '../server/import/docx.ts';

const file = process.argv[2] ?? path.resolve('templates/题目模板.docx');
const buffer = fs.readFileSync(file);
const result = await parseDocx(buffer);

console.log(`文件：${file}`);
console.log(`标题：${result.title}`);
console.log(`统计：${JSON.stringify(result.counts)}`);
console.log(`提示：${result.notes.join(' | ') || '无'}`);
console.log('');
for (const q of result.questions) {
  const head = `#${q.seq} [${q.type}] ${q.score}分`;
  console.log(head);
  console.log('  题干：', q.stemHtml.replace(/<[^>]+>/g, '').slice(0, 80));
  if (q.options.length) console.log('  选项：', q.options.map((o) => `${o.key}.${o.text}`).join(' '));
  console.log('  答案：', JSON.stringify(q.answer));
  if (q.testCases.length) console.log('  测试点：', JSON.stringify(q.testCases));
  if (q.issues.length) console.log('  问题：', JSON.stringify(q.issues));
}
