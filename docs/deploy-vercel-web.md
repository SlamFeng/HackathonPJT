# 拆分部署手册：前端 Vercel + 后端 lite（零经验可照抄）

本手册把**前端放到 Vercel**（免费、自带 CDN/HTTPS），**后端只留 api + SQLite** 放到一台最小云服务器。
这样那台小机器**不再构建/运行 Next.js**，free-tier（1GB 内存）部署成功率大幅提高。

> 适用分支：`deploy/lite-budget`。后端拓扑文件：`docker-compose.lite-api.yml`。
> 面向**完全没有部署经验**的人写，每一步都可直接照抄。看不懂的术语先照做，文末有名词解释。

---

## 总览：最终长这样

```
   用户浏览器
      │  打开 https://你的项目.vercel.app   ← 前端（Vercel，免费）
      │  前端再调用 ↓
      ▼
   https://api.你的域名      ← 后端（你的小服务器：api + SQLite + 进程内 worker）
      └─ Caddy 自动 HTTPS → FastAPI(8000) → 调 Gemini 出图，图片存本机磁盘
```

- 前端：Vercel，**$0**，自动 HTTPS、全球 CDN。
- 后端：Lightsail 最小档 **~$5~12/月**，或 EC2 免费套餐**首年 ~$0**。
- 唯一变动成本：**Gemini 出图 API 费**（按出图量）。

---

## 第 0 步：开始前你需要准备什么

逐项确认，缺一不可：

1. **一个 GitHub 账号**，并且本项目代码已经推到你的 GitHub 仓库
   （本手册假设是 `https://github.com/<你的用户名>/HackathonPJT`，分支 `deploy/lite-budget`）。
2. **一个 AWS 账号**（用来开后端服务器）。新账号有 12 个月免费套餐。
3. **一个 Vercel 账号**（用来放前端）。直接用 GitHub 登录最省事：https://vercel.com 。
4. **一个域名给后端 API 用**。二选一：
   - **省钱/不想买域名**：用免费的 `sslip.io`（下面 A4 讲，把服务器 IP 直接变成一个带 HTTPS 的网址，$0）。
   - **更正式**：买个便宜域名（Namecheap / Cloudflare / AWS Route 53，约 $1~12/年），用它的子域名 `api.你的域名`。
   > 为什么后端必须有域名+HTTPS：Vercel 前端是 https 的，浏览器不允许 https 页面去调用 http 接口（会被拦），
   > 而且跨站登录态（Cookie）也要求 HTTPS。所以后端必须是 `https://...`。

> **注意（合规）**：Vercel 免费的 Hobby 套餐按条款是**非商用**的。给客户做 demo / 内部验证没问题；
> 真正对外商用收费时需升级到 Pro（约 $20/月）。先用免费档验证，上量再升。

---

# 第一部分：部署后端到 AWS Lightsail

> 选 Lightsail 是因为它比 EC2 更傻瓜、含固定流量、价格透明。想压到首年 $0 用 EC2 免费套餐的差异见 **附录 A**。

## A1. 创建服务器（Lightsail 实例）
1. 登录 https://lightsail.aws.amazon.com 。
2. 点 **Create instance（创建实例）**。
3. **Region（区域）**：选离你客户近的，例如日本客户选 `Tokyo`。
4. **Platform**：选 **Linux/Unix**。
5. **Blueprint（蓝图）**：选 **OS Only（仅操作系统）→ Amazon Linux 2023**。
6. **Instance plan（规格）**：选 **2 GB RAM / 2 vCPU / 60 GB SSD（$12/月）**。
   （预算极限可选 1 GB / $7，但要按 **附录 B** 加 swap。）
7. 给实例取个名字，例如 `styleai-api`，点 **Create instance**。等 1~2 分钟变成 “Running”。

## A2. 绑定固定 IP（静态 IP，免费）
1. 左侧 **Networking（网络）** → **Create static IP（创建静态 IP）**。
2. 选择刚才的实例 `styleai-api`，给静态 IP 取名（如 `styleai-ip`），**Create**。
3. 记下这个 IP（例如 `13.51.22.33`），后面要用。

