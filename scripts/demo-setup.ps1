# 生成一场示例考试（需服务已启动）：管理员准备演示教师 → 导入模板 → 发布
$ErrorActionPreference = 'Stop'
$base = if ($env:ZHIJUAN_BASE) { $env:ZHIJUAN_BASE.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$jsonType = 'application/json; charset=utf-8'
$demoPhone = '13800000000'

function ToBytes($obj) {
  $json = $obj | ConvertTo-Json -Depth 30 -Compress
  return ,[System.Text.Encoding]::UTF8.GetBytes($json)
}

function Api($method, $path, $body, $session) {
  $params = @{ Uri = "$base$path"; Method = $method; ContentType = $jsonType; WebSession = $session }
  if ($null -ne $body) { $params.Body = ToBytes $body }
  return Invoke-RestMethod @params
}

$adminLogin = Invoke-RestMethod -Uri "$base/api/auth/admin/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ username = 'admin'; password = 'yby19980523' }) -SessionVariable adminS
Write-Host "管理员登录：$($adminLogin.user.name)"

$overview = Api 'Get' '/api/admin/overview' $null $adminS
$demo = @($overview.teachers | Where-Object { $_.phone -eq $demoPhone }) | Select-Object -First 1
if (-not $demo) {
  $demo = Api 'Post' '/api/admin/teachers' @{ name = '演示教师'; phone = $demoPhone } $adminS
  Write-Host "已创建演示教师：$demoPhone / $demoPhone"
} else {
  if (-not $demo.isActive) { Api 'Patch' "/api/admin/teachers/$($demo.id)" @{ isActive = $true } $adminS | Out-Null }
  Api 'Post' "/api/admin/teachers/$($demo.id)/reset-password" @{} $adminS | Out-Null
  Write-Host "演示教师已存在：$demoPhone / $demoPhone"
}

$login = Invoke-RestMethod -Uri "$base/api/auth/teacher/login" -Method Post -ContentType $jsonType -Body (ToBytes @{ username = $demoPhone; password = $demoPhone }) -SessionVariable tea
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
Api 'Post' "/api/teacher/exams/$($exam.id)/publish" @{ audience = @{ type = 'school' } } $tea | Out-Null

Write-Host "示例考试已创建并发布：examId=$($exam.id)，$($imp.counts.total) 题 / $($imp.counts.totalScore) 分" -ForegroundColor Green
