// 前后端共用的类型定义。任何评分规则、题型字段的改动都应先改这里。

export type Role = 'admin' | 'teacher' | 'student';

export type QuestionType = 'single' | 'multiple' | 'truefalse' | 'fill' | 'short' | 'code';

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  truefalse: '判断题',
  fill: '填空题',
  short: '简答题',
  code: '代码题',
};

/** 只有这四类能全自动判分 */
export const AUTO_GRADED: QuestionType[] = ['single', 'multiple', 'truefalse', 'fill', 'code'];

export type ExamStatus = 'draft' | 'published' | 'closed';
export type SubmissionStatus = 'in_progress' | 'submitted' | 'grading' | 'graded';

export interface Option {
  key: string;
  text: string;
}

/**
 * 客观题答案。各字段都向后兼容：老数据只带 kind + 主体字段。
 * - choice.missedDeduct：漏选扣分（每个漏选扣多少分），不填表示必须全对。
 * - fill.blankScores：逐空分值（缺省按满分平均分配）。
 * - fill.manualBlanks：该空「言之有理即给分」，只能人工评分。
 */
export type AnswerSpec =
  | { kind: 'choice'; keys: string[]; missedDeduct?: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'fill'; blanks: string[][]; blankScores?: number[]; manualBlanks?: boolean[] }
  | { kind: 'reference'; text: string }
  | { kind: 'none' };

/** 大题（材料题）分组：综合题一 / 综合题二…，材料只展示一次，小题挂在组下。 */
export interface QuestionSection {
  /** 0 起的组序号，与 ParsedQuestion.sectionIndex 对应 */
  index: number;
  /** 中文序号或数字，用于和参考答案对齐：'一' / '1' */
  key: string;
  /** 展示用标题：'综合题一' */
  title: string;
  /** 该大题声明分值，如 23 */
  score: number | null;
  /** 材料正文（HTML，可含图片/表格） */
  html: string;
}

