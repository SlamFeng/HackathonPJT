# AWS 部署操作说明（验证级 Beta）

本文给出把当前三语 beta（`feat/i18n-zh-en-ja` 分支）部署到 **AWS** 的**具体操作步骤、云服务选型与详细配置**。
目标是「**让 5–10 个真实卖家用自己的商品图跑起来**」的验证级部署——稳定、便宜、可观测，但不追求高可用。
跑通付费/质量验证后，再按文末「规模化路径」升级。

> 架构回顾：`web(Next.js)` → `api(FastAPI)` + `worker(后台生成)` → `Postgres` + 图片存储 + Gemini。
> 全栈已 Docker 化（`docker-compose.yml`），所以**首发最省事的形态 = 单台 EC2 + docker compose**。

---

## 0. 两种 AWS 形态怎么选

| 形态 | 适用 | 复杂度 | 月成本(粗估) |
|---|---|---|---|
| **A. 单台 EC2 + docker compose**（★推荐首发） | 验证级 beta、5–10 卖家 | 低 | ~$30–60 |
| B. ECS Fargate + RDS + S3 + ALB | 上量后的生产 | 高 | ~$150+ |

**首发坚决选 A**：一台机器 `docker compose up` 就把 web/api/worker/db 全拉起，运维心智最小。
下面**主线按 A 写**，B 的要点放在文末。

---

## 1. AWS 服务选型（形态 A）

| 用途 | AWS 服务 | 选型与配置 | 理由 |
|---|---|---|---|
| 计算（跑容器） | **EC2** `t3.large`(2vCPU/8GB) 或 `t3.medium`(2/4) | Amazon Linux 2023；30–50GB gp3 EBS | 生成是 IO/网络等待型；8GB 给 web 构建+worker 留足余量。也可用 **Lightsail**（更省心、含固定带宽） |
| 数据库 | **EC2 上的 Postgres 容器**（首发）/ 后续 **RDS** | compose 自带 `postgres:16`，数据落 `db_data` 卷 | 验证期省一个 RDS 月费；上量再迁 RDS |
| 图片存储 | **EBS 卷**（首发）/ 后续 **S3** | 落 `api_storage` 卷 | 低量本地盘够用；代码已留 S3 接入点 |
| 域名/DNS | **Route 53**（或你现有 DNS） | 两条记录：`app.域名`→web、`api.域名`→api | 跨子域同站，Cookie SameSite=lax 可用 |
| HTTPS 证书 | **Caddy 自动签发**（首发，最省）/ ACM+ALB | Caddy 反代自动 Let's Encrypt | 一台机器上 Caddy 一把梭，无需 ALB |
| 密钥管理 | **SSM Parameter Store**（SecureString，免费档） | 存 Gemini Key / SESSION_SECRET | 比明文 .env 安全；启动时拉取 |
| 防火墙 | **Security Group** | 仅放行 22(限你的 IP)/80/443 | 8000/3000 不对公网暴露，只走 Caddy |
| 备份 | **EBS 快照**（DLM 生命周期） | 每日快照 `db_data`、`api_storage` | 卖家数据/出图不丢 |
| 日志/监控 | **CloudWatch Agent**（可选） | 收 docker 日志、磁盘告警 | 验证期也可先 `docker logs` |

> 配额提醒：批量出图会快速消耗 Gemini Key 配额（实测易 429）。beta 前先在 Google AI Studio 确认额度，并据此设 `WORKER_CONCURRENCY`（建议 2–4）。

---

## 2. 一步步部署（形态 A）

### 2.1 准备域名与 DNS（Route 53）
1. 在 Route 53（或你的 DNS）建两条 **A 记录**，先指向稍后拿到的 EC2 公网 IP：
   - `app.your-domain.com` → EC2 IP（前端）
   - `api.your-domain.com` → EC2 IP（后端）

### 2.2 创建 EC2
1. EC2 → 启动实例：**Amazon Linux 2023**，`t3.large`，gp3 40GB。
2. **Security Group** 入站规则：
   - SSH `22` → **仅你的 IP**
   - HTTP `80` → `0.0.0.0/0`
   - HTTPS `443` → `0.0.0.0/0`
   - （不要开放 3000/8000/5432）
3. 绑定一个 **Elastic IP**（固定公网 IP），更新 §2.1 的 A 记录指向它。
4. 给实例挂一个 **IAM Role**，附带读取 SSM 参数的权限（策略示例见 §2.4）。

### 2.3 装 Docker + 拉代码
SSH 进去：
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # 重新登录使生效
# 安装 docker compose 插件
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

git clone -b feat/i18n-zh-en-ja https://github.com/<你的fork>/HackathonPJT.git
cd HackathonPJT
```

### 2.4 放置密钥（SSM Parameter Store）
在 AWS 控制台 → Systems Manager → Parameter Store，建 SecureString：
- `/styleai/NANOBANANA_API_KEY` = 你的 Gemini Key
- `/styleai/SESSION_SECRET` = `openssl rand -hex 32` 的结果
- `/styleai/ADMIN_PASSWORD` = 强密码

EC2 的 IAM Role 附最小策略：
```json
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["ssm:GetParameter","ssm:GetParameters"],
    "Resource": "arn:aws:ssm:<region>:<account-id>:parameter/styleai/*" }]}
