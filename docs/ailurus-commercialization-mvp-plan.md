# Ailurus AI 试衣平台商业化 MVP 改造计划

本文档基于当前 `ailurus/mainline` 分支状态撰写，目标是在不推翻现有原型的前提下，把项目逐步改造成可上线、可运营、可持续迭代的最小可用商业平台。

当前项目已经具备以下核心能力：

- Next.js 前端工作台：数字人生成、衣橱上传、工作室姿态切换、试穿预览。
- FastAPI 后端：上传接口、任务接口、SSE 任务状态流、静态资源服务。
- Gemini / NanoBanana 图像生成链路：数字人生成、姿态图生成、商品图单品提取、虚拟试穿。
- 调试日志页面：可查看每次图像任务的 prompt、轮次、token usage、输入输出图片和最终状态。
- 工作室体验优化：姿态缓存、试穿图缓存、数字人生成后并发预生成姿态、单个姿态重新生成。

商业化 MVP 的重点不是一次性做成完整 SaaS，而是先完成一个可以真实用户试用、可以控制成本、可以定位问题、可以逐步收费的最小平台。

## 1. MVP 目标

### 1.1 产品目标

在 MVP 阶段，平台应支持用户完成一条完整闭环：

1. 用户注册 / 登录。
2. 创建或上传自己的数字人。
3. 上传商品图片并按商品类型提取目标单品。
4. 在固定姿态集合中生成试穿预览。
5. 保存历史结果，之后可以再次查看、重新生成或删除。
6. 平台记录每次生成任务的状态、成本、token、耗时和失败原因。
7. 管理员可以排查异常任务并了解整体消耗。

### 1.2 商业目标

MVP 需要为后续收费和运营保留基础能力：

- 每个用户拥有独立账号和资源空间。
- 每次生成都能归属到用户、任务、图片、额度消耗。
- 可以限制免费额度，避免 API 成本失控。
- 可以统计用户留存、生成成功率、失败率、平均成本。
- 可以在不重写系统的情况下接入支付、套餐、企业客户管理。

### 1.3 非目标

以下能力不建议放入第一版 MVP：

- 多租户企业后台。
- 复杂团队协作。
- 自训练模型或私有模型部署。
- 高级商品库 ERP 对接。
- 完整营销 CMS。
- 大规模推荐系统。
- 完整 A/B 实验平台。

这些能力可以在 Beta 或 Commercial v1 阶段逐步追加。

## 2. 当前架构与主要缺口

### 2.1 当前架构

当前项目结构：

```text
web/                 Next.js 前端
api/                 FastAPI 后端
api/app/main.py      API 路由与任务执行入口
api/app/store.py     内存任务存储
api/app/models.py    请求 / 响应模型
api/app/inference/   Gemini 图像生成实现
api/app/prompts.py   生成 prompt
api/app/generation_logs.py  本地图像生成日志
api/storage/         本地图片文件
api/data/generation_logs/  本地 JSON 日志
```

现有代码适合开发验证，但还不是可上线平台。主要原因是用户、资源、任务和日志都没有生产级持久化与隔离。

### 2.2 上线前必须补齐的缺口

| 模块 | 当前状态 | MVP 要求 |
| --- | --- | --- |
| 用户系统 | 无正式账号体系 | 注册、登录、会话、用户资源隔离 |
| 数据库 | 任务主要在内存和本地 JSON | PostgreSQL 保存用户、资产、任务、日志索引 |
| 图片存储 | 本地 `api/storage/` | 对象存储，支持 CDN 和权限控制 |
| 异步任务 | 请求内直接执行 / 内存状态 | 后台队列执行，可重试、可恢复 |
| 额度成本 | 未系统化 | 每次任务记录 token、调用次数、额度消耗 |
| 管理后台 | 仅 debug 页面 | 管理员查看用户、任务、失败日志 |
| 安全 | 开发环境为主 | API key 隔离、鉴权、上传校验、删除策略 |
| 部署 | 本地启动 | Docker 化、环境变量、日志、健康检查 |

