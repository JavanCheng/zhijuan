# 端到端冒烟测试：教师建卷 → 导入示例 Word → 发布 → 学生作答 → 自动评分 → 教师校准 → 发布成绩
# 用法：powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8787'
$jsonType = 'application/json; charset=utf-8'

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

function ToBytes($obj) {
  $json = $obj | ConvertTo-Json -Depth 30 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return ,$bytes
}

function Api($method, $path, $body, $session) {
  $params = @{
    Uri         = "$base$path"
    Method      = $method
    ContentType = $jsonType
    WebSession  = $session
  }
  if ($null -ne $body) { $params.Body = ToBytes $body }
  return Invoke-RestMethod @params
}

Step '0. 健康检查'
$health = Invoke-RestMethod -Uri "$base/api/health" -Method Get
Write-Host "   服务正常；Python 运行时：$($health.runtime.python)"
if (-not $health.runtime.python) { throw '代码运行时未就绪' }

Step '1. 教师登录'
$login = Invoke-RestMethod -Uri "$base/api/auth/teacher/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ username = 'teacher'; password = '123456' }) -SessionVariable tea
Write-Host "   登录成功：$($login.user.name)"

Step '2. 新建考试'
$exam = Api 'Post' '/api/teacher/exams' @{ title = '高一信息科技 · 单元测试（自动生成）'; description = '冒烟测试用卷'; durationMin = 45 } $tea
Write-Host "   examId = $($exam.id)"

Step '3. 导入示例 Word（templates/题目模板.docx）'
$imp = Api 'Post' "/api/teacher/exams/$($exam.id)/import" @{ sample = $true } $tea
Write-Host "   解析：$($imp.counts.total) 题 / $($imp.counts.totalScore) 分 / 错误 $($imp.counts.errors) / 警告 $($imp.counts.warnings)"
if ($imp.counts.errors -gt 0) { throw '模板解析出现错误，冒烟失败' }
$imp.questions | ForEach-Object { Write-Host "   #$($_.seq) [$($_.type)] $($_.score)分" }

Step '4. 写入试卷并发布'
$detail = Api 'Put' "/api/teacher/exams/$($exam.id)/questions" @{ questions = @($imp.questions) } $tea
Write-Host "   已保存 $($detail.questions.Count) 题，总分 $($detail.totalScore)"
Api 'Post' "/api/teacher/exams/$($exam.id)/publish" @{} $tea | Out-Null
Write-Host '   考试已发布'

Step '5. 学生登录并获取试卷'
$stu = Invoke-RestMethod -Uri "$base/api/auth/student/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ name = '李子涵'; studentNo = '20250301' }) -SessionVariable stuSession
Write-Host "   学生：$($stu.user.name) ($($stu.user.studentNo))"
$page = Api 'Get' "/api/student/exams/$($exam.id)" $null $stuSession
$leaked = $page.questions[0].PSObject.Properties.Name -contains 'answer'
if ($leaked) { throw '学生端泄露了答案字段！' }
Write-Host "   下发 $($page.questions.Count) 题；已确认不含答案字段；截止 $($page.submission.deadlineAt)"

Step '6. 作答并提交（全部正确 + 一段正确代码）'
$answers = @{}
foreach ($q in $page.questions) {
  switch ($q.type) {
    'single' { $answers["$($q.id)"] = @{ key = 'B' } }
    'multiple' { $answers["$($q.id)"] = @{ keys = @('A', 'C', 'D') } }
    'truefalse' { $answers["$($q.id)"] = @{ value = $true } }
    'fill' { $answers["$($q.id)"] = @{ blanks = @('1024', '1024') } }
    'short' { $answers["$($q.id)"] = @{ text = '死循环指程序无法自行结束、反复执行同一段代码；会造成程序卡死、占用 CPU 资源。' } }
    'code' { $answers["$($q.id)"] = @{ language = 'python'; code = "n = int(input())`nprint(n * (n + 1) // 2)" } }
  }
}
Api 'Put' "/api/student/submissions/$($page.submission.id)/draft" @{ answers = $answers } $stuSession | Out-Null
$submit = Api 'Post' "/api/student/submissions/$($page.submission.id)/submit" @{} $stuSession
Write-Host "   提交状态：$($submit.status)"

Step '7. 等待自动评分'
$res = $null
$i = 0
for ($i = 0; $i -lt 40; $i++) {
  $res = Api 'Get' "/api/student/submissions/$($page.submission.id)" $null $stuSession
  if ($res.submission.status -eq 'graded') { break }
  Start-Sleep -Milliseconds 500
}
Write-Host "   最终状态：$($res.submission.status)（轮询 $i 次）"
if ($res.submission.status -ne 'graded') { throw '自动评分超时' }

Step '8. 教师查看自动评分结果'
$sub = Api 'Get' "/api/teacher/submissions/$($page.submission.id)" $null $tea
Write-Host "   自动分合计：$($sub.totalAutoScore) / $($sub.examTotalScore)"
foreach ($a in $sub.answers) {
  $q = $sub.questions | Where-Object { $_.id -eq $a.questionId }
  Write-Host ("   第{0}题 [{1}] 自动 {2}/{3}  {4}" -f $q.seq, $q.type, $a.autoScore, $q.score, $a.autoDetail.note)
  if ($q.type -eq 'code') {
    $a.autoDetail.items | ForEach-Object { Write-Host "       $($_.label) ok=$($_.ok) $($_.note)" }
  }
}