## A3. 打开防火墙端口
1. 进入实例 → **Networking** 标签页 → 找到 **IPv4 Firewall**。
2. 确认/添加这几条入站规则：
   - **SSH / TCP / 22**（默认已有；可把来源限制为你自己的 IP 更安全）
   - **HTTP / TCP / 80**（点 Add rule 添加）
   - **HTTPS / TCP / 443**（点 Add rule 添加）
3. **不要**开放 8000（后端不直接对外，只走 Caddy）。

## A4. 把域名指向这台机器
**选项一：免费 sslip.io（$0，推荐先用这个跑通）**
- 不用做任何 DNS 配置。直接用这个网址当你的 API 域名：
  把 IP 里的点换成横杠，形如 `api-13-51-22-33.sslip.io`（`sslip.io` 会自动把它解析回 `13.51.22.33`）。
- 后面所有 `api.你的域名` 都用这个 `api-13-51-22-33.sslip.io` 代替即可，Caddy 也能给它自动签 HTTPS 证书。

**选项二：自己的域名（更正式）**
- 去域名服务商的 DNS 控制台，加一条 **A 记录**：
  `api.你的域名` → 指向 `13.51.22.33`（你的静态 IP）。
- 等几分钟生效。

> 下文统一用占位符 `api.你的域名`，请按你选的那个替换。

## A5. 登录服务器（SSH）
最简单：Lightsail 实例页面右上角点 **Connect using SSH**，会在浏览器里直接打开一个终端，跳过装客户端。
（想用本机终端也行：下载实例的 SSH key，`ssh -i key.pem ec2-user@13.51.22.33`。）

## A6. 安装 Docker（在服务器终端里逐条粘贴）
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# 让用户组生效：退出再重连一次（关闭终端重新 Connect using SSH）
```
重连后装 docker compose 插件：
```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version    # 能打印版本号就成功
```

## A7. 下载代码
```bash
git clone -b deploy/lite-budget https://github.com/<你的用户名>/HackathonPJT.git
cd HackathonPJT
```

## A8. 填后端密钥（Gemini Key）
```bash
cp api/.env.example api/.env
chmod 600 api/.env
nano api/.env        # 编辑，填入下面两行后按 Ctrl+O 回车保存、Ctrl+X 退出
```
`api/.env` 内容：
```ini
NANOBANANA_API_KEY=你的Gemini密钥
NANOBANANA_MODEL=gemini-3.1-flash-image-preview
```
> 这个文件已被 .gitignore 忽略，**绝不会**被提交到 GitHub。

## A9. 填部署参数（根目录 .env）
```bash
cp .env.example .env
nano .env
```
先这样填（`CORS_ORIGINS` 等拿到 Vercel 网址后再回来改，先随便占位）：
```ini
SESSION_SECRET=粘贴一段随机字符串            # 见下方命令生成
COOKIE_SAMESITE=none                          # 跨站必须
ADMIN_EMAIL=admin@你的域名
ADMIN_PASSWORD=设一个强密码
WORKER_CONCURRENCY=2
CORS_ORIGINS=https://待定.vercel.app          # 第三部分 C1 再回填真实网址
```
生成 SESSION_SECRET：
```bash
openssl rand -hex 32      # 把输出粘到上面 SESSION_SECRET
```

## A10. 配置 HTTPS 反代域名
```bash
cp Caddyfile.api.example Caddyfile.api
nano Caddyfile.api
```
把里面的 `api.your-domain.com` 改成你 A4 选的域名（`api.你的域名` 或 `api-13-51-22-33.sslip.io`）：
```
api.你的域名 {
    reverse_proxy api:8000
}
```

## A11. 启动后端
```bash
docker compose -f docker-compose.lite-api.yml up --build -d
docker compose -f docker-compose.lite-api.yml ps      # api / caddy 都应是 running
docker compose -f docker-compose.lite-api.yml logs -f api
```
日志里看到 `[worker] started in-process x2` 和启动完成即可（按 Ctrl+C 退出看日志，不会停服务）。

## A12. 验证后端通了
等 1 分钟（Caddy 申请证书需要点时间），然后：
```bash
curl -s https://api.你的域名/health      # 期望返回 {"ok":true}
```
浏览器打开 `https://api.你的域名/health` 也应看到 `{"ok":true}` 且是**带锁的 https**。
✅ 后端完成。记下这个 `https://api.你的域名`，第二部分要用。