## 3. MVP 功能范围

### 3.1 用户与权限

第一版只需要两类角色：

- `user`：普通用户，可以管理自己的数字人、衣橱和试穿结果。
- `admin`：管理员，可以查看所有任务、失败日志和系统统计。

MVP 鉴权建议：

- 邮箱 + 密码注册登录。
- 密码使用 `bcrypt` 或 `argon2` 哈希。
- 前端使用 HttpOnly Cookie 保存 session。
- 后端所有用户资源接口必须校验 `current_user_id`。
- 管理接口必须校验 `role = admin`。

可选但建议保留字段：

- `email_verified_at`：后续接邮箱验证。
- `disabled_at`：封禁或停用账号。
- `last_login_at`：用户活跃统计。

### 3.2 用户工作台

MVP 前端保留现有主流程，但需要加入用户维度：

- 登录页：`/login`
- 注册页：`/register`
- 工作台首页：`/workbench`
- 数字人生成页：复用当前数字人输入表单。
- 衣橱页：上传商品图，选择商品类型，生成干净单品图。
- 工作室页：姿态预览、试穿预览、重新生成。
- 历史结果页：查看过去的数字人、衣橱、试穿任务。

当前浏览器本地状态可以继续作为即时 UI 缓存，但用户数据必须以服务端数据库为准。

### 3.3 数字人资产

每个用户可以拥有多个数字人。MVP 可以先限制为默认使用最近一个数字人，后续再支持命名、收藏、删除、版本管理。

数字人需要保存：

- 原始参数。
- 原始生成任务 ID。
- 最终图片 URL。
- 生成状态。
- 创建时间。
- 是否为默认数字人。

### 3.4 衣橱资产

上传衣橱时应继续沿用当前改造方向：根据用户选择的商品类型，在上传阶段提取目标单品，试穿环节只使用已经处理好的干净单品图。

衣橱项需要保存：

- 用户上传的原始图片。
- 提取后的单品图片。
- 商品类型：上衣、裤子、外套、裙装、连衣裙等。
- 商品名称。
- 生成任务 ID。
- 处理状态。
- 失败原因。

这能让试穿 prompt 更稳定，也能减少每次试穿的重复成本。

### 3.5 姿态图与试穿图

当前已经有姿态缓存与试穿缓存，MVP 需要把这些缓存从前端状态升级为服务端记录。

姿态图记录：

- 所属用户。
- 所属数字人。
- 姿态 key。
- 图片 URL。
- 任务 ID。
- 状态。
- 是否由系统预生成。

试穿图记录：

- 所属用户。
- 所属数字人。
- 所属姿态图。
- 所属衣橱单品。
- 图片 URL。
- 任务 ID。
- 状态。
- 是否用户主动重新生成。

用户切换姿态时：

- 姿态图存在且成功：直接展示。
- 姿态图生成中：展示加载状态，禁用试穿按钮。
- 姿态图失败：展示失败状态和重新生成按钮。
- 试穿图存在且成功：直接展示。
- 试穿图不存在：显示“请点击一键试穿”。
- 试穿图生成中：展示加载状态，禁用重复提交或显示覆盖确认。

## 4. 数据库设计

MVP 推荐 PostgreSQL。Python 侧建议使用 SQLAlchemy 2.x + Alembic，或者 FastAPI 常见的 SQLModel。为了生产可控，建议优先 SQLAlchemy + Alembic。

### 4.1 核心表

#### users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| email | varchar | 唯一 |
| password_hash | varchar | 密码哈希 |
| display_name | varchar | 显示名 |
| role | varchar | `user` / `admin` |
| status | varchar | `active` / `disabled` |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |
| last_login_at | timestamptz | 最近登录 |

#### sessions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 用户 ID |
| token_hash | varchar | session token 哈希 |
| expires_at | timestamptz | 过期时间 |
| created_at | timestamptz | 创建时间 |
| revoked_at | timestamptz | 撤销时间 |

