# AI Dress Room（AI 智能试衣间）

前后端分离的本地可运行 MVP：

- `web/`：Next.js 前端（页面预览/交互）
- `api/`：FastAPI 后端（上传、任务系统、SSE、推理适配层）

## 目录结构

```text
HackathonPJT/
  api/          # FastAPI
  web/          # Next.js
  render.yaml
  vercel.json
```

## 快速开始（开发模式）

1. 启动后端（端口 8000）
2. 启动前端（端口 3000）
3. 浏览器访问页面并用 `/health` 做健康检查

## 环境准备要求

### 必备依赖（最低兼容版本）

- Git：2.40+
- Node.js：18.18+（建议 20 LTS）
- npm：9+（随 Node 安装，建议 10+）
- Python：3.10+（建议 3.11）
- pip：23+（建议升级到最新版）

### 官方安装渠道

- Git：https://git-scm.com/downloads
- Node.js（含 npm）：https://nodejs.org/
  - Windows 推荐使用官方 LTS 安装包或 nvm-windows：https://github.com/coreybutler/nvm-windows
- Python：https://www.python.org/downloads/

### 安装校验方法（复制执行）

```bash
git --version
node --version
npm --version
python --version
python -m pip --version
```

### 安装文件校验（可选但推荐）

- Windows（PowerShell）计算安装包 SHA256：

```powershell
Get-FileHash .\installer.exe -Algorithm SHA256
```

- macOS/Linux：

```bash
shasum -a 256 installer.pkg
# 或
sha256sum installer.tar.gz
```

将计算结果与官网提供的校验值比对一致后再安装。

## 代码拉取 / 克隆步骤

### 首次克隆（获取最新稳定分支）

1. 确认你有仓库访问权限（GitHub 组织权限 / SSH Key / PAT）
2. 克隆并进入目录：

```bash
git clone -b main https://github.com/<your-org>/<your-repo>.git
cd HackathonPJT
```

如你使用 SSH：

```bash
git clone -b main git@github.com:<your-org>/<your-repo>.git
cd HackathonPJT
```

### 已有代码同步更新（推荐 rebase）

```bash
cd HackathonPJT
git fetch --all --prune
git checkout main
git pull --rebase origin main
```

### 权限校验与分支注意事项

- 查看远程地址与权限是否正确：

```bash
git remote -v
```

- 列出远程分支并确认 `main` 存在：

```bash
git ls-remote --heads origin
```

- 分支切换前先提交或暂存本地改动，避免覆盖：

```bash
git status
git stash -u
```

## 依赖安装步骤

本项目包含两套依赖：前端（Node）与后端（Python）。建议分别在两个终端执行。

### 前端依赖（web/）

推荐使用 `npm ci`（基于 `package-lock.json` 可复现安装）：

```bash
cd web
npm ci
```

如你需要常规安装（会更新锁文件，不推荐用于 CI/复现）：

```bash
cd web
npm install
```

### 后端依赖（api/）

#### Windows（PowerShell）

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\python -m pip install -U pip
.\.venv\Scripts\pip install -r requirements.txt
```

#### macOS / Linux（bash/zsh）

```bash
cd api
python3 -m venv .venv
./.venv/bin/python -m pip install -U pip
./.venv/bin/pip install -r requirements.txt
```

### 国内镜像源配置方案（可选）

- npm（临时使用）：

```bash
npm --registry https://registry.npmmirror.com ci
```

- npm（全局写入配置）：

```bash
npm config set registry https://registry.npmmirror.com
```

- pip（临时使用）：

```bash
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
```

- pip（全局写入配置）：

```bash
python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

### 依赖冲突的预检查方法

- 前端：

```bash
cd web
npm ls --depth=0
```

- 后端：

```bash
cd api
python -m pip check
```

出现冲突时，优先删除缓存与锁定目录后重装：

- 前端：删除 `web/node_modules` 后执行 `npm ci`
- 后端：删除 `api/.venv` 后重新创建虚拟环境并安装依赖

## 配置文件配置步骤

### 后端环境变量（api/.env）

模板路径：`api/.env.example`

复制并编辑（Windows PowerShell）：

```powershell
cd api
Copy-Item .env.example .env
notepad .env
```

复制并编辑（macOS/Linux）：

```bash
cd api
cp .env.example .env
nano .env
```

必填项（对接真实推理服务时）：

- `NANOBANANA_API_KEY`：推理服务密钥
- `NANOBANANA_ENDPOINT`：推理服务 Endpoint（建议统一封装成单一入口）

敏感信息要求：

- 不要把 `.env`、`.env.local`、任何密钥写入代码或提交到 Git
- 推荐使用密码管理器/团队密钥管理（GitHub Actions Secrets、1Password、Vault 等）保存与分发

不同运行环境切换建议（通用规则）：

- 本地开发：使用 `api/.env`
- 测试/生产：通过部署平台注入环境变量（或使用独立文件如 `api/.env.production`，再在部署脚本中显式加载）

### 前端环境变量（web/.env.local）

前端默认请求 `http://localhost:8000`。如需显式配置：

```text
# web/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

创建文件（Windows PowerShell）：

```powershell
cd web
notepad .env.local
```

创建文件（macOS/Linux）：

```bash
cd web
nano .env.local
```

## 本地服务启动步骤

### 开发环境启动（推荐）

#### 1）启动后端 API（默认端口 8000）

Windows（PowerShell）：

```powershell
cd api
.\.venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

macOS/Linux：

