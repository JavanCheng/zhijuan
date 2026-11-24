import * as XLSX from 'xlsx';
import type { RosterIssue } from '../../shared/types.ts';

export interface ParsedRosterRow {
  sheet: string;
  row: number;
  className: string;
  name: string;
  studentNo: string;
}

export interface RosterParseResult {
  rows: ParsedRosterRow[];
  errors: RosterIssue[];
  warnings: RosterIssue[];
}

const CLASS_HEADERS = ['班级', '班级名称', '所属班级', '班级名', '班', 'class', 'classname'];
const NAME_HEADERS = ['姓名', '学生姓名', '学生名字', '名字', '学生', 'name', 'studentname'];
const NO_HEADERS = ['学号', '学生学号', '学籍号', '编号', 'studentno', 'studentid', 'no', 'id'];

const MAX_ROWS = 5000;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()]/g, '');
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function issue(sheet: string, row: number, level: RosterIssue['level'], message: string): RosterIssue {
  return { sheet, row, level, message };
}

/**
 * 解析学生名册：支持 .xlsx / .xls / .csv。
 * 标准表头：班级、姓名、学号。也支持「每个工作表就是班级」的表头：姓名、学号。
 * 未检测到表头时，按「班级、姓名、学号」列顺序解析。
 */
export function parseRosterWorkbook(buffer: Buffer): RosterParseResult {
  const rows: ParsedRosterRow[] = [];
  const errors: RosterIssue[] = [];
  const warnings: RosterIssue[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  } catch (err) {
    return {
      rows,
      errors: [issue('', 0, 'error', `文件无法解析：${err instanceof Error ? err.message : '格式不支持'}`)],
      warnings,
    };
  }

  if (!workbook.SheetNames.length) {
    return { rows, errors: [issue('', 0, 'error', '工作簿里没有工作表')], warnings };
  }

  const seen = new Map<string, { sheet: string; row: number }>();
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false,
    });
    if (!matrix.length) continue;

    let headerIndex = 0;
    let headers = matrix[0].map(normalizeHeader);
    let classIdx = findColumn(headers, CLASS_HEADERS);
    let nameIdx = findColumn(headers, NAME_HEADERS);
    let noIdx = findColumn(headers, NO_HEADERS);

    // 允许工作表前几行是标题 / 说明，向下寻找真正的表头
    if (nameIdx < 0 || noIdx < 0) {
      for (let index = 1; index < Math.min(matrix.length, 6); index += 1) {
        const candidate = (matrix[index] ?? []).map(normalizeHeader);
        const candidateName = findColumn(candidate, NAME_HEADERS);
        const candidateNo = findColumn(candidate, NO_HEADERS);
        if (candidateName >= 0 && candidateNo >= 0) {
          headerIndex = index;
          headers = candidate;
          classIdx = findColumn(candidate, CLASS_HEADERS);
          nameIdx = candidateName;
          noIdx = candidateNo;
          break;
        }
      }
    }

    let start = headerIndex + 1;

    if (nameIdx < 0 || noIdx < 0) {
      const firstCells = matrix[0].map(cellText);
      const filled = firstCells.filter(Boolean).length;
      if (filled < 2) {
        errors.push(issue(sheetName, 1, 'error', '无法识别表头，请使用「班级、姓名、学号」模板'));
        continue;
      }
      // 没有表头时按「班级、姓名、学号」顺序解析
      classIdx = 0;
      nameIdx = 1;
      noIdx = 2;
      start = 0;
      warnings.push(issue(sheetName, 1, 'warning', '未检测到表头，已按「班级、姓名、学号」列顺序解析'));
    }

    if (nameIdx < 0 || noIdx < 0) {
      errors.push(issue(sheetName, 1, 'error', '缺少「姓名」或「学号」列'));
      continue;
    }

    const sheetAsClass = sheetName.trim();
    const genericSheetName =
      /^(sheet|工作表)\s*\d+$/i.test(sheetAsClass) ||
      /^(学生名单|名单|学生信息|导入|导入名单|模板|roster|students?)$/i.test(sheetAsClass);
    if (classIdx < 0 && (!sheetAsClass || genericSheetName)) {
      errors.push(issue(sheetName, 1, 'error', '缺少「班级」列，且工作表名不是班级名称'));
      continue;
    }

    for (let index = start; index < matrix.length; index += 1) {
      const row = matrix[index] ?? [];
      const className = (classIdx >= 0 ? cellText(row[classIdx]) : sheetAsClass).trim();
      const name = cellText(row[nameIdx]);
      const studentNo = cellText(row[noIdx]);

      if (!className && !name && !studentNo) continue;
      totalRows += 1;
      if (totalRows > MAX_ROWS) {
        errors.push(issue(sheetName, index + 1, 'error', `一次最多导入 ${MAX_ROWS} 名学生`));
        break;
      }

      const rowNo = index + 1;
      if (!className) {
        errors.push(issue(sheetName, rowNo, 'error', '班级不能为空'));
        continue;
      }
      if (!name) {
        errors.push(issue(sheetName, rowNo, 'error', '姓名不能为空'));
        continue;
      }
      if (!studentNo) {
        errors.push(issue(sheetName, rowNo, 'error', '学号不能为空'));
        continue;
      }
      if (className.length > 40) {
        errors.push(issue(sheetName, rowNo, 'error', '班级名称不能超过 40 字'));
        continue;
      }
      if (name.length > 40) {
        errors.push(issue(sheetName, rowNo, 'error', '姓名不能超过 40 字'));
        continue;
      }
      if (studentNo.length > 40) {
        errors.push(issue(sheetName, rowNo, 'error', '学号不能超过 40 字'));
        continue;
      }

      const previous = seen.get(studentNo);
      if (previous) {
        errors.push(
          issue(
            sheetName,
            rowNo,
            'error',
            `学号 ${studentNo} 与 ${previous.sheet} 第 ${previous.row} 行重复`,
          ),
        );
        continue;
      }
      seen.set(studentNo, { sheet: sheetName, row: rowNo });

      rows.push({ sheet: sheetName, row: rowNo, className, name, studentNo });
    }
  }

  if (!rows.length && !errors.length) {
    errors.push(issue('', 0, 'error', '没有找到可导入的学生数据'));
  }

  return { rows, errors, warnings };
}

/** 生成可直接填写的 Excel 模板（学号列按文本格式）。 */
export function buildRosterTemplate(): Buffer {
  const data = [
    ['班级', '姓名', '学号'],
    ['高一(1)班', '李子涵', '20250301'],
    ['高一(1)班', '王梓萱', '20250302'],
    ['高一(2)班', '马若彤', '20250313'],
    ['高一(2)班', '朱一诺', '20250314'],
    ['高一(3)班', '许文博', '20250325'],
    ['高一(3)班', '邓雅雯', '20250326'],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 18 }];
  for (let row = 1; row < data.length; row += 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: 2 });
    if (worksheet[address]) worksheet[address].z = '@';
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '学生名单');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
