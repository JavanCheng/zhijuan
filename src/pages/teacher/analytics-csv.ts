import type { AnalyticsPayload } from '../../../shared/types';

function csvCell(value: string | number): string {
  let text = String(value ?? '');
  // Treat user-entered cells as text, not spreadsheet formulas.
  if (typeof value === 'string' && (/^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function filteredAnalyticsCsv({ exam, students }: Pick<AnalyticsPayload, 'exam' | 'students'>): string {
  const header = ['考试', '成绩状态', '班级', '学号', '姓名', '得分', '满分', '得分率(%)', '总排名', '班级排名', '作答数', '待校准'];
  const rows = students.map((student) => [
    exam.title,
    exam.resultsPublished ? '已发布' : '未发布',
    student.className ?? '未分班',
    student.studentNo,
    student.name,
    student.score,
    student.totalScore,
    student.totalScore > 0 ? Math.round((student.score / student.totalScore) * 1000) / 10 : 0,
    student.rank,
    `${student.classRank}/${student.classSize}`,
    `${student.answered}/${student.questionCount}`,
    student.needsReview,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