---

# 第二部分：部署前端到 Vercel

## B1. 登录并连接 GitHub
1. 打开 https://vercel.com ，点 **Sign Up / Log in**，选 **Continue with GitHub**，授权。

## B2. 新建项目并导入仓库
1. 进入 Dashboard，点右上角 **Add New…** → **Project**。
2. 在 **Import Git Repository** 列表里找到 `HackathonPJT`，点它右边的 **Import**。
   （第一次用会让你装 Vercel 的 GitHub App / 授权访问该仓库，按引导点 **Install** 即可。）

## B3. 配置项目（关键三处）
导入后会进入一个配置页，逐项设置：

1. **Root Directory（根目录）**：点 **Edit**，选 **`web`** 文件夹。
   （我们的前端代码在 `web/` 子目录，这一步必须设对，否则构建失败。）
2. **Framework Preset（框架）**：应自动识别为 **Next.js**（不用改）。
3. **Environment Variables（环境变量）**：展开它，添加一条：
   - **Key**：`NEXT_PUBLIC_API_BASE_URL`
   - **Value**：`https://api.你的域名`  ← 就是第一部分 A12 记下的后端地址
   - 三个环境（Production / Preview / Development）都勾上。
   > 这个变量在**构建时**被写进前端代码，所以必须在点 Deploy 之前填好；以后改了它要重新 Deploy。

## B4. 部署
1. 点 **Deploy**。等 1~3 分钟构建完成。
2. 成功后会给你一个网址，形如 `https://hackathon-pjt-xxxx.vercel.app`。**记下它**。

## B5.（重要）让 Vercel 部署正确的分支
Vercel 默认部署仓库的**默认分支**。我们的代码在 `deploy/lite-budget`，要确认它部署的是这个分支：
1. 项目页 → **Settings** → **Git**。
2. 找到 **Production Branch**，设为 **`deploy/lite-budget`**，保存。
3. 回到 **Deployments**，点最新一次右侧 **⋯ → Redeploy**（或直接重新触发一次）。
> 也可以把 `deploy/lite-budget` 合并进默认分支（如 main）省去这步——但保持现状最简单。

✅ 前端完成。现在前端能打开，但**还不能登录**，因为后端还没放行这个 Vercel 网址。下面接上。

---

# 第三部分：把前后端接上（关键一步）

## C1. 让后端放行你的 Vercel 网址
回到**服务器终端**（第一部分那台）：
```bash
cd HackathonPJT
nano .env
```
把 `CORS_ORIGINS` 改成你 B4 拿到的真实 Vercel 网址（**精确复制，结尾不要带斜杠**）：
```ini
CORS_ORIGINS=https://hackathon-pjt-xxxx.vercel.app
```
保存后重启后端让它生效：
```bash
docker compose -f docker-compose.lite-api.yml up -d
```

## C2. 跨站登录态（已自动处理，了解即可）
- 前端在 `vercel.app`、后端在 `你的域名`，属于「跨站」。浏览器要求跨站 Cookie 必须 `SameSite=None; Secure`。
- 本分支的后端已自动处理：只要 `COOKIE_SAMESITE=none`（A9 已设），代码会**强制** `Secure`，登录态就能正确下发。
- 你**不需要**改任何代码。

---

# 第四部分：端到端验证（务必做完）

打开你的 Vercel 网址 `https://hackathon-pjt-xxxx.vercel.app`：
1. 右上角语言切换 **中 / EN / 日**，能切换并刷新后保持。
2. **注册**一个新账号 → 应能登录成功并停留在登录态（刷新页面不掉登录 = 跨站 Cookie 成功）。
3. 走完整链路：上传模特 → 商品库批量上传商品图 → **批量出图** → 在「出图记录」按批次 **下载 ZIP**。
4. 用 A9 的 `ADMIN_EMAIL/ADMIN_PASSWORD` 登录，进管理后台「用户管理」给试用卖家**发放额度**。
5. 确认「系统设置 → 垂立调试链路」**保持关闭**（只有你调 demo 质量时才临时开）。

