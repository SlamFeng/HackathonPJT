# 最低成本部署手册（lite，demo / 种子卖家验证）

本手册把当前三语 beta 以**最省的方式**部署到 AWS，用于**给客户做 demo + 5~10 个种子卖家验证**。
对应分支 `deploy/lite-budget`、拓扑文件 `docker-compose.lite.yml`。

> 设计目标：把**基础设施月成本压到地板**（首年可近 $0，长期 ~$5~12/月），代价是单机、无高可用。
> 跑通"有人愿意付费 / 质量达标"后，再按 `docs/deploy-aws.md` 的形态 A/B 升级。

---

## 0. 这套 lite 拓扑省在哪

与标准 `docker-compose.yml`（db + api + worker + web + caddy，5 容器）相比，lite 做了三处删减：

| 删减 | 标准版 | lite 版 | 省下的 |
|---|---|---|---|
| 数据库 | Postgres 容器 | **SQLite**（落在持久卷） | 一个 DB 容器的内存 + 后续 RDS 月费 |
| 后台 worker | 独立 worker 容器 | **进程内 worker**（`WORKER_IN_PROCESS=true`） | 一个容器的内存 |
| 容器数 | 5 | **2~3**（api + web，可选 caddy） | 整机内存需求，1~2GB 小机即可 |

> 已验证：api 在 `DATABASE_URL=sqlite+aiosqlite` + `WORKER_IN_PROCESS=true` 下正常启动、自动建表、
> 自动创建管理员、登录下发 session、进程内 worker 拉起。`entrypoint.sh` 对 SQLite 自动跳过 alembic
> （由应用 startup 的 `init_models()` 建表），对 Postgres 仍跑迁移，两条路径互不影响。

**适用边界（务必认清）**：SQLite 是单写入、单实例无高可用。适合低并发的 demo 与几位卖家验证；
**不要**拿这套扛真实流量。批量出图并发由 `WORKER_CONCURRENCY` 控制（建议 2，受 Gemini 配额限制）。

---

## 1. 成本：能压到多少

| 档 | 基础设施月成本 | 机型 | 说明 |
|---|---|---|---|
| **极限省（首年）** | **~$0** | EC2 免费套餐 `t3.micro`/`t2.micro` | 新账号 12 个月：750h/月实例 + 30GB EBS + 100GB 流量免费 |
| **可持续底（★demo 推荐）** | **~$5~12** | Lightsail `1GB($7)` / `2GB($12)` | 含固定流量，最省心；2GB 跑这套很从容 |
| 舒适 | ~$24 | Lightsail 4GB / EC2 `t4g.medium`(ARM,4GB) | 可在机器上直接构建，不用下面的省内存技巧 |

> **真正的成本大头是 Gemini 出图调用费**，不是服务器。基础设施压到 $10 很容易，但每张批量出图都在花
> API 钱，量一上来就远超机器费。省钱优先级：控生成量 / 选模型 / 设 `WORKER_CONCURRENCY`，而不是抠机器。

**关键约束**：1GB 内存机器**跑得动但构建不动** Next.js（`npm run build` 要 ~1.5~2GB，会 OOM）。
两种解法（§3 选一）：**(A) 本地/CI 构建好镜像再推送** 或 **(B) 给机器挂 2~4GB swap 再就地构建**。

---

## 2. 选机器（二选一）

- **demo 推荐：Lightsail 2GB（$12/月）** —— 控制台一键创建、含固定带宽、自带静态 IP，最省心。
- **想压到近 $0：EC2 免费套餐 t3.micro** —— 首年免费，但 1GB 内存必须配 swap 且最好用预构建镜像。

下面以 **Lightsail 2GB** 为主线（最适合 demo），免费套餐 EC2 的差异点在 §6 标注。

### 2.1 创建 Lightsail 实例
1. Lightsail → Create instance → Linux/Unix → **OS Only → Amazon Linux 2023**。
2. 规格选 **2 GB RAM / 2 vCPU / 60GB SSD（$12/月）**（预算极限可选 1GB/$7，但务必配 swap）。
3. 创建后 → Networking → 绑定一个 **Static IP**（固定公网 IP，免费）。
4. Networking → 防火墙(IPv4) 开放：**22 / 80 / 443**（22 建议限制来源 IP）。

---

## 3. 两种构建策略（按机器内存选一条）

### 策略 A（推荐）：本地/CI 构建镜像 → 推送 → 机器只拉取运行
小机器不构建，只 `pull` 运行，最稳。镜像仓库用 **ECR**（私有，便宜）或 **GHCR**（GitHub 免费私有）。

在**你本地**（有 Docker、内存充足）：
```bash
# 1) 构建 api 与 web 镜像（web 的 API 地址在构建期内联，必须传对公网域名）
docker build -t <registry>/styleai-api:beta ./api
docker build -t <registry>/styleai-web:beta \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com ./web
# 2) 推送
docker push <registry>/styleai-api:beta
docker push <registry>/styleai-web:beta
```
然后在云机器上用一个"只引用镜像、不 build"的 compose（把 `build:` 换成 `image:`）拉起即可。

### 策略 B：机器上挂 swap，就地构建
1GB/2GB 机器加 swap 后能直接 `--build`：
```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096   # 4GB swap
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # 开机自动挂
free -h   # 确认 swap 已生效
```
之后照 §5 直接 `docker compose -f docker-compose.lite.yml ... up --build -d`。
> 2GB 内存 + 4GB swap 通常能构建成功，只是 web 构建偏慢（几分钟），可接受。

