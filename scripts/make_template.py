"""生成《题目录入模板》Word 文件。

用法（需要 python-docx）：
    python scripts/make_template.py

输出：templates/题目模板.docx
"""
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "templates" / "题目模板.docx"

INK = (0x14, 0x1B, 0x2D)
BRAND = (0x2F, 0x5B, 0xE2)
MUTED = (0x5B, 0x64, 0x7B)


def set_font(run, name: str, size: float, bold: bool = False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    return run


def bottom_border(paragraph, color: str = "D8DEEF"):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    p_bdr.append(bottom)
    p_pr.append(p_bdr)


def heading(text: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(8)
    set_font(p.add_run(text), "微软雅黑", 13, True, BRAND)
    bottom_border(p)
    return p


def line(text: str = "", indent: float = 0.0, mono: bool = False, size: float = 10.5):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    if text:
        set_font(p.add_run(text), "Consolas" if mono else "宋体", size)
    return p


def question(text: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    set_font(p.add_run(text), "微软雅黑", 11.5, True, INK)
    return p


def meta(label: str, value: str, mono: bool = False):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.4)
    p.paragraph_format.space_after = Pt(3)
    set_font(p.add_run(label), "微软雅黑", 10, True, BRAND)
    set_font(p.add_run(value), "Consolas" if mono else "宋体", 10.5)
    return p


def note(text: str):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.4)
    p.paragraph_format.space_after = Pt(6)
    set_font(p.add_run(text), "宋体", 9.5, False, MUTED)
    return p


doc = Document()

for section in doc.sections:
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.3)
    section.right_margin = Cm(2.3)

normal = doc.styles["Normal"]
normal.font.name = "宋体"
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
normal.paragraph_format.line_spacing = 1.35
normal.paragraph_format.space_after = Pt(4)

# ── 封面标题 ──────────────────────────────────────────────
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(6)
set_font(p.add_run("信息科技基础测评 · 示例试卷"), "微软雅黑", 20, True, INK)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(14)
set_font(p.add_run("题目录入模板 v1.0"), "微软雅黑", 10, False, BRAND)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(18)
set_font(p.add_run("按本模板填写 → 上传到教师端 → 预览确认 → 发布考试"), "宋体", 9.5, False, MUTED)

# ── 使用说明 ──────────────────────────────────────────────
heading("使用说明")

rules = [
    "每道题以【题型】开头，题型支持：单选、多选、判断、填空、简答、代码（编程题同义）。",
    "题目分值写在题干末尾，如（10分）；也可以另起一行写「分值：10」。",
    "选项每行一个，以 A. B. C. D. 开头；同一行写多个选项也可以，系统会自动拆分。",
    "答案以「答案：」开头。选择题写字母（多选写 A,C,D），判断题写 对/错，填空题按下面的规则写。",
    "填空题：多个空用 || 分隔；同一个空的多种可接受写法用 | 分隔。例：1024 | 1024B || 1024",
    "简答题写「参考答案：」，系统不做自动判分，由教师在批改台打分。",
    "代码题写「语言：Python」，用「说明：」补充题意，用「测试点：」逐行列出评测用例。",
    "测试点格式：输入=… | 输出=… | 10分 | 公开。需要多行输入时用 \\n 表示换行；标记「公开」的用例学生可见。",
    "代码题会自动运行学生代码并逐点比对输出，超时或运行报错该点记 0 分。",
    "「解析：」为可选，用于成绩发布后的讲评。",
]
for r in rules:
    line(r, indent=0.35)

note("提示：导入后系统会先给出一份解析预览，任何一行格式不对都会标红，确认无误后再点「确认导入」。")

# ── 示例题目 ──────────────────────────────────────────────
heading("示例题目（共 6 题，合计 100 分）")

question("【单选】1. 下列存储器中，断电后所存数据会丢失的是（　　）（10分）")
line("A. ROM", indent=0.6)
line("B. RAM", indent=0.6)
line("C. 硬盘", indent=0.6)
line("D. U 盘", indent=0.6)
meta("答案：", "B")
meta("解析：", "RAM 属于易失性存储器，断电后数据丢失；ROM、硬盘、U 盘均为非易失性存储。")

question("【多选】2. 下列设备中，属于输入设备的有（　　）（15分）")
line("A. 键盘　　B. 显示器　　C. 鼠标　　D. 扫描仪", indent=0.6)
meta("答案：", "A,C,D")
meta("解析：", "显示器属于输出设备。")

question("【判断】3. 一个算法必须在执行有穷步骤之后结束。（5分）")
meta("答案：", "对")

question("【填空】4. 计算机中 1KB = ______ 字节，1MB = ______ KB。（10分）")
meta("答案：", "1024 | 1024B || 1024", mono=True)
meta("解析：", "1KB = 1024B，1MB = 1024KB。第一个空填写 1024 或 1024B 均判对。")

question("【简答】5. 简述什么是死循环，并说明它会带来什么后果。（20分）")
meta("参考答案：", "死循环是指程序在满足退出条件之前反复执行同一段代码、无法自行结束的状态。")

question("【代码】6. 求 1 到 n 的累加和。（40分）")
meta("语言：", "Python")
meta("说明：", "读入一个正整数 n，输出 1 + 2 + … + n 的结果。")
meta("样例输入：", "10", mono=True)
meta("样例输出：", "55", mono=True)
line("测试点：", indent=0.4)
for case in [
    "输入=7 | 输出=28 | 10分 | 公开",
    "输入=1 | 输出=1 | 10分",
    "输入=100000 | 输出=5000050000 | 20分",
]:
    line(case, indent=0.8, mono=True)

# ── 页脚说明 ──────────────────────────────────────────────
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(24)
bottom_border(p, "E6E8F0")
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("智卷 · 信息科技在线测评系统　|　本模板可直接修改后重复使用"), "宋体", 9, False, MUTED)

doc.core_properties.title = "信息科技基础测评 · 示例试卷（题目录入模板）"
doc.core_properties.author = "智卷"
doc.core_properties.subject = "Word 题目录入模板"

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
print(f"saved: {OUT}")

# ── 简单自检 ──────────────────────────────────────────────
check = Document(OUT)
texts = [p.text for p in check.paragraphs if p.text.strip()]
assert any("【单选】" in t for t in texts), "缺少单选题"
assert any("【代码】" in t for t in texts), "缺少代码题"
assert any(t.startswith("输入=10") for t in texts), "缺少测试点"
print(f"paragraphs: {len(texts)}")
