# AI 智能试衣间（nanobanana-first）开发说明

> 🚀 **只想把项目跑起来？** 看 **[QUICKSTART.md](QUICKSTART.md)** —— Windows 双击 `start.bat`，macOS 双击 `start.command`，非技术同学也能用。
> 下面是面向开发者的详细说明。

本仓库为前后端分离的 MVP 骨架，目录结构：
- `web/`：Next.js 前端（页面预览）
- `api/`：FastAPI 后端（上传/任务系统/SSE）
- `start.bat`（Windows）/ `start.command`（macOS·Linux）：一键本地启动（零配置 SQLite 模式）
- `scripts/start-local.ps1` · `scripts/start-local.sh`：上面两个入口对应的启动脚本
- `scripts/verify-e2e.ps1`：端到端自检脚本

## 1. 首次启动（或新机器）

### 1.1 前端依赖安装
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\web
npm install
```

### 1.2 后端依赖安装（Windows）
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

## 2. 重启电脑后如何打开页面预览（开发模式）

需要同时启动后端与前端（建议开两个 PowerShell 窗口）。

### 2.1 启动后端 API（端口 8000）
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\api
.\.venv\Scripts\uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

健康检查：
```powershell
curl -UseBasicParsing http://localhost:8000/health
```

### 2.2 启动前端 Web（端口 3000）
Next 16 在本项目里建议直接用 npx 启动：
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\web
npx next dev --port 3000
```

打开页面预览：
- http://localhost:3000/
- 首次进入为门户页（/），右下角箭头进入工作台（/workbench）

## 3. 环境变量（接入真实 NanoBanana / Gemini 原生图像）

默认未配置密钥时，后端会走 mock（回显输入图片），用于先打通链路。

### 3.1 后端 `.env`
复制示例文件并填写：
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\api
Copy-Item .env.example .env
```

`.env` 字段：
- `NANOBANANA_API_KEY`：Google AI Studio / Gemini API Key
- `NANOBANANA_MODEL`：默认 `gemini-3.1-flash-image-preview`（Nano Banana 2）
- `NANOBANANA_ENDPOINT`：（可选）自定义 generateContent 的完整地址；不填则使用默认

### 3.2 前端 `.env.local`
前端默认请求 `http://localhost:8000`，如需修改：
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\web
Copy-Item .env.example .env.local
```

`.env.local`：
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

## 4. 常用开发指令

### 4.1 前端（web/）
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\web
npm run lint
npm run build
npm run start
```

### 4.2 后端（api/）
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT\api
.\.venv\Scripts\python -m compileall app
```

## 5. 图像生成日志调试页面（Debug）

本项目内置了一个仅供开发/调试使用的图像生成日志页面，用于观察 NanoBanana / Gemini 图像生成的完整工作流。该页面不会出现在侧边导航里，需要直接输入固定 URL 访问。

### 5.1 访问入口
确保后端与前端都已启动：
- 后端：`http://localhost:8000`
- 前端：`http://localhost:3000`

直接打开：
- `http://localhost:3000/debug/generation-logs`

### 5.2 什么时候会产生日志
每次通过任务接口创建并执行以下图像任务时，后端都会自动记录一条生成日志：
- `avatar_generate`：数字人生成
- `pose_render`：姿态切换
- `vton_tryon`：虚拟试穿

日志会在任务进入推理流程时创建，并在每轮 Gemini 调用结束后持续追加。任务成功或失败时，日志会写入最终状态。

### 5.3 页面如何阅读
页面左侧是最近的图像生成记录列表，按更新时间倒序展示。每条记录会显示：
- 任务类型
- 任务状态
- 创建时间
- self-check 轮数
- Gemini 远程调用次数
- 总 token 用量（如果接口返回了 `usageMetadata`）

点击左侧任意一条记录后，右侧会展示该图片生成的完整流程：
- 顶部汇总：生成轮数、远程调用次数、成功/失败调用次数、总 tokens
- 最终图片：本次任务最终返回给前端的图片
- Round 1：初始生成
- Round 2：self-check / self-correction 修正（如果启用并成功执行）
- 每轮输入图片、输出图片
- 每轮完整 prompt
- 每次模型调用的模型名、状态、耗时、prompt tokens、output tokens、total tokens
- 原始 `inputs`、`constraints`、`meta`

### 5.4 token 统计说明
token 数据来自 Gemini API 响应中的 `usageMetadata`。页面会优先展示：
- `promptTokenCount`
- `candidatesTokenCount`
- `totalTokenCount`

如果某次模型调用没有返回 `usageMetadata`，页面会显示“未返回”。这不是前端错误，而是供应商响应中没有提供可统计字段。

### 5.5 后端调试 API
日志页面使用以下后端接口：

```powershell
curl -UseBasicParsing "http://localhost:8000/v1/debug/generation-logs?limit=20"
```

返回最近的日志摘要列表。

```powershell
curl -UseBasicParsing "http://localhost:8000/v1/debug/generation-logs/<log_id>"
```

返回单条日志详情，包括完整 prompt、每轮输入/输出图片、模型调用尝试与 token usage。

通常情况下，`log_id` 与任务的 `jobId` 一致。任务返回的 artifact meta 中也会包含：
- `generationLogId`

### 5.6 日志文件位置
日志以 JSON 文件形式保存在后端本地目录：

```text
api/data/generation_logs/
```

每个任务一份 JSON 文件。该目录已加入 `.gitignore`，不会被提交到 GitHub。

输出图片仍保存在：

```text
api/storage/
```

输出图片目录同样已被 `.gitignore` 忽略。

### 5.7 常见排查
如果页面没有日志：
- 确认后端已启动在 `http://localhost:8000`
- 确认前端 `.env.local` 中 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- 先执行一次数字人生成、姿态切换或试穿任务
- 直接访问 `http://localhost:8000/v1/debug/generation-logs?limit=20` 检查后端是否已有日志

如果 token 显示“未返回”：
- 检查对应 round 的模型调用是否成功
- 检查单条日志详情中的 `usageMetadata`
- 如果 `usageMetadata` 缺失，说明当前 Gemini 响应没有返回 token 统计

如果图片无法预览：
- 确认后端静态文件服务可访问，例如 `http://localhost:8000/static/<image_name>.png`
- 确认 `api/storage/` 中仍存在对应图片文件

## 6. 上传到 GitHub（推荐：以仓库根目录作为 Git 仓库）

当前 `web/` 目录在初始化时自动创建过一个 git 仓库；推荐把 git 根仓库放在项目根目录（`HackathonPJT/`），避免后续变成嵌套仓库。

### 6.1 初始化根仓库（如还没有）
如果你发现 `web/.git/` 存在，建议先删除该目录再做根仓库初始化（删除前确认你不需要保留 web 的独立 git 历史）。

```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT
git init
git add .
git commit -m "init mvp"
```

### 6.2 关联远程并推送
```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT
git branch -M main
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

常见更新流程：
```powershell
git add .
git commit -m "feat: update"
git push
```

## 7. 常见问题

### 7.1 PowerShell 下 curl 出现交互提示
用下面这个参数避免提示与解析：
```powershell
curl -UseBasicParsing http://localhost:8000/health
```

### 7.2 端口被占用
- 后端默认 8000，前端默认 3000。被占用时可换端口启动（同时更新前端 `NEXT_PUBLIC_API_BASE_URL`）。
