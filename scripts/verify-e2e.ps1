# 端到端验证脚本：覆盖注册/登录/上传/任务/鉴权/用户隔离/登出
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8000"
$pass = 0; $fail = 0
# 每次运行用随机邮箱，保证脚本可重复执行（不依赖数据库初始状态）
$rid = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$aliceEmail = "alice_$rid@example.com"
$bobEmail = "bob_$rid@example.com"
function Check($name, $cond) {
    if ($cond) { Write-Host "[PASS] $name" -ForegroundColor Green; $script:pass++ }
    else       { Write-Host "[FAIL] $name" -ForegroundColor Red;   $script:fail++ }
}

# 1) health
$h = Invoke-RestMethod "$base/health"
Check "health 返回 ok" ($h.ok -eq $true)

# 2) 注册用户 A（带 session A 的 cookie）
$ra = Invoke-RestMethod "$base/v1/auth/register" -Method Post -ContentType "application/json" `
    -Body (@{ email = $aliceEmail; password = "alice12345"; displayName = "Alice" } | ConvertTo-Json) `
    -SessionVariable sessA
Check "注册用户A 返回邮箱" ($ra.email -eq $aliceEmail)
Check "注册用户A 角色为 user" ($ra.role -eq "user")

# 3) /me 用 session A 拿到当前用户
$meA = Invoke-RestMethod "$base/v1/auth/me" -WebSession $sessA
Check "用户A /me 身份正确" ($meA.email -eq $aliceEmail)

# 4) 上传图片（带鉴权）—— PowerShell 5.1 没有 -Form，手动构造 multipart/form-data
$png = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
$boundary = [Guid]::NewGuid().ToString()
$LF = "`r`n"
$fileEnc = [Text.Encoding]::GetEncoding("iso-8859-1").GetString($png)
$body = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"verify_1x1.png`"",
    "Content-Type: image/png", "",
    $fileEnc,
    "--$boundary--", ""
) -join $LF
$up = Invoke-RestMethod "$base/v1/assets/upload" -Method Post -WebSession $sessA `
    -ContentType "multipart/form-data; boundary=$boundary" -Body $body
Check "上传返回 assetId" ([bool]$up.assetId)
Check "上传返回 url" ($up.url -like "/static/*")

# 5) 创建任务（avatar_generate，mock 模式无需真实 Key）
$jobBody = @{ jobType = "avatar_generate"; inputs = @{ imageUrl = $up.url } } | ConvertTo-Json
$job = Invoke-RestMethod "$base/v1/jobs" -Method Post -ContentType "application/json" -Body $jobBody -WebSession $sessA
Check "创建任务返回 jobId" ([bool]$job.jobId)
$jobId = $job.jobId

# 6) 轮询任务直到进入终态（测的是任务生命周期：create->run->done/failed，
#    与是否配置真实 Gemini key 无关——配了 key 这里会真实生成，窗口放宽到 ~2 分钟）
$final = $null
for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Milliseconds 500
    $j = Invoke-RestMethod "$base/v1/jobs/$jobId" -WebSession $sessA
    if ($j.status -eq "succeeded" -or $j.status -eq "failed") { $final = $j; break }
}
Check "任务进入终态(生命周期跑通)" ($final -and ($final.status -eq "succeeded" -or $final.status -eq "failed"))

# 7) 未登录访问该任务 -> 401
$code = 0
try { Invoke-WebRequest "$base/v1/jobs/$jobId" -UseBasicParsing | Out-Null }
catch { $code = [int]$_.Exception.Response.StatusCode }
Check "未登录访问任务被拒(401)" ($code -eq 401)

# 8) 用户隔离：用户 B 看不到用户 A 的任务 -> 404
Invoke-RestMethod "$base/v1/auth/register" -Method Post -ContentType "application/json" `
    -Body (@{ email = $bobEmail; password = "bob123456"; displayName = "Bob" } | ConvertTo-Json) -SessionVariable sessB | Out-Null
$codeB = 0
try { Invoke-WebRequest "$base/v1/jobs/$jobId" -WebSession $sessB -UseBasicParsing | Out-Null }
catch { $codeB = [int]$_.Exception.Response.StatusCode }
Check "用户B 看不到用户A 的任务(404)" ($codeB -eq 404)

# 8.5) Phase 3 幂等：相同 idempotencyKey 重复提交返回同一任务，不同则新建
$idk = [Guid]::NewGuid().ToString()
$ja = Invoke-RestMethod "$base/v1/jobs" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ jobType = "avatar_generate"; inputs = @{ imageUrl = $up.url }; idempotencyKey = $idk } | ConvertTo-Json)
$jb = Invoke-RestMethod "$base/v1/jobs" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ jobType = "avatar_generate"; inputs = @{ imageUrl = $up.url }; idempotencyKey = $idk } | ConvertTo-Json)
Check "相同幂等键返回同一任务" ($ja.jobId -eq $jb.jobId)
$jc = Invoke-RestMethod "$base/v1/jobs" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ jobType = "avatar_generate"; inputs = @{ imageUrl = $up.url }; idempotencyKey = [Guid]::NewGuid().ToString() } | ConvertTo-Json)
Check "不同幂等键创建新任务" ($jc.jobId -ne $ja.jobId)