全部通过 = 部署成功 🎉

---

# 第五部分：常见问题排查（按现象找）

| 现象 | 原因 | 解决 |
|---|---|---|
| 登录后刷新就掉登录 / `/auth/me` 401 | 跨站 Cookie 没下发 | 确认后端是 **https**；`COOKIE_SAMESITE=none`；`CORS_ORIGINS` 与 Vercel 网址**完全一致**（含 https、无结尾斜杠） |
| 浏览器控制台报 **CORS** 错误 | `CORS_ORIGINS` 没匹配上 | 必须精确等于前端网址（协议+域名，无路径无尾斜杠）；改完 `up -d` 重启后端 |
| 控制台报 **Mixed Content** / 请求被拦 | 后端是 http | 后端必须 https；检查 A12 能否打开 `https://api.你的域名/health` |
| 前端调接口 404/连不上 | API 地址填错 | Vercel 里 `NEXT_PUBLIC_API_BASE_URL` 是否为 `https://api.你的域名`；改了要**重新 Deploy** |
| Vercel 构建失败 | Root Directory 没设成 `web` | Settings → General → Root Directory 改为 `web`，重新部署 |
| `curl https://api.你的域名/health` 不通 | 证书还没签好 / 端口没开 | 等 1~2 分钟；确认 A3 开了 80/443；`docker compose -f docker-compose.lite-api.yml logs caddy` 看报错 |
| Caddy 一直签不出证书（sslip.io） | Let's Encrypt 限流或解析问题 | 换成自己买的便宜域名（选项二）通常立即可用 |

---

# 第六部分：成本与边界

- 前端 Vercel：**$0**（Hobby，非商用）。
- 后端 Lightsail 2GB：**~$12/月**；用 EC2 免费套餐（附录 A）**首年 ~$0**。
- **Gemini 出图 API 费**：唯一随用量变化的成本，按你出图量计，是主要变动支出。
- **边界**：SQLite 单实例、无高可用，适合 demo 与 5~10 卖家验证；并发上量后按 `docs/deploy-aws.md` 升级到
  Postgres/RDS、S3、独立 worker（改环境变量即可，无需重写业务）。

---

# 附录 A：把后端换成 EC2 免费套餐（首年 ~$0）

与第一部分基本相同，差异：
1. 用 **EC2** 而非 Lightsail，机型选 **t3.micro / t2.micro（免费套餐）**，系统 Amazon Linux 2023，磁盘 30GB gp3。
2. 安全组（Security Group）入站只开 **22 / 80 / 443**。
3. 绑一个 **Elastic IP**（固定公网 IP），DNS 指向它。
4. **1GB 内存**：本方案后端不构建前端，通常无需 swap；若 `docker compose build` 仍 OOM，按 **附录 B** 加 swap。
5. 其余 A6~A12 完全一致。
> 12 个月后免费套餐到期会按量计费（t3.micro 约 $7.5/月级别），到时再决定续用或迁 Lightsail。

# 附录 B：给小机器加 swap（内存不足时）
```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048    # 2GB swap
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h     # 确认 swap 生效
```

# 附录 C：名词速查
- **SSH**：远程登录服务器的方式。Lightsail 网页版「Connect using SSH」最简单。
- **Docker / docker compose**：把应用打包成容器一键启动的工具。
- **Caddy**：一个反向代理，能**自动申请并续期 HTTPS 证书**，省去手动配置。
- **CORS**：浏览器的跨域安全策略；后端要显式「放行」前端域名才能互通。
- **SameSite=None; Secure**：让 Cookie 能在「前端域名 ≠ 后端域名」时也被带上的设置（必须 HTTPS）。
- **NEXT_PUBLIC_ 变量**：Next.js 中会被打进前端代码的变量，**构建时**就固定，改了要重新构建/部署。

---

**Sources（平台官方流程，2026）**：
- [Vercel — Using Monorepos](https://vercel.com/docs/monorepos)
- [Vercel — Deploying Git Repositories](https://vercel.com/docs/git)
- [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)
- [AWS — Create a Lightsail instance / static IP](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html)
- [AWS — Lightsail firewall & ports](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html)