export interface CodeSpec {
  languages: string[];
  starterCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface TestCase {
  id: number;
  seq: number;
  stdin: string;
  expectedStdout: string;
  score: number;
  visible: boolean;
}

/** 教师视角：含答案与全部测试点 */
export interface QuestionTeacher {
  id: number;
  seq: number;
  type: QuestionType;
  stemHtml: string;
  score: number;
  options: Option[];
  answer: AnswerSpec | null;
  explanationHtml: string | null;
  codeSpec: CodeSpec | null;
  testCases: TestCase[];
  /** 所属大题序号（对应 ExamDetailTeacher.sections[].index），null 表示独立题目 */
  sectionIndex: number | null;
  /** 需要教师人工评分（简答、无测试点的代码题、含「言之有理」空的填空题） */
  needsManual: boolean;
}

/** 学生视角：绝不下发答案与隐藏测试点 */
export interface QuestionStudent {
  id: number;
  seq: number;
  type: QuestionType;
  stemHtml: string;
  score: number;
  options: Option[];
  blanks: number;
  codeSpec: { languages: string[]; starterCode: string; timeLimitMs: number } | null;
  sampleCases: { stdin: string; expectedStdout: string; label: string }[];
  sectionIndex: number | null;
}

export interface StudentAnswer {
  key?: string;
  keys?: string[];
  value?: boolean;
  blanks?: string[];
  text?: string;
  language?: string;
  code?: string;
}

export interface ExamSummary {
  id: number;
  title: string;
  description: string;
  status: ExamStatus;
  durationMin: number;
  startAt: string | null;
  endAt: string | null;
  resultsPublished: boolean;
  totalScore: number;
  questionCount: number;
  createdAt: string;
}

export interface ExamDetailTeacher extends ExamSummary {
  questions: QuestionTeacher[];
  sections: QuestionSection[];
  submissionCount: number;
}

export interface ImportIssue {
  level: 'error' | 'warn';
  message: string;
}

export interface ParsedQuestion {
  seq: number;
  type: QuestionType;
  stemHtml: string;
  score: number;
  options: Option[];
  answer: AnswerSpec;
  explanationHtml: string | null;
  codeSpec: CodeSpec | null;
  testCases: { stdin: string; expectedStdout: string; score: number; visible: boolean }[];
  issues: ImportIssue[];
  sectionIndex: number | null;
  needsManual: boolean;
}

export interface ImportResult {
  title: string | null;
  questions: ParsedQuestion[];
  sections: QuestionSection[];
  counts: { total: number; errors: number; warnings: number; totalScore: number };
  notes: string[];
}

export interface GradeItem {
  label: string;
  ok: boolean;
  score: number;
  maxScore: number;
  expected?: string;
  got?: string;
  note?: string;
  visible?: boolean;
}

export interface GradeDetail {
  note?: string;
  items: GradeItem[];
  needsManual?: boolean;
  runtimeError?: string;
}

export interface AnswerTeacher {
  id: number;
  questionId: number;
  raw: StudentAnswer | null;
  autoScore: number | null;
  autoDetail: GradeDetail | null;
  finalScore: number | null;
  comment: string | null;
  gradedAt: string | null;
}

export interface SubmissionRow {
  id: number;
  studentId: number;
  studentName: string;
  studentNo: string;
  classId: number | null;
  className: string | null;
  status: SubmissionStatus;
  autoScore: number | null;
  finalScore: number | null;
  submittedAt: string | null;
  answered: number;
  needsReview: number;
  questionCount: number;
}

export interface SubmissionDetailTeacher extends SubmissionRow {
  examId: number;
  examTitle: string;
  examTotalScore: number;
  questions: QuestionTeacher[];
  sections: QuestionSection[];
  answers: AnswerTeacher[];
  totalAutoScore: number;
}

export interface StudentExamPage {
  exam: ExamSummary & { teacherName: string };
  submission: {
    id: number;
    status: SubmissionStatus;
    startedAt: string;
    submittedAt: string | null;
    deadlineAt: string | null;
  };
  questions: QuestionStudent[];
  sections: QuestionSection[];
  answers: Record<string, StudentAnswer>;
}

export interface StudentResultPage {
  exam: ExamSummary;
  submission: {
    id: number;
    status: SubmissionStatus;
    submittedAt: string | null;
  };
  resultsPublished: boolean;
  score: number | null;
  totalScore: number;
  questions: Array<{
    id: number;
    seq: number;
    type: QuestionType;
    stemHtml: string;
    score: number;
    options: Option[];
    finalScore: number | null;
    comment: string | null;
    answer: AnswerSpec | null;
    explanationHtml: string | null;
    raw: StudentAnswer | null;
    sectionIndex: number | null;
  }>;
  sections: QuestionSection[];
}

/* ── 班级与学情看板 ───────────────────────────────────── */

export interface ClassInfo {
  id: number;
  name: string;
  grade: string | null;
  studentCount: number;
}

export interface StudentInfo {
  id: number;
  name: string;
  studentNo: string;
  classId: number | null;
  className: string | null;
}

export interface AnalyticsExamOption {
  id: number;
  title: string;
  status: ExamStatus;
  totalScore: number;
  questionCount: number;
  submittedCount: number;
  resultsPublished: boolean;
  createdAt: string;
}

export interface AnalyticsMeta {
  exams: AnalyticsExamOption[];
  classes: ClassInfo[];
  students: StudentInfo[];
}

export interface ScoreBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface ClassAnalytics {
  id: number;
  name: string;
  totalStudents: number;
  participants: number;
  avg: number;
  max: number;
  min: number;
  passRate: number;
  excellentRate: number;
  buckets: number[];
}

export interface StudentAnalytics {
  id: number;
  submissionId: number;
  name: string;
  studentNo: string;
  classId: number | null;
  className: string | null;
  score: number;
  totalScore: number;
  rank: number;
  classRank: number;
  classSize: number;
  answered: number;
  questionCount: number;
  needsReview: number;
  submittedAt: string | null;
  questionScores: (number | null)[];
}

export interface QuestionAnalytics {
  id: number;
  seq: number;
  type: QuestionType;
  score: number;
  avgScore: number;
  scoreRate: number;
  fullRate: number;
  zeroRate: number;
  answered: number;
}

export interface TrendPoint {
  examId: number;
  title: string;
  date: string;
  avg: number;
  max: number;
  min: number;
  participants: number;
}

export interface TypeAnalytics {
  type: QuestionType;
  label: string;
  totalScore: number;
  avgScore: number;
  rate: number;
}

export interface AnalyticsPayload {
  exam: AnalyticsExamOption & { description: string; durationMin: number };
  filters: { classIds: number[]; studentIds: number[] };
  kpi: {
    participants: number;
    expected: number;
    avg: number;
    max: number;
    min: number;
    passRate: number;
    excellentRate: number;
    submitRate: number;
    avgAnsweredRate: number;
  };
  distribution: ScoreBucket[];
  classes: ClassAnalytics[];
  students: StudentAnalytics[];
  questions: QuestionAnalytics[];
  typeSummary: TypeAnalytics[];
  trend: TrendPoint[];
  generatedAt: string;
}

export interface StudentProfileQuestion {
  id: number;
  seq: number;
  type: QuestionType;
  score: number;
  maxScore: number;
  classAvg: number;
}

export interface StudentProfileExam {
  examId: number;
  title: string;
  status: ExamStatus;
  totalScore: number;
  score: number;
  classAvg: number;
  classRank: number;
  classSize: number;
  submittedAt: string | null;
}

export interface StudentProfile {
  student: StudentInfo;
  summary: {
    taken: number;
    avg: number;
    best: number;
    worst: number;
    latestRank: number | null;
    latestClassSize: number;
    latestDelta: number | null;
  };
  exams: StudentProfileExam[];
  latest: {
    examId: number;
    title: string;
    totalScore: number;
    score: number;
    classAvg: number;
    classRank: number;
    classSize: number;
    questions: StudentProfileQuestion[];
  } | null;
}

/* ── 班级与学生名册 ───────────────────────────────────── */

export interface ManagedClass {
  id: number;
  name: string;
  grade: string | null;
  sortOrder: number;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

export interface ManagedStudent {
  id: number;
  name: string;
  studentNo: string;
  classId: number | null;
  className: string | null;
  isActive: boolean;
  createdAt: string;
  submissionCount: number;
}

export interface RosterOverview {
  classes: ManagedClass[];
  students: ManagedStudent[];
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  unassignedStudents: number;
}

export interface RosterIssue {
  sheet: string;
  row: number;
  level: 'error' | 'warning';
  message: string;
}

export interface RosterImportSummary {
  rowsRead: number;
  classesCreated: number;
  studentsCreated: number;
  studentsUpdated: number;
  studentsReactivated: number;
}

export interface RosterImportResult {
  ok: boolean;
  summary: RosterImportSummary;
  errors: RosterIssue[];
  warnings: RosterIssue[];
}

/* ── 管理员：教师账号 ─────────────────────────────────── */

export interface ManagedTeacher {
  id: number;
  /** 登录账号：新教师就是手机号；历史账号可能仍是旧用户名 */
  username: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  examCount: number;
  submissionCount: number;
}

export interface TeacherOverview {
  teachers: ManagedTeacher[];
  total: number;
  active: number;
  inactive: number;
  withExams: number;
  examCount: number;
}

export interface DeleteTeacherResult {
  ok: boolean;
  deleted: boolean;
  purgedExams: number;
}

export interface BatchTeacherResult {
  ok: boolean;
  affected: number;
  deleted: number;
  purgedExams: number;
}