# 9) 管理员登录 + 角色校验 + debug 仅管理员可见
$adm = Invoke-RestMethod "$base/v1/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"email":"admin@ailurus.com","password":"admin12345"}' -SessionVariable sessAdm
Check "管理员登录成功且角色为 admin" ($adm.role -eq "admin")
$logs = Invoke-RestMethod "$base/v1/debug/generation-logs?limit=5" -WebSession $sessAdm
Check "管理员可读取 debug 日志" ($null -ne $logs.logs)
$codeUserDebug = 0
try { Invoke-WebRequest "$base/v1/debug/generation-logs?limit=5" -WebSession $sessA -UseBasicParsing | Out-Null }
catch { $codeUserDebug = [int]$_.Exception.Response.StatusCode }
Check "普通用户访问 debug 被拒(403)" ($codeUserDebug -eq 403)

# 9.5) Phase 2 资产持久化（用 alice 的 sessA）
$av = Invoke-RestMethod "$base/v1/avatars" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ imageUrl = "/static/a.png"; name = "回归测试数字人"; paramsJson = @{ heightCm = 170 } } | ConvertTo-Json)
Check "创建数字人(首个自动默认)" ($av.id -and $av.isDefault -eq $true)
$ci = Invoke-RestMethod "$base/v1/closet-items" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ garmentType = "top"; extractedImageUrl = "/static/g.png" } | ConvertTo-Json)
Check "创建衣橱单品" ([bool]$ci.id)
# 姿态 upsert 两次同 key，应覆盖不新增
Invoke-RestMethod "$base/v1/avatars/$($av.id)/poses/neutral_stand" -Method Put -ContentType "application/json" -WebSession $sessA -Body (@{ poseKey = "neutral_stand"; imageUrl = "/static/p1.png" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod "$base/v1/avatars/$($av.id)/poses/neutral_stand" -Method Put -ContentType "application/json" -WebSession $sessA -Body (@{ poseKey = "neutral_stand"; imageUrl = "/static/p2.png" } | ConvertTo-Json) | Out-Null
$poses = Invoke-RestMethod "$base/v1/avatars/$($av.id)/poses" -WebSession $sessA
Check "姿态 upsert 覆盖(数量为1)" ($poses.Count -eq 1 -and $poses[0].imageUrl -eq "/static/p2.png")
$tr = Invoke-RestMethod "$base/v1/tryon-results" -Method Post -ContentType "application/json" -WebSession $sessA `
    -Body (@{ avatarId = $av.id; imageUrl = "/static/t.png"; closetItemId = $ci.id; poseKey = "neutral_stand" } | ConvertTo-Json)
Check "创建试穿结果" ([bool]$tr.id)
# 「刷新/换设备」模拟：alice 重新登录(新 session) 仍能看到资产 => 真持久化
$alice2 = Invoke-RestMethod "$base/v1/auth/login" -Method Post -ContentType "application/json" `
    -Body (@{ email = $aliceEmail; password = "alice12345" } | ConvertTo-Json) -SessionVariable sessA2
$av2 = Invoke-RestMethod "$base/v1/avatars" -WebSession $sessA2
Check "重新登录后数字人仍在(持久化)" (@($av2 | Where-Object { $_.id -eq $av.id }).Count -eq 1)
# 用户隔离：bob(sessB) 看不到 alice 的数字人，且操作其默认会 404
$bobAvatars = Invoke-RestMethod "$base/v1/avatars" -WebSession $sessB
Check "用户B 看不到用户A 的数字人" ((($bobAvatars | Where-Object { $_.id -eq $av.id }) | Measure-Object).Count -eq 0)
$codeAv = 0
try { Invoke-WebRequest "$base/v1/avatars/$($av.id)/default" -Method Post -WebSession $sessB -UseBasicParsing | Out-Null }
catch { $codeAv = [int]$_.Exception.Response.StatusCode }
Check "用户B 操作用户A 的数字人(404)" ($codeAv -eq 404)

# 10) 登出后 /me -> 401
Invoke-RestMethod "$base/v1/auth/logout" -Method Post -WebSession $sessA | Out-Null
$codeLogout = 0
try { Invoke-WebRequest "$base/v1/auth/me" -WebSession $sessA -UseBasicParsing | Out-Null }
catch { $codeLogout = [int]$_.Exception.Response.StatusCode }
Check "登出后 /me 失效(401)" ($codeLogout -eq 401)

Write-Host "`n========== 结果: $pass 通过 / $fail 失败 ==========" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
