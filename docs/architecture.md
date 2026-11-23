# 架构设计

## 1. 目标与约束

- **单机可用**：一台机器、一个进程、一个 SQLite 文件即可完成全部教学流程。
- **零外部依赖**：不需要数据库服务、Redis、Docker、CDN、外网。
- **答错不冤枉、改分可追溯**：自动评分给出证据（每空命中、每个测试点输入/输出/耗时），人工改分写审计。
- **两端同源**：题型定义、答案校验、判分规则只维护一份。

非目标（当前版本）：多租户、公网高并发、容器级代码沙箱、题库组卷。

---

## 2. 总体架构

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  学生端 /student/*                教师端 /teacher/*             │
│  React 19 + antd v6 + Tailwind CSS v4                          │
└───────────────┬────────────────────────────────────────────────┘
                │ fetch /api/*（同源，Cookie 会话）
┌───────────────▼────────────────────────────────────────────────┐
│ Fastify 5（server/index.ts）                                    │
│  ├─ 静态托管 dist/ + SPA 兜底（非 /api 全部回 index.html）        │
│  ├─ routes/auth     登录、退出、me、runtime                      │
│  ├─ routes/teacher  考试、导入、题目、批改、发布                  │
│  └─ routes/student  取卷、草稿、提交、成绩                        │
└───────┬───────────────────────┬────────────────────────────────┘
        │                       │
┌───────▼────────┐      ┌───────▼────────────────────────────────┐
│ node:sqlite    │      │ grading worker（同进程，400ms 轮询）    │
│ data/app.db    │      │  ├─ shared/grading.ts（纯函数，客观题） │
│ WAL 模式       │      │  └─ runner/run.ts（子进程跑代码）       │
└────────────────┘      └────────────────────────────────────────┘
```

设计取舍：

| 选择 | 原因 |
| --- | --- |
| Fastify 而非 Next.js | 前后端职责清晰，SSR 对本场景无收益 |
| SQLite（`node:sqlite`）而非 Postgres | 单机形态零运维；SQL 兼容，量大可平滑迁 PG |
| DB 表当队列而非 Redis | 少一个常驻服务；单机几十人规模完全够用 |
| 评分 worker 独立进程而非请求内同步 | 代码题可能跑数秒，不阻塞提交请求 |
| 自托管 Python 运行时 | 内网无外网也能评测；可用 `PYTHON_BIN` 覆盖 |

---

## 3. 关键流程

### 3.1 出卷

```text
教师上传 .docx
  → POST /teacher/exams/:id/import（multipart）
  → mammoth 转 HTML → 块级状态机 → ParsedQuestion[]
  → 前端预览（错误阻断、警告提示）
  → PUT /teacher/exams/:id/questions（整卷替换）
  → POST /teacher/exams/:id/publish
```

解析阶段不写库，避免半成品污染试卷；写入时要求该卷还没有学生提交。

### 3.2 作答与评分

```text
学生 GET /student/exams/:id
  → 无记录则创建 submission(in_progress)，返回裁剪后的题目（无答案、无隐藏用例）
  → 前端自动保存 PUT /student/submissions/:id/draft
  → 提交 POST .../submit
       → 补齐未作答题目的空记录
       → submission.status = grading
       → grading_tasks 插入 pending
  → worker 轮询取任务 → 逐题判分 → 写 answers.auto_*
       → submission.status = graded
  → 学生端轮询 /student/submissions/:id 直到 graded
```

### 3.3 校准与发布

```text
教师 GET /teacher/exams/:id/submissions（3 秒刷新）
  → 打开单份答卷：题目 + 学生答案 + 自动评分证据
  → PATCH /teacher/answers/:id { finalScore, comment }
       → 更新 answers.final_score
       → 重算 submission.final_score = Σ COALESCE(final, auto)
       → 写 audit_logs
  → POST /teacher/exams/:id/confirm-auto（未人工改分的题按自动分确认）
  → POST /teacher/exams/:id/publish-results
```

---

## 4. 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `users` | username, password_hash, name, role, student_no | 师生同表，role 区分 |
| `exams` | title, teacher_id, status, duration_min, start_at, end_at, results_published | 状态机 draft→published→closed |
| `questions` | exam_id, seq, type, stem_html, score, options_json, answer_json, explanation_html, code_spec_json | 答案与代码配置存 JSON |
| `test_cases` | question_id, seq, stdin, expected_stdout, score, visible | visible=1 学生可见 |
| `submissions` | exam_id, student_id, status, auto_score, final_score, started_at, submitted_at | `UNIQUE(exam_id, student_id)` |
| `answers` | submission_id, question_id, raw_json, auto_score, auto_detail_json, final_score, comment | `UNIQUE(submission_id, question_id)` |
| `grading_tasks` | submission_id, status, attempts, last_error | pending/running/done/failed |
| `audit_logs` | actor_id, entity, entity_id, action, before_json, after_json, reason | 改分留痕 |

约定：

- 时间统一存 ISO 字符串（UTC），前端按本地时区展示。
- `answers.raw_json` 按题型存不同结构（`{key}` / `{keys}` / `{value}` / `{blanks}` / `{text}` / `{language,code}`）。
- `auto_detail_json` 保存可解释证据，教师端直接渲染。
- 题目/测试点删除依赖外键 `ON DELETE CASCADE`，并发一致性靠单进程串行写。

---

## 5. 判分设计

### 5.1 分层

```text
shared/grading.ts       纯函数：归一化、客观题判分、未作答判断
server/grading/worker.ts 编排：取任务、代码执行、落库、汇总
server/runner/run.ts     执行器：进程、超时、输出截断、清理
```

客观题判分不依赖数据库与网络，可被前端预览或其他服务复用。

### 5.2 新增一种题型

1. `shared/types.ts`：`QuestionType` 加枚举 + `AnswerSpec` 加分支。
2. `shared/grading.ts`：加 `gradeObjective` 分支（若可自动判分）。
3. `server/import/docx.ts`：加别名与答案解析、校验。
4. 前端：`AnswerInput` 加渲染、`formatStudentAnswer` / `formatAnswerSpec` 加展示。
5. 题库列表的 `TYPE_LABEL` / `TYPE_TONE` 补一条。

### 5.3 代码题

- 每个测试点单独一次执行（隔离彻底、互不影响），超时后 `taskkill /T` 结束进程树。
- 未作答直接 0 分，不启动进程。
- 运行时缺失时写入 `runtimeError`，题目记 0 分且界面明确提示，不静默失败。
- 输出比对：`\r\n`→`\n`、去行尾空白、去末尾空行、`trim`。

---

## 6. 前端结构

- 路由按角色分区，`RequireRole` 负责未登录跳转与越权重定向。
- 数据获取用 `fetch` 封装（`src/api.ts`），页面自行管理状态，未引入额外状态库。
- 教师端：列表 → 试卷（导入/分值）→ 批改列表 → 单份批改，四层线性导航。
- 学生端：列表 → 作答（单题 + 答题卡 + 倒计时 + 自动保存）→ 成绩（轮询至发布）。
- 组件全部来自 **antd v6**（Layout / Menu / Table / Form / Upload / Modal / Statistic / Result 等），通过 `ConfigProvider` 统一主题色、圆角与字体；`src/theme.ts` 是唯一的主题入口。
- 布局与间距使用 **Tailwind CSS v4** 工具类（未引入 preflight，避免覆盖 antd 基础样式；在 `src/styles.css` 中补了边框与盒模型重置）。
- 少量无法用组件表达的样式（题干 HTML 排版、代码编辑器、深色工具栏、登录渐变主视觉）保留在 `src/styles.css`。
- 所有资源随构建产物打包，运行时不依赖 CDN 或外网。

---

## 7. 一致性与安全

| 风险 | 处理 |
| --- | --- |
| 学生偷看答案 | 服务端 DTO 裁剪，`answer`/`explain`/隐藏用例永不下发；提交前接口无答案字段 |
| 改分无凭据 | 每次改分写 `audit_logs`（操作者、原值、新值、理由） |
| 超时后仍提交 | 提交校验 `end_at`（留 60 秒容差） |
| 重复提交 | 提交接口幂等：非 `in_progress` 直接返回已提交状态 |
| 草稿丢失 | 前端 900ms 防抖自动保存 + 离开页面二次确认 |
| 重新导入覆盖成绩 | 已存在提交时拒绝重新导入 / 删题 |
| 弱口令 | scrypt 加盐哈希；演示账号统一 `123456`，上线前应强制改密 |
| 代码滥用资源 | 超时、输出上限、临时目录、`-I` 隔离；**无容器隔离**，仅限可信内网 |
| 会话 | HMAC 签名 Cookie（httpOnly, sameSite=lax, 7 天） |

---

## 8. 扩展点

| 方向 | 落点 |
| --- | --- |
| Docker 沙箱 | 实现 `CodeRunner` 接口，替换 `server/runner/run.ts` 的调用处 |
| C++ / Java | runner 增加编译步骤与镜像；`CodeSpec.languages` 已支持多语言 |
| AI 辅助评分 | worker 中对 `short` 题产出 `suggestedScore`，教师确认后才写 `final_score` |
| 题库 / 组卷 | 抽出 `questions` 的 `exam_id` 为可空，增加 `bank` 与 `exam_questions` 关联表 |
| Excel 导出 | 新增 `GET /teacher/exams/:id/export`，用 xlsx 生成成绩单 |
| 多班级 | `users.class_id` + `exams.class_id`，列表按班过滤 |

---

## 9. 性能备忘

- 单班 40 人 × 3 个代码测试点 ≈ 120 次进程启动，每次约 25ms（Python 求和用例），总耗时约 3–5 秒，可接受。
- 评测串行是刻意选择：避免同时启动大量子进程拖垮教师机；如需加速可把 worker 并发提升到 2–4，但会放大资源峰值。
- SQLite 开启 WAL，读写并发足够单机课堂使用；所有写操作都是短事务。
