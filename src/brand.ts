// 品牌信息集中在这里：改名只改这一处（外加 index.html / server/index.ts / package.json / README 的标题文案）。
// 名称要对「教师」和「学生」都成立，所以英文副标用 ONLINE ASSESSMENT，不再限定 EXAM。
export const BRAND = {
  name: '智卷',
  latin: 'ONLINE ASSESSMENT',
  title: '智卷',
  description: '智卷 · 信息科技在线测评系统：Word 出题、自动阅卷、代码题在线评测',
} as const;