Step '9. 教师人工校准简答题（20 分题给 18 分）'
$shortQ = $sub.questions | Where-Object { $_.type -eq 'short' }
$shortA = $sub.answers | Where-Object { $_.questionId -eq $shortQ.id }
$graded = Api 'Patch' "/api/teacher/answers/$($shortA.id)" @{ finalScore = 18; comment = '要点齐全，表述可再精简' } $tea
Write-Host "   校准后本卷最终分：$($graded.submissionFinalScore)"

Step '10. 确认自动分并发布成绩'
Api 'Post' "/api/teacher/exams/$($exam.id)/confirm-auto" @{} $tea | Out-Null
Api 'Post' "/api/teacher/exams/$($exam.id)/publish-results" @{ published = $true } $tea | Out-Null

Step '11. 学生查看成绩'
$result = Api 'Get' "/api/student/submissions/$($page.submission.id)" $null $stuSession
Write-Host "   学生得分：$($result.score) / $($result.totalScore)（发布状态：$($result.resultsPublished)）"
$result.questions | ForEach-Object { Write-Host ("   #{0} [{1}] {2}/{3}" -f $_.seq, $_.type, $_.finalScore, $_.score) }

Step '12. 第二个学生故意答错，验证判错与证据链'
$stu2 = Invoke-RestMethod -Uri "$base/api/auth/student/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ name = '王梓萱'; studentNo = '20250302' }) -SessionVariable stu2Session
$page2 = Api 'Get' "/api/student/exams/$($exam.id)" $null $stu2Session
$wrong = @{}
foreach ($q in $page2.questions) {
  switch ($q.type) {
    'single' { $wrong["$($q.id)"] = @{ key = 'A' } }
    'multiple' { $wrong["$($q.id)"] = @{ keys = @('B') } }
    'truefalse' { $wrong["$($q.id)"] = @{ value = $false } }
    'fill' { $wrong["$($q.id)"] = @{ blanks = @('2048', '1024') } }
    'short' { $wrong["$($q.id)"] = @{ text = '不清楚。' } }
    'code' { $wrong["$($q.id)"] = @{ language = 'python'; code = "print(0)" } }
  }
}
Api 'Put' "/api/student/submissions/$($page2.submission.id)/draft" @{ answers = $wrong } $stu2Session | Out-Null
Api 'Post' "/api/student/submissions/$($page2.submission.id)/submit" @{} $stu2Session | Out-Null
$i = 0
for ($i = 0; $i -lt 40; $i++) {
  $r2 = Api 'Get' "/api/student/submissions/$($page2.submission.id)" $null $stu2Session
  if ($r2.submission.status -eq 'graded') { break }
  Start-Sleep -Milliseconds 500
}
$sub2 = Api 'Get' "/api/teacher/submissions/$($page2.submission.id)" $null $tea
Write-Host "   自动分合计：$($sub2.totalAutoScore) / $($sub2.examTotalScore)（预期 5 分：仅第二空答对）"
$codeQ = $sub2.questions | Where-Object { $_.type -eq 'code' }
$codeA = $sub2.answers | Where-Object { $_.questionId -eq $codeQ.id }
$failed = @($codeA.autoDetail.items | Where-Object { -not $_.ok }).Count
Write-Host "   代码题：$failed / $($codeA.autoDetail.items.Count) 个测试点判错"
if ($sub2.totalAutoScore -ne 5) { throw "错误答卷自动分异常：$($sub2.totalAutoScore)" }
if ($failed -ne $codeA.autoDetail.items.Count) { throw '代码题错误未被识别' }

Step '13. 学情看板：班级维度、筛选与学生画像'
$meta = Api 'Get' '/api/teacher/analytics/meta' $null $tea
if (@($meta.classes).Count -lt 1) { throw '班级数据缺失' }
if (@($meta.students).Count -lt 2) { throw '学生数据缺失' }
Write-Host "   班级 $($meta.classes.Count) 个 / 学生 $($meta.students.Count) 人"
$an = Api 'Get' "/api/teacher/analytics?examId=$($exam.id)" $null $tea
if ($an.kpi.participants -ne 2) { throw "学情看板参评人数异常：$($an.kpi.participants)" }
if (@($an.questions).Count -ne $page.questions.Count) { throw '学情看板题目数量异常' }
$classId = $meta.students | Where-Object { $_.id -eq $stu.user.id } | Select-Object -ExpandProperty classId
$anClass = Api 'Get' "/api/teacher/analytics?examId=$($exam.id)&classIds=$classId" $null $tea
if ($anClass.kpi.participants -ne 2) { throw "班级筛选后参评人数异常：$($anClass.kpi.participants)" }
$profile = Api 'Get' "/api/teacher/students/$($stu.user.id)/profile" $null $tea
if (@($profile.exams).Count -lt 1) { throw '学生画像缺少考试记录' }
Write-Host "   学情看板参评 $($an.kpi.participants) 人，平均分 $($an.kpi.avg)，班级筛选正常，学生画像 $($profile.exams.Count) 场"

Write-Host "`n冒烟测试通过：examId=$($exam.id) submissionId=$($page.submission.id) 错误卷 submissionId=$($page2.submission.id)" -ForegroundColor Green