---

## 4. 装 Docker + 拉代码（机器上）

SSH 进实例：
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user      # 重新登录生效
# docker compose 插件
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

git clone -b deploy/lite-budget https://github.com/<你的fork>/HackathonPJT.git
cd HackathonPJT
```

---

## 5. 配置 + 启动（lite）

### 5.1 后端密钥（api/.env）
```bash
cp api/.env.example api/.env
chmod 600 api/.env
# 编辑填入真实 Gemini Key（此文件已 gitignore，绝不提交）
#   NANOBANANA_API_KEY=你的key
#   NANOBANANA_MODEL=gemini-3.1-flash-image-preview
```
> 更安全的做法：把 Key 放 SSM Parameter Store，启动前 `export` 出来（见 `docs/deploy-aws.md` §2.4）。
> demo 阶段直接用 `chmod 600` 的 `.env` 也可接受。

### 5.2 部署环境变量（根目录 .env）
```bash
cp .env.example .env   # 然后编辑
```
```ini
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
CORS_ORIGINS=https://app.your-domain.com
SESSION_SECRET=<openssl rand -hex 32 的结果>
COOKIE_SECURE=true                 # 公网 HTTPS 必须 true
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=<强密码>
WORKER_CONCURRENCY=2               # 受 Gemini 配额限制，别调太高
```
> 纯本机自测（无域名、HTTP）可不改：默认 `localhost` + `COOKIE_SECURE=false` 即可。

### 5.3 HTTPS 反代（公网才需要）
```bash
cp Caddyfile.example Caddyfile     # 编辑成你的两个子域名
```
DNS 上加两条 A 记录指向实例静态 IP：`app.your-domain.com`、`api.your-domain.com`。

### 5.4 启动
```bash
# 公网带 HTTPS：
docker compose -f docker-compose.lite.yml --profile https up --build -d
# 纯本机自测（仅 api+web，不要 caddy）：
docker compose -f docker-compose.lite.yml up --build -d

docker compose -f docker-compose.lite.yml ps        # api / web (/ caddy) 应为 running
docker compose -f docker-compose.lite.yml logs -f api
```
启动时 api 会：对 SQLite 跳过 alembic → `init_models()` 自动建表 → 按 `ADMIN_*` 创建管理员 →
拉起进程内 worker（日志可见 `[worker] started in-process x2`）。

---

## 6. 免费套餐 EC2 的差异点（想压到近 $0）

- 机型选 **t3.micro / t2.micro**（免费套餐）；EBS 用 30GB gp3（在免费额度内）。
- **1GB 内存必须配 4GB swap**（§3 策略 B），且强烈建议用**预构建镜像**（§3 策略 A）避免就地构建 OOM。
- 12 个月后免费套餐到期会按量计费（t3.micro ~$7.5/月级别），到时再决定续用或迁 Lightsail。
- 其余步骤（§4/§5）完全相同。

---

## 7. 上线自检（必须）

```bash
curl -s https://api.your-domain.com/health      # {"ok":true}
```
浏览器开 `https://app.your-domain.com`：
1. 右上角语言切换 **中 / EN / 日** 能切并保持；
2. 注册/登录正常（HTTPS 下能拿到 Cookie = `COOKIE_SECURE=true` 生效）；
3. 真实商品图走完整链路：模特 → 商品库批量上传 → **批量出图** → 出图记录按批次 **下载 ZIP**；
4. 管理后台「用户管理」给试用卖家**人工发放额度**；
5. 「系统设置 → 垂立调试链路」**保持关闭**（仅你调 demo 质量时才开）。

---

## 8. 备份与运维

- **备份（SQLite 是单文件，很好备）**：
  - Lightsail：开启 **automatic snapshots**（每日实例快照，覆盖 SQLite 库 + 出图）。
  - 或脚本定时 `docker compose -f docker-compose.lite.yml cp api:/app/data/local.db ./backup/`
    并上传到 S3（`aws s3 cp`）。
- **更新发版**：
  ```bash
  git pull
  # 策略 A：重新 pull 新镜像后 up -d；策略 B：up --build -d（改了域名必须重建 web）
  docker compose -f docker-compose.lite.yml --profile https up -d
  ```
- **配额/成本**：盯 Google AI Studio 的 Gemini 用量；在「系统设置」可换 Key / 调 `WORKER_CONCURRENCY`。
- **磁盘**：出图累积占盘，定期清理或扩卷；SQLite 库很小无需担心。

---

## 9. 何时该离开 lite（升级信号）

出现任一信号就按 `docs/deploy-aws.md` 升级到形态 A（Postgres 容器）或形态 B（RDS/S3/ECS）：
- 并发卖家 > ~10，或批量出图经常排队 / SQLite 出现写入锁竞争报错；
- 需要多实例 / 高可用 / 自动扩缩；
- 数据量变大、需要正经的备份与恢复策略（迁 RDS）。

> 代码已为升级预留：DB 走环境变量（改 `DATABASE_URL` 即从 SQLite 切 Postgres/RDS，无需改业务）、
> 存储是可插拔抽象（`storage_backend`，可切 S3）、worker 可拆为独立容器（`WORKER_IN_PROCESS=false`）。
> 所以从 lite 升级**主要是基础设施替换，不需要重写业务逻辑**。