```
拉取到环境（部署脚本里）：
```bash
export NANOBANANA_API_KEY=$(aws ssm get-parameter --with-decryption --name /styleai/NANOBANANA_API_KEY --query Parameter.Value --output text)
export SESSION_SECRET=$(aws ssm get-parameter --with-decryption --name /styleai/SESSION_SECRET --query Parameter.Value --output text)
export ADMIN_PASSWORD=$(aws ssm get-parameter --with-decryption --name /styleai/ADMIN_PASSWORD --query Parameter.Value --output text)
```
> 简化版：也可直接 `cp api/.env.example api/.env` 手填 Key（但 .env 要 `chmod 600`，且确保不进 git——本仓库已 gitignore）。

### 2.5 配置部署环境变量
在仓库根目录建 `.env`（compose 会自动读取；`cp .env.example .env` 后改）：
```ini
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
CORS_ORIGINS=https://app.your-domain.com
SESSION_SECRET=${SESSION_SECRET}      # 来自 §2.4，或手填
COOKIE_SECURE=true                    # 生产 HTTPS 必须 true
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=${ADMIN_PASSWORD}
WORKER_CONCURRENCY=2
```
后端 AI Key 放 `api/.env`：
```ini
NANOBANANA_API_KEY=${NANOBANANA_API_KEY}
NANOBANANA_MODEL=gemini-3.1-flash-image-preview
```
> 注意：`NEXT_PUBLIC_API_BASE_URL` 在 **web 构建期内联**，改了域名必须重新 `docker compose build web`。

### 2.6 加一层 Caddy 做 HTTPS 反代
新建 `Caddyfile`（仓库根目录）：
```
app.your-domain.com {
    reverse_proxy localhost:3000
}
api.your-domain.com {
    reverse_proxy localhost:8000
}
```
在 `docker-compose.yml` 追加一个 caddy 服务（与现有 web/api 同网络）：
```yaml
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [web, api]
    restart: unless-stopped
# volumes: 末尾补 caddy_data: 和 caddy_config:
```
Caddy 会按 `Caddyfile` 里的域名**自动申请并续期 Let's Encrypt 证书**（前提：80/443 放行、DNS 已指向本机）。

### 2.7 启动
```bash
docker compose up --build -d
docker compose ps          # 期望 db/api/worker/web/caddy 都 healthy/running
docker compose logs -f api # 看 alembic 迁移 + 启动
```
- alembic 迁移在 api 容器启动时自动跑（建表 + 0007 batch_id）。
- 管理员账号按 `ADMIN_EMAIL/ADMIN_PASSWORD` 自动创建。

### 2.8 上线自检（必须）
```bash
curl -s https://api.your-domain.com/health           # {"ok":true}
```
浏览器开 `https://app.your-domain.com`：
1. 右上角语言切换 **中/EN/日** 能切；
2. 注册/登录正常（HTTPS 下 Cookie 能下发 = COOKIE_SECURE 生效）；
3. 用真实商品图走一遍：模特 → 商品库批量上传 → 批量出图 → 出图记录按批次下载 ZIP；
4. 管理后台「用户管理」给试用卖家**人工发放额度**；
5. 确认「系统设置 → 垂立调试链路」**保持关闭**（仅你调 demo 质量时才开）。

---

## 3. 运维要点

- **备份**：用 Data Lifecycle Manager 给该 EC2 的 EBS 卷设每日快照（覆盖 `db_data`、`api_storage`）。
- **更新发版**：
  ```bash
  git pull
  docker compose up --build -d   # 改了 NEXT_PUBLIC_API_BASE_URL 时务必重建 web
  ```
- **配额/成本**：盯 Gemini 用量；必要时在「系统设置」换 Key 或调 `WORKER_CONCURRENCY`。
- **日志**：`docker compose logs -f worker` 看生成；接 CloudWatch Agent 可做磁盘/错误告警。
- **法务**：放一页隐私说明/使用条款（卖家会上传含真人模特的图）。

---

## 4. 规模化路径（形态 B，验证出"有人付费"后再做）

| 升级项 | 从 → 到 | 要点 |
|---|---|---|
| 数据库 | EC2 Postgres → **RDS for PostgreSQL** | 改 `DATABASE_URL` 指向 RDS（保留 `+asyncpg`）；多 AZ 高可用 |
| 存储 | EBS → **S3**（+ CloudFront） | 实现 `app/storage/s3.py`，设 `STORAGE_BACKEND=s3`；业务层无需改 |
| 计算 | 单 EC2 → **ECS Fargate** | api/worker/web 各一个 Service；worker 可独立扩缩 |
| 入口 | Caddy → **ALB + ACM** | ALB 终止 TLS，按 `app./api.` 路由到对应目标组 |
| 密钥 | SSM → **Secrets Manager** | 轮转 Gemini Key/DB 密码 |
| 队列 | DB 轮询 → **SQS/Redis**（可选） | 高并发时把 jobs 队列外移 |

> 现有代码已为此预留：任务队列是 DB 轮询（可平替）、存储是可插拔抽象（`settings.storage_backend`）、
> 配置全走环境变量。所以从 A 升 B **不需要重写业务逻辑**，主要是基础设施替换。

---

## 5. 成本粗估（形态 A，us-east-1 量级，仅供参考）
- EC2 `t3.large` 按需 ~$60/月（预留实例可降一半）；`t3.medium` ~$30/月
- EBS gp3 40GB ~$3/月 + 快照少量
- Route 53 托管区 $0.5/月 + 查询费极少
- 数据传出按量（验证期很低）
- **Gemini 调用费另计**（按你实际出图量，是主要变动成本）

合计基础设施约 **$35–65/月**，足够撑一批种子卖家的验证。