#### avatars

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| name | varchar | 名称 |
| image_url | text | 数字人图片 |
| params_json | jsonb | 身体参数和表单输入 |
| source_job_id | uuid | 生成任务 |
| is_default | boolean | 是否默认 |
| status | varchar | 状态 |
| created_at | timestamptz | 创建时间 |

#### closet_items

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| name | varchar | 商品名 |
| garment_type | varchar | 商品类型 |
| original_image_url | text | 原始商品图 |
| extracted_image_url | text | 提取后的单品图 |
| extract_job_id | uuid | 提取任务 |
| status | varchar | 状态 |
| created_at | timestamptz | 创建时间 |

#### pose_renders

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| avatar_id | uuid | 数字人 |
| pose_key | varchar | 姿态 |
| image_url | text | 姿态图 |
| job_id | uuid | 任务 |
| status | varchar | 状态 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

#### tryon_results

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| avatar_id | uuid | 数字人 |
| pose_render_id | uuid | 姿态图 |
| closet_item_id | uuid | 衣橱单品 |
| image_url | text | 试穿图 |
| job_id | uuid | 任务 |
| status | varchar | 状态 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

#### jobs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| job_type | varchar | 任务类型 |
| status | varchar | `queued` / `running` / `succeeded` / `failed` |
| input_json | jsonb | 输入 |
| result_json | jsonb | 输出 |
| error_message | text | 错误 |
| retry_count | integer | 重试次数 |
| idempotency_key | varchar | 幂等键 |
| created_at | timestamptz | 创建时间 |
| started_at | timestamptz | 开始时间 |
| finished_at | timestamptz | 完成时间 |

#### generation_logs

本地 JSON 日志适合开发期，MVP 建议拆成数据库索引 + 对象存储详情文件。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键，通常等于 job_id |
| user_id | uuid | 所属用户 |
| job_id | uuid | 任务 ID |
| job_type | varchar | 任务类型 |
| status | varchar | 状态 |
| provider | varchar | Gemini / NanoBanana |
| model | varchar | 模型 |
| remote_calls | integer | 远程调用次数 |
| round_count | integer | self-check 轮数 |
| total_tokens | integer | 总 token |
| prompt_tokens | integer | 输入 token |
| output_tokens | integer | 输出 token |
| detail_url | text | 完整日志 JSON 对象存储地址 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

#### usage_events

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| user_id | uuid | 所属用户 |
| job_id | uuid | 对应任务 |
| event_type | varchar | `credit_grant` / `credit_spend` / `refund` |
| amount | integer | 额度变化 |
| reason | varchar | 原因 |
| meta_json | jsonb | 额外信息 |
| created_at | timestamptz | 创建时间 |

第一版可以先只做额度扣减，不急于接支付。支付接入前，管理员可以手动给用户发放额度。

## 5. 后端改造计划

### 5.1 API 分层

建议把当前 `api/app/main.py` 中的逻辑拆分：

```text
api/app/api/              路由层
api/app/services/         业务服务
api/app/db/               数据库连接、模型、迁移
api/app/tasks/            异步任务定义
api/app/storage/          对象存储适配
api/app/inference/        图像生成供应商
api/app/auth/             鉴权与 session
```

拆分原则：

- 路由只做参数校验、鉴权和调用 service。
- service 负责数据库写入、状态流转和额度扣减。
- task worker 负责真正的图像生成。
- inference 层继续保持供应商可替换。

### 5.2 任务系统

MVP 推荐 Redis + RQ 或 Celery。若希望轻量，先用 RQ；若后续任务类型会很多，直接 Celery。

任务提交流程：

1. 前端请求创建任务。
2. 后端校验用户、额度、输入图片权限。
3. 创建 `jobs` 记录，状态为 `queued`。
4. 将任务推入 Redis 队列。
5. worker 拉取任务，状态改为 `running`。
6. 调用 Gemini / NanoBanana。
7. 保存输出图片到对象存储。
8. 更新业务表和 `jobs`。
9. 写入 `generation_logs`。
10. 前端通过轮询或 SSE 获取状态。

