# 快速上手（本地启动）

> 这份文档面向**所有人**，包括不写代码的同学。照着做就能在自己电脑上把项目跑起来。
> Windows 用户看「方式一」，macOS 用户看「方式二」。

---

## 方式一：一键启动（Windows，最简单，推荐）

**只需三步：**

1. 把项目下载/克隆到本地（如果你还没有，问技术同学要仓库地址，或用 GitHub Desktop 下载）。
2. 打开项目文件夹，**双击 `start.bat`**。
3. 等一会儿，浏览器会**自动打开登录页**，就可以用了。

第一次启动会自动帮你装好运行环境（Python、Node.js）和项目依赖，可能需要 5–10 分钟，请耐心等待；之后每次启动只要十几秒。

启动后你会看到**两个黑色窗口**（一个是后端、一个是前端），它们必须一直开着，程序才在运行。

### 登录

- 想直接体验：用内置管理员账号登录
  - 邮箱：`admin@ailurus.com`
  - 密码：`admin12345`
- 或者点页面上的「注册」，用任意邮箱+密码（至少 8 位）自己建一个账号。

### 怎么停止

把那两个黑色窗口关掉即可——它们的**标题栏**会写明「关闭此窗口 = 停止后端／前端」。关任意一个只停对应的那部分，**不会丢失任何数据**（数据都存在后端数据库里）；两个都关就完全停止。下次再用，再双击 `start.bat`。

### 常见问题

| 现象 | 解决办法 |
| --- | --- |
| 浏览器没自动打开 | 手动打开浏览器，访问 http://localhost:3000/login |
| 提示端口 3000 / 8000 被占用 | 关掉占用端口的程序，或重启电脑后重试 |
| 黑窗口一闪而过 | 右键 `start.bat` →「以管理员身份运行」；或把报错截图发给技术同学 |
| 第一次装环境装失败 | 重启电脑后再双击一次 `start.bat`（装完环境通常需要重启一次） |

---

## 方式二：一键启动（macOS / Linux）

**只需三步：**

1. 把项目下载/克隆到本地。
2. 打开项目文件夹，**双击 `start.command`**（访达里双击即可）。
3. 等一会儿，浏览器会**自动打开登录页**。

> 第一次双击 `.command` 文件，macOS 可能提示「无法打开，因为它来自身份不明的开发者」。
> 解决：**右键点 `start.command` → 选「打开」→ 在弹窗里再点「打开」**，之后就能正常双击了。
> 如果双击始终没反应，也可以打开「终端」，把项目拖进去，输入 `./start.command` 回车。

第一次启动会自动检测并安装 Python3 / Node.js（macOS 通过 [Homebrew](https://brew.sh)，没装会提示你先装），然后装好依赖，可能需要 5–10 分钟。

启动后这个终端窗口要**保持打开**，程序才在运行。**按 `Ctrl + C` 即可同时停止前后端**（比 Windows 还省事，不用关多个窗口）。

登录方式同上：管理员 `admin@ailurus.com` / `admin12345`，或自行注册。

### 常见问题（macOS）

| 现象 | 解决办法 |
| --- | --- |
| 提示「身份不明的开发者」 | 右键 `start.command` →「打开」→ 再点「打开」 |
| `command not found: brew` | 先装 Homebrew：https://brew.sh ，再双击一次 |
| 端口 3000 / 8000 被占用 | 关掉占用的程序，或重启后重试 |

---

## 关于图片生成（可选）

默认情况下，项目用的是 **mock 模式**：能跑通完整流程（注册、登录、上传、生成任务），但「生成」出来的图片只是把你上传的原图回显，**不会真正调用 AI 生成**。

想看到真正的 AI 出图效果，需要一个 Google Gemini 的 API Key：

1. 在 `api/` 文件夹里，复制 `.env.example` 为 `.env`。
2. 打开 `.env`，把 `NANOBANANA_API_KEY=` 后面填上你的 Key。
3. 重新双击 `start.bat`（Windows）或 `start.command`（macOS）。

> `.env` 文件已被 Git 忽略，不会被上传到 GitHub，Key 不会泄露。没有 Key 也完全不影响本地体验流程。

---

## 方式三：Docker 一键启动（跨平台，适合想要「生产级一致环境」的人）

如果你已经装了 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 并已启动，在项目根目录运行：

```powershell
docker compose up --build
```

这会同时起 **前端 + 后端 + 后台 worker + Postgres** 四个容器（worker 独立执行生成任务）。访问：

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:8000/health

停止：在该窗口按 `Ctrl + C`，或运行 `docker compose down`。

> 区别：方式一/二（`start.bat` / `start.command`）用本地 SQLite 文件当数据库，零配置、最轻量；Docker 方式用 Postgres，更接近线上生产环境。功能完全一致。

---

## 给开发者：手动启动（两个终端）

<details>
<summary>展开查看</summary>

**后端（端口 8000，SQLite 模式）—— Windows PowerShell：**

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:DATABASE_URL = "sqlite+aiosqlite:///./local.db"
$env:ADMIN_EMAIL = "admin@ailurus.com"
$env:ADMIN_PASSWORD = "admin12345"
.\.venv\Scripts\uvicorn main:app --reload --port 8000
```

**后端 —— macOS / Linux：**

```bash
cd api
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
export DATABASE_URL="sqlite+aiosqlite:///./local.db"
export ADMIN_EMAIL="admin@ailurus.com"
export ADMIN_PASSWORD="admin12345"
./.venv/bin/uvicorn main:app --reload --port 8000
```

**前端（端口 3000，两平台相同）：**

```bash
cd web
npm install
npm run dev
```

**端到端自检（后端起好后跑，仅 Windows 提供脚本）：**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-e2e.ps1
```

该脚本会自动验证注册 / 登录 / 上传 / 任务 / 鉴权 / 用户隔离 / 登出整条链路，全部通过会打印 `14 通过 / 0 失败`。

</details>
