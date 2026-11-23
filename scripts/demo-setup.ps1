# 生成一场示例考试（需服务已启动）：导入 templates/题目模板.docx 并发布
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8787'
$jsonType = 'application/json; charset=utf-8'

function ToBytes($obj) {
  $json = $obj | ConvertTo-Json -Depth 30 -Compress
  return ,[System.Text.Encoding]::UTF8.GetBytes($json)
}

function Api($method, $path, $body, $session) {
  $params = @{ Uri = "$base$path"; Method = $method; ContentType = $jsonType; WebSession = $session }
  if ($null -ne $body) { $params.Body = ToBytes $body }
  return Invoke-RestMethod @params
}

$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ username = 'teacher'; password = '123456' }) -SessionVariable tea
Write-Host "教师登录：$($login.user.name)"

$existing = Api 'Get' '/api/teacher/exams' $null $tea
if (@($existing).Count -gt 0) {
  Write-Host "已存在 $(@($existing).Count) 场考试，跳过初始化。" -ForegroundColor Yellow
  exit 0
}

$exam = Api 'Post' '/api/teacher/exams' @{
  title       = '信息科技基础测评（示例卷）'
  description = '第一单元：数据与存储 · 算法基础'
  durationMin = 45
} $tea

$imp = Api 'Post' "/api/teacher/exams/$($exam.id)/import" @{ sample = $true } $tea
if ($imp.counts.errors -gt 0) { throw "示例模板解析出现 $($imp.counts.errors) 个错误" }

Api 'Put' "/api/teacher/exams/$($exam.id)/questions" @{ questions = @($imp.questions) } $tea | Out-Null
Api 'Post' "/api/teacher/exams/$($exam.id)/publish" @{} $tea | Out-Null

Write-Host "示例考试已创建并发布：examId=$($exam.id)，$($imp.counts.total) 题 / $($imp.counts.totalScore) 分" -ForegroundColor Green
