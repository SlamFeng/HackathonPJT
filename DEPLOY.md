# 最小可部署框架（Deploy）

本框架把现有 `web/`（Next.js）+ `api/`（FastAPI）打包成一键可启动、可上线的最小拓扑。

```text
浏览器 → web:3000 (Next.js standalone) → api:8000 (FastAPI) → Gemini / NanoBanana
                                              └ storage/  生成图片（持久卷）
                                              └ data/     生成日志（持久卷）
```

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

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:8000/health
- 调试日志页：http://localhost:3000/debug/generation-logs

生成的图片与日志分别持久化在 `api_storage`、`api_data` 两个命名卷里，容器重启不丢。

## 3. 不用 Docker 的本地开发

```bash
# 后端
cd api && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
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
- 后端 CORS 默认只允许 `http://localhost:3000`，上线需放开你的前端域名（`api/app/settings.py` 的 `cors_origins`，可用环境变量 `CORS_ORIGINS='["https://你的域名"]'` 覆盖）。
- 当前后端为内存任务态 + 本地文件存储，**适合单实例小流量内测**；多实例 / 高并发需按 `docs/ailurus-commercialization-mvp-plan.md` 的 Phase 3–4 接入数据库、队列与对象存储。

## 5. 安全提醒

- `api/.env` 与任何真实 Key **不得提交**（已被忽略，请勿强行 `git add -f`）。
- 若 Key 曾在聊天 / 截图 / 协作工具中出现过，建议尽快在 Google AI Studio 轮换。
