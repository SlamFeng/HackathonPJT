# AI 智能试衣间（nanobanana-first）开发说明

本仓库为前后端分离的 MVP 骨架，目录结构：
- `web/`：Next.js 前端（页面预览）
- `api/`：FastAPI 后端（上传/任务系统/SSE）

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

## 5. 上传到 GitHub（推荐：以仓库根目录作为 Git 仓库）

当前 `web/` 目录在初始化时自动创建过一个 git 仓库；推荐把 git 根仓库放在项目根目录（`HackathonPJT/`），避免后续变成嵌套仓库。

### 5.1 初始化根仓库（如还没有）
如果你发现 `web/.git/` 存在，建议先删除该目录再做根仓库初始化（删除前确认你不需要保留 web 的独立 git 历史）。

```powershell
cd c:\Users\fengj\Documents\TRAE\HackathonPJT
git init
git add .
git commit -m "init mvp"
```

### 5.2 关联远程并推送
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

## 6. 常见问题

### 6.1 PowerShell 下 curl 出现交互提示
用下面这个参数避免提示与解析：
```powershell
curl -UseBasicParsing http://localhost:8000/health
```

### 6.2 端口被占用
- 后端默认 8000，前端默认 3000。被占用时可换端口启动（同时更新前端 `NEXT_PUBLIC_API_BASE_URL`）。