MVP 可以保留现有 SSE，但状态来源应从内存改为数据库。

### 5.3 幂等与重试

图像生成成本高，必须避免重复提交导致重复扣费。

建议：

- 前端每次创建任务携带 `idempotencyKey`。
- 同一用户、同一任务类型、同一 key 在短时间内只创建一次任务。
- 任务失败可重试，但要记录 `retry_count`。
- 供应商超时、无图返回、内容安全拒绝、输出未变化应区分错误类型。

当前试穿链路已经加入未变化检测和补救策略，MVP 中应继续保留：

- 如果试穿输出和姿态输入差异过小，说明换装可能失败。
- 优先进行一次更直接的远程重试。
- 只有远程重试仍失败时，才进入最后兜底策略。
- 日志中必须记录每次重试原因和最终选择。

### 5.4 对象存储

本地 `api/storage/` 应替换为对象存储：

- 开发环境：MinIO 或继续本地存储。
- 生产环境：S3、Cloudflare R2、阿里云 OSS、腾讯云 COS 均可。

存储路径建议：

```text
users/{user_id}/uploads/{asset_id}/original.png
users/{user_id}/closet/{closet_item_id}/extracted.png
users/{user_id}/avatars/{avatar_id}/avatar.png
users/{user_id}/poses/{pose_render_id}.png
users/{user_id}/tryons/{tryon_result_id}.png
generation-logs/{job_id}.json
```

图片访问策略：

- MVP 可先使用带签名的临时 URL。
- 如果需要公开分享，再单独生成 public share token。
- 不要把用户私有图片永久暴露在无鉴权静态目录。

### 5.5 额度与成本控制

MVP 不必立刻接支付，但必须有额度系统。

建议规则：

- 新用户默认赠送固定额度，例如 20 次生成。
- 数字人生成、姿态生成、单品提取、试穿分别消耗不同额度。
- 失败且无有效输出的任务可自动退还额度。
- 用户主动重新生成需要再次扣额度。
- 后台显示用户剩余额度和历史消耗。

额度扣减要发生在任务入队前，任务失败后的退款由后端处理，避免并发情况下超额使用。

## 6. 前端改造计划

### 6.1 路由

建议 MVP 前端路由：

```text
/login
/register
/workbench
/workbench/avatar
/workbench/closet
/workbench/studio
/workbench/history
/debug/generation-logs
/admin
```

`/debug/generation-logs` 保持直接 URL 访问，不放入普通用户导航。上线后应要求 admin 权限。

### 6.2 状态管理

当前 Zustand 状态适合单会话原型。MVP 建议：

- 服务端保存真实数据。
- Zustand 只保存当前会话 UI 状态。
- 页面初始化时从 API 拉取用户资产。
- 图片生成中的状态由任务 API 或 SSE 驱动。

### 6.3 关键交互

工作室页需要继续保持以下体验：

- 姿态未生成完成前，禁用一键试穿。
- 姿态生成失败时，展示单独重新生成按钮。
- 试穿结果已存在时，切换回来直接展示。
- 试穿结果不存在时，展示明确空状态。
- 用户点击重新试穿时，覆盖旧结果前显示生成中状态。

历史页最小功能：

- 按时间查看试穿结果。
- 按数字人 / 衣橱单品筛选。
- 删除单条结果。
- 重新打开到工作室继续生成。

## 7. 管理后台与 Debug 能力

MVP 管理后台只需要面向内部人员，不需要漂亮复杂。

### 7.1 管理后台页面

建议页面：

- `/admin/users`：用户列表、额度、注册时间、最近登录。
- `/admin/jobs`：任务列表、状态、耗时、失败原因。
- `/admin/generation-logs`：复用当前 debug 日志能力。
- `/admin/usage`：按日统计调用次数、token、成功率。

### 7.2 关键指标

上线后每天至少观察：

