# 最小可部署框架（Deploy）

本框架把现有 `web/`（Next.js）+ `api/`（FastAPI）+ `db/`（Postgres）打包成一键可启动、可上线的最小拓扑。

```text
浏览器 → web:3000 (Next.js standalone) → api:8000 (FastAPI) → Gemini / NanoBanana
                                              ├ db:5432   Postgres（用户/会话，命名卷持久化）
                                              ├ storage/  生成图片（持久卷）
                                              └ data/     生成日志（持久卷）
```

> **一键部署给团队**：装好 Docker 后 `docker compose up --build` 即可拉起全部三个服务，
> 数据库迁移（alembic）在 api 容器启动时自动执行，管理员账号自动创建——团队成员无需任何手动初始化。

## 1. 配置密钥

后端密钥放在 `api/.env`（已被 `.gitignore` 忽略，**不会提交到仓库**）：

```bash
cp api/.env.example api/.env
# 编辑 api/.env 填入：
# NANOBANANA_API_KEY=你的 Gemini API Key
# NANOBANANA_MODEL=gemini-2.5-flash-image
# NANOBANANA_ENDPOINT=        # 留空即用默认 generativelanguage 端点
```

> 不配置 `.env` 时，后端会自动走 mock（回显输入图），链路仍可跑通，便于先验证部署。

## 2. 本地 / 单机一键启动

需要 Docker（含 Compose v2.24+）：

```bash
docker compose up --build
```

- 前端：http://localhost:3000 （首次访问需先 **注册 / 登录**：`/register`、`/login`）
- 后端健康检查：http://localhost:8000/health
- 调试日志页：http://localhost:3000/debug/generation-logs （**仅管理员**可访问）

**默认管理员**（compose 自动创建，生产务必改）：`admin@ailurus.com` / `admin12345`，
可用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 覆盖。数据、图片、日志分别持久化在
`db_data`、`api_storage`、`api_data` 三个命名卷里，容器重启不丢。

## 3. 不用 Docker 的本地开发

需要本机有 Postgres（或单独起一个 Postgres 容器）：

```bash
# 0) 起一个本地 Postgres（任选其一）
docker run -d --name ailurus-db -e POSTGRES_USER=ailurus -e POSTGRES_PASSWORD=ailurus \
  -e POSTGRES_DB=ailurus -p 5432:5432 postgres:16-alpine

# 后端
cd api && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://ailurus:ailurus@localhost:5432/ailurus
export ADMIN_EMAIL=admin@ailurus.com ADMIN_PASSWORD=admin12345
alembic upgrade head          # 建表
uvicorn main:app --reload --port 8000

# 前端（另开一个终端）
cd web && npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev
```

## 4. 部署到云

最小生产部署可以拆成两个服务：

| 组件 | 可选平台 | 关键配置 |
| --- | --- | --- |
| api（FastAPI + worker） | Render / Fly.io / Railway / ECS | 设 `NANOBANANA_API_KEY` 等为平台 secret；`storage/` `data/` 挂持久卷 |
| web（Next.js） | Vercel / Cloudflare Pages / 同平台容器 | 构建期设 `NEXT_PUBLIC_API_BASE_URL=https://api.你的域名` |

注意点：

- **`NEXT_PUBLIC_API_BASE_URL` 在构建期被内联**，换域名后前端必须重新 build。
- 后端 CORS 默认只允许 `http://localhost:3000`，上线需放开你的前端域名：环境变量 `CORS_ORIGINS=https://你的域名`（逗号分隔多个）。
- 生产 HTTPS 下设 `COOKIE_SECURE=true`，并务必修改 `SESSION_SECRET` 与默认管理员密码。
- 生产数据库换成托管（Supabase / Neon / RDS）：把 `DATABASE_URL` 指过去即可（保留 `+asyncpg` 驱动）。
- 当前**任务态仍是进程内存 + 本地文件存储**（用户/会话已入库）。适合单实例小流量内测；多实例 / 高并发需按 `docs/ailurus-commercialization-mvp-plan.md` 的 Phase 3–4 接入队列与对象存储。

## 5. 安全提醒

- `api/.env` 与任何真实 Key **不得提交**（已被忽略，请勿强行 `git add -f`）。
- 若 Key 曾在聊天 / 截图 / 协作工具中出现过，建议尽快在 Google AI Studio 轮换。