```bash
cd api
./.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

启动成功日志标识（示例）：

```text
Uvicorn running on http://0.0.0.0:8000
Application startup complete.
```

#### 2）启动前端 Web（默认端口 3000）

```bash
cd web
npm run dev
```

启动成功日志标识（示例）：

```text
Local: http://localhost:3000
Ready in ...
```

端口映射规则（开发模式默认）：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:8000`
- 前端通过 `NEXT_PUBLIC_API_BASE_URL` 指向后端

#### 3）本地验证方法（接口测试 + 页面访问）

后端健康检查：

- Windows（PowerShell，推荐）：

```powershell
Invoke-RestMethod http://localhost:8000/health
```

- 跨平台 curl：

```bash
curl -fsS http://localhost:8000/health
```

页面访问流程：

- 打开首页：`http://localhost:3000/`
- 常用页面路由：
  - `/workbench`
  - `/avatar`
  - `/closet`
  - `/orders`
  - `/studio`
  - `/stylist`

### 生产环境启动（本地模拟）

#### 后端（多进程示例）

```bash
cd api
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

#### 前端（构建 + 启动）

```bash
cd web
npm run build
npm run start
```

指定端口（推荐用环境变量，避免不同 shell 的参数解析差异）：

- Windows PowerShell：

```powershell
cd web
$env:PORT=3001
npm run start
```

- macOS/Linux：

```bash
cd web
PORT=3001 npm run start
```

## 常见启动问题排查方案

### 端口占用（3000/8000）

症状：启动报错包含 `EADDRINUSE` / `address already in use`。

- Windows（PowerShell）查占用进程：

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object -First 5
Get-NetTCPConnection -LocalPort 8000 | Select-Object -First 5
```

- Windows（通用）：

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

结束进程（将 `<PID>` 替换为实际值）：

```powershell
Stop-Process -Id <PID> -Force
```

- macOS/Linux：

```bash
lsof -i :3000
lsof -i :8000
kill -9 <PID>
```

### 依赖缺失 / 版本不兼容

- 前端报错（模块找不到、lockfile 不一致）：
  1. 确认 Node/npm 版本满足要求：`node -v && npm -v`
  2. 删除并重装：`rm -rf web/node_modules` 后 `npm ci`
  3. 仍失败则执行：`npm cache verify`

- 后端报错（找不到 uvicorn/fastapi 等）：
  1. 确认使用的是虚拟环境的 Python：`python --version`
  2. 直接用虚拟环境 Python 执行（无需激活）：
     - Windows：`.\.venv\Scripts\python -m uvicorn ...`
     - macOS/Linux：`./.venv/bin/python -m uvicorn ...`
  3. 执行依赖检查：`python -m pip check`

### 配置错误（环境变量缺失/不生效）

- 后端未读取到 `.env`：
  1. 确认文件路径为 `api/.env`
  2. 确认变量名拼写正确，等号后不要有多余引号/空格
  3. 重启后端进程（热更新不保证读取到新环境变量）

- 前端 API 指向不正确：
  1. 确认 `web/.env.local` 中 `NEXT_PUBLIC_API_BASE_URL` 正确
  2. 重启前端 dev server（Next 读取 env 需要重启）
  3. 在浏览器 Network 面板确认请求目标是否为期望地址

### 权限不足（Windows 常见）

- PowerShell 无法执行 venv 激活脚本：
  - 直接用 venv 的 python 跑命令（推荐，避免修改策略）
  - 或仅对当前用户放开策略（了解风险后再执行）：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 项目部署与远程同步（手动上传 GitHub）

本节覆盖：本地 Git 初始化 → 远程仓库关联 → 提交 → 推送 → 校验 → 常见错误排查。

### 1）初始化本地 Git 仓库（如尚未初始化）

在项目根目录执行：

```bash
cd HackathonPJT
git init
```

如果你发现 `web/.git/` 存在（嵌套仓库），建议先删除该目录再在根目录初始化，避免后续推送/子模块混乱（删除前确认不需要保留 web 的独立历史）。

### 2）关联远程仓库

在 GitHub 创建空仓库后，选择一种方式配置远程：

HTTPS：

```bash
git remote add origin https://github.com/<your-org>/<your-repo>.git
```

SSH：

```bash
git remote add origin git@github.com:<your-org>/<your-repo>.git
```

验证远程配置：

```bash
git remote -v
```

### 3）首次提交并推送到 main

```bash
git add .
git commit -m "chore: init"
git branch -M main
git push -u origin main
```

### 4）后续日常提交与同步

提交并推送：

```bash
git add .
git commit -m "feat: update"
git push
```

拉取远程最新（推荐 rebase，减少无意义 merge commit）：

```bash
git pull --rebase
```

### 5）远程仓库同步验证

- 命令行验证远程是否存在对应分支与提交：

```bash
git log --oneline -n 5
git ls-remote --heads origin
```

- 打开 GitHub 仓库页面，确认：
  - 分支 `main` 存在
  - 最新提交信息与本地一致
  - 文件目录结构完整

### 常见 Git 推送错误排查

- `Permission denied (publickey)`（SSH 权限问题）
  - 执行 `ssh -T git@github.com` 检查
  - 确认本机已添加 SSH key 且在 GitHub 绑定
  - 或改用 HTTPS + PAT

- `Authentication failed` / `fatal: Authentication failed`
  - HTTPS 推送需使用 Personal Access Token（PAT）而非账号密码
  - 重新登录凭据管理器或更新 token

- `Repository not found`
  - 检查远程地址拼写：`git remote -v`
  - 确认你对该仓库有权限（组织仓库尤其常见）

- `failed to push some refs` / `non-fast-forward`
  - 先同步远程再推送：

```bash
git pull --rebase origin main
git push
```

- 大文件导致推送失败（超出 GitHub 限制）
  - 删除大文件并重写历史（谨慎操作，团队协作需统一）
  - 或使用 Git LFS（需团队约定后启用）