- 新用户数。
- 活跃用户数。
- 数字人生成成功率。
- 姿态生成成功率。
- 试穿生成成功率。
- 平均每次任务 token。
- 平均每次任务耗时。
- 失败任务 Top N 原因。
- 单用户异常高频调用。

## 8. 安全与合规

### 8.1 API Key

- Gemini / NanoBanana API key 只能存在后端环境变量。
- 不得写入 Git。
- 不得返回给前端。
- 生产环境应通过部署平台 secret 管理。

### 8.2 上传文件安全

上传接口需要：

- 限制文件类型：JPEG、PNG、WebP。
- 限制文件大小。
- 检查 MIME 和实际文件头。
- 为每个文件生成随机 ID。
- 不信任用户上传文件名。

### 8.3 用户图片与隐私

用户上传真人照片和商品图属于敏感资产，MVP 至少要提供：

- 用户只能访问自己的图片。
- 用户可以删除数字人、衣橱和试穿记录。
- 删除后数据库标记删除，并异步清理对象存储。
- 隐私政策说明图片用途、保存时间、第三方模型调用。

### 8.4 内容安全

MVP 需要基础限制：

- 禁止未成年人、裸露、色情、违法内容。
- 对失败或拒绝生成的供应商响应做明确提示。
- 管理员可查看异常任务但不能泄露用户隐私给无关人员。

## 9. 部署方案

### 9.1 MVP 推荐部署拓扑

```text
Next.js Web
  |
FastAPI API
  |
PostgreSQL
Redis
Worker
Object Storage
Gemini / NanoBanana API
```

### 9.2 Docker 化

建议新增：

```text
docker-compose.yml
api/Dockerfile
web/Dockerfile
```

开发 compose 包含：

- web
- api
- worker
- postgres
- redis
- minio

生产部署可以使用：

- Vercel / Cloudflare Pages 部署前端。
- Render / Fly.io / Railway / ECS 部署 API 和 worker。
- Supabase / Neon / RDS 作为 PostgreSQL。
- Upstash / Redis Cloud 作为 Redis。
- R2 / S3 / OSS 作为对象存储。

### 9.3 环境变量

后端生产环境变量：

```text
APP_ENV=production
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
NANOBANANA_API_KEY=
NANOBANANA_MODEL=
NANOBANANA_ENDPOINT=
OBJECT_STORAGE_PROVIDER=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_REGION=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
PUBLIC_ASSET_BASE_URL=
```

前端生产环境变量：

```text
NEXT_PUBLIC_API_BASE_URL=
```

## 10. 开发阶段计划

### Phase 0：当前原型稳定化

目标：保证现有本地链路稳定，作为后续迁移基线。

任务：

- 保留当前姿态缓存、试穿缓存、并发姿态预生成。
- 保留上传衣橱时提取目标单品的逻辑。
- 保留生成日志页面。
- 建立试穿回归测试脚本或测试清单。
- 明确所有任务类型和 prompt 版本。

验收：

- 本地可完成数字人、衣橱、姿态、试穿完整流程。
- 6 个姿态各至少 3 次试穿，结果稳定可用。
- Debug 日志能看到完整轮次、token 和图片流。

### Phase 1：用户系统与数据库

目标：从单机原型变成多用户可隔离平台。

任务：

- 接入 PostgreSQL。
- 新增 Alembic 迁移。
- 实现 `users`、`sessions`。
- 实现注册、登录、退出、当前用户 API。
- 前端接入登录态。
- 给现有资产接口加用户隔离。

验收：

- 两个用户互相看不到对方图片和任务。
- 未登录用户不能访问工作台 API。
- 登录 session 可过期和退出。

### Phase 2：资产持久化

目标：数字人、衣橱、姿态、试穿结果都进入数据库。

任务：

- 新增 `avatars`。
- 新增 `closet_items`。
- 新增 `pose_renders`。
- 新增 `tryon_results`。
- 前端页面从 API 拉取资产。
- 保留 Zustand 作为 UI 缓存。

验收：

