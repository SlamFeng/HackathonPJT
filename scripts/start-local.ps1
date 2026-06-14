# =============================================================
#  AI 智能试衣间 —— 本地一键启动脚本（零配置 SQLite 模式）
#  给非技术成员：双击根目录的 start.bat 即可，不用看这个文件。
#
#  它会做这些事：
#   1. 检查 Python / Node 是否安装，缺了就自动装（winget）
#   2. 首次运行自动装好前后端依赖
#   3. 各开一个窗口启动后端(API) 和前端(Web)
#   4. 自动打开浏览器到登录页
#
#  数据库用本地 SQLite 文件（api/local.db），不需要 Docker、不需要 Postgres。
#  停止：把弹出的两个黑窗口关掉即可。
# =============================================================

$ErrorActionPreference = "Stop"

# 仓库根目录 = 本脚本所在 scripts/ 的上一级
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "api"
$WebDir = Join-Path $RepoRoot "web"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }

# winget 装完东西后，当前会话的 PATH 不会自动刷新，这里手动合并机器级和用户级 PATH
function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machine;$user"
}

function Ensure-Tool($cmdName, $wingetId, $friendlyName) {
    Refresh-Path
    if (Get-Command $cmdName -ErrorAction SilentlyContinue) {
        Write-Ok "$friendlyName 已安装"
        return
    }
    Write-Warn "$friendlyName 未安装，正在自动安装（首次安装可能需要几分钟）…"
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "    无法自动安装：系统没有 winget。请手动安装 $friendlyName 后重试。" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    winget install --id $wingetId --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Get-Command $cmdName -ErrorAction SilentlyContinue)) {
        Write-Host "    $friendlyName 安装后仍找不到命令，可能需要重启电脑后再双击 start.bat。" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Ok "$friendlyName 安装完成"
}

try {
    Write-Host "================================================" -ForegroundColor Magenta
    Write-Host "   AI 智能试衣间 - 本地启动 (SQLite 零配置)" -ForegroundColor Magenta
    Write-Host "================================================" -ForegroundColor Magenta

    Write-Step "检查运行环境"
    Ensure-Tool "python" "Python.Python.3.12" "Python"
    Ensure-Tool "node"   "OpenJS.NodeJS.LTS"  "Node.js"

    # ---------- 后端：venv + 依赖 ----------
    Write-Step "准备后端（API）"
    $venvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "    首次运行：创建 Python 虚拟环境…"
        python -m venv (Join-Path $ApiDir ".venv")
    }
    Write-Host "    安装后端依赖…"
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install -r (Join-Path $ApiDir "requirements.txt") --quiet
    Write-Ok "后端依赖就绪"

    # ---------- 前端：npm 依赖 ----------
    Write-Step "准备前端（Web）"
    if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
        Write-Host "    首次运行：安装前端依赖（可能需要几分钟）…"
        Push-Location $WebDir
        npm install
        Pop-Location
    }
    Write-Ok "前端依赖就绪"

    # ---------- 启动后端窗口 ----------
    Write-Step "启动后端 API（端口 8000）"
    $apiInner = @(
        "Set-Location '$ApiDir'",
        "`$env:DATABASE_URL='sqlite+aiosqlite:///./local.db'",
        "`$env:ADMIN_EMAIL='admin@ailurus.com'",
        "`$env:ADMIN_PASSWORD='admin12345'",
        "`$env:CORS_ORIGINS='http://localhost:3000'",
        "Write-Host '后端 API 运行中：http://localhost:8000  (关闭此窗口即停止)' -ForegroundColor Green",
        ".\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000"
    ) -join "; "
    Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", $apiInner
    Write-Ok "后端启动中"

    # ---------- 启动前端窗口 ----------
    Write-Step "启动前端 Web（端口 3000）"
    $webInner = @(
        "Set-Location '$WebDir'",
        "`$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:8000'",
        "Write-Host '前端 Web 运行中：http://localhost:3000  (关闭此窗口即停止)' -ForegroundColor Green",
        "npm run dev"
    ) -join "; "
    Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", $webInner
    Write-Ok "前端启动中"

    # ---------- 等前端就绪后打开浏览器 ----------
    Write-Step "等待前端就绪后自动打开浏览器…"
    $opened = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $opened = $true; break }
        } catch { }
    }
    if ($opened) {
        Start-Process "http://localhost:3000/login"
        Write-Host "`n  全部启动完成！浏览器已打开登录页。" -ForegroundColor Green
        Write-Host "  默认管理员账号：admin@ailurus.com / admin12345" -ForegroundColor Green
        Write-Host "  也可以点页面上的“注册”自己建一个普通账号。" -ForegroundColor Green
    } else {
        Write-Warn "前端启动较慢，请稍后手动打开浏览器访问 http://localhost:3000/login"
    }

    Write-Host "`n  这个窗口可以关掉了；后端和前端在另外两个窗口里运行。" -ForegroundColor Gray
    Read-Host "按回车键关闭本窗口"
}
catch {
    Write-Host "`n启动失败：$($_.Exception.Message)" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