- 刷新页面后历史资产仍存在。
- 切换设备登录后能看到自己的历史资产。
- 删除资产后前端和后端状态一致。

### Phase 3：异步任务队列

目标：图像生成从请求线程迁移到后台 worker。

任务：

- 新增 Redis。
- 新增 worker 进程。
- 新增 `jobs` 表。
- 任务创建、入队、执行、失败、重试全链路入库。
- SSE / 轮询从数据库读取状态。
- 图像任务支持幂等键。

验收：

- API 重启后不会丢失已创建任务。
- worker 重启后任务可以继续或失败可见。
- 重复点击不会创建多条相同任务。

### Phase 4：对象存储与访问控制

目标：替换本地静态文件，支持生产环境图片保存。

任务：

- 新增对象存储适配器。
- 上传图片写入对象存储。
- 生成结果写入对象存储。
- 前端使用签名 URL 或受控 URL 展示图片。
- 删除资产时清理对象存储。

验收：

- 关闭本地静态目录后，图片仍可通过对象存储访问。
- 用户不能访问不属于自己的私有图片。
- 删除后图片不可继续访问。

### Phase 5：额度、后台与上线准备

目标：控制成本并支持小规模真实用户试用。

任务：

- 新增 `usage_events`。
- 新用户赠送额度。
- 图像任务扣额度。
- 失败任务退款。
- 管理员手动发放额度。
- 管理后台查看用户、任务、日志和消耗。
- 部署 Docker 与生产环境变量。
- 完成隐私政策、服务条款、用户删除能力。

验收：

- 额度不足时不能创建新任务。
- 每个任务都能查到对应消耗。
- 管理员能定位失败任务。
- 生产环境可稳定完成完整流程。

## 11. MVP 验收标准

MVP 可以上线内测时，应满足：

- 用户可以注册、登录、退出。
- 用户可以生成数字人。
- 用户可以上传商品图并得到提取后的单品图。
- 用户可以生成所有预设姿态。
- 用户可以对任意已完成姿态生成试穿图。
- 用户可以查看历史试穿结果。
- 用户资源互相隔离。
- 每次生成任务都有任务记录、日志记录、token 记录。
- 失败任务能在后台定位到原因。
- API key 不暴露到前端和 Git。
- 生产环境使用数据库、对象存储和后台 worker。
- 有基础额度限制，避免无限生成。

## 12. 后续商业化迭代方向

MVP 稳定后，可以按优先级继续迭代：

1. 支付与套餐：Stripe、微信支付、支付宝、企业月结。
2. 商品库增强：批量上传、SKU、分类、标签、搜索。
3. 分享与导出：公开分享链接、水印、高清下载。
4. 企业后台：品牌方商品管理、团队成员、权限。
5. 质量评分：自动检测换装失败、人体变形、商品偏差。
6. Prompt 版本管理：每次任务记录 prompt version，便于回归。
7. 多供应商模型：Gemini、OpenAI 图像、可替代图像供应商。
8. 成本优化：缓存、批处理、低成本预览、高成本高清图。
9. 审核系统：用户上传内容和生成结果风控。
10. 数据分析：转化漏斗、活跃度、生成偏好、失败原因趋势。

## 13. 推荐近期任务清单

近期最建议按以下顺序执行：

1. 把当前任务模型、资产模型和日志模型整理成数据库 schema。
2. 接入 PostgreSQL + Alembic。
3. 完成邮箱密码登录和 session。
4. 把数字人、衣橱、姿态、试穿结果迁移到服务端持久化。
5. 接入 Redis worker，把图像生成移出请求线程。
6. 接入对象存储。
7. 增加额度系统。
8. 把 debug 日志页面改成 admin-only。
9. 准备 Docker compose 和生产部署文档。
10. 开始小规模内测。

这条路线的核心原则是：先让平台能安全地服务真实用户，再逐步做更完整的商业能力。当前项目已有不错的图像生成体验基础，下一步最关键的是把“本地原型状态”升级为“用户可持久使用的服务状态”。
