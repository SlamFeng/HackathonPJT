## 1. 架构设计
```mermaid
flowchart LR
  subgraph FE["前端服务层"]
    A["Next.js(Web)\n页面/状态/上传/进度"] -->|HTTPS| B["BFF/API Gateway"]
    A <-->|SSE/WS| C["任务进度通道"]
  end

  subgraph BE["后端业务层"]
    B --> AU["鉴权服务\nJWT + OAuth2 PKCE"]
    B --> U["用户与画像服务"]
    B --> CL["衣橱服务"]
    B --> OR["订单接入服务\nOAuth/Excel导入"]
    B --> ST["穿搭顾问编排器\nLLM+RAG+Agent"]
    B --> JB["任务编排与幂等\n重试/超时/降级"]
    C --> JB
  end

  subgraph AI["推理与工具层(可插拔)"]
    JB --> IP["InferenceProvider\nNanobanana/开源/ComfyUI(可选)"]
    IP --> NB["Nanobanana API\n(参考图/Mask/控制图/Seed)"]
    IP --> OS["开源推理服务\nPose(OpenPose)\nVTON(OOT/IDM)\n解析/分割"]
    ST --> LLM["LLM Router\n(主备模型)"]
    ST --> RAG["RAG检索服务\n向量检索+重排"]
    ST --> TOOL["工具调用\n天气/趋势/规则引擎"]
  end

  subgraph DS["数据存储层"]
    PG["PostgreSQL\n用户/衣橱/订单/任务"]:::db
    RD["Redis\n缓存/会话/队列后端"]:::db
    OBJ["对象存储\nS3/MinIO\n原图/结果图/中间产物"]:::db
    VDB["pgvector\n趋势知识向量库"]:::db
  end

  subgraph EXT["第三方接入层"]
    TB["淘宝 OAuth/订单API"]
    AMZ["Amazon SP-API"]
    WX["天气API(7天)"]
    TR["趋势源\nVOGUE/WGSN/自建语料"]
    KMS["KMS/Vault\n密钥与token加密"]
  end

  classDef db fill:#f6f6f6,stroke:#999,stroke-width:1px;

  AU --> KMS
  U --> PG
  CL --> PG
  OR --> PG
  JB --> PG
  JB --> RD
  IP --> OBJ
  RAG --> VDB
  OR --> TB
  OR --> AMZ
  TOOL --> WX
  TOOL --> TR
```

## 2. 技术选型说明
- 前端：Next.js + TypeScript + TailwindCSS；SSE（默认）/WebSocket（可选）用于任务进度
- BFF/API：FastAPI（Python）或 NestJS（Node）二选一；默认推荐 FastAPI（与推理生态更贴近）
- 异步任务：Celery + Redis（队列与重试），或后续演进到 Temporal（更强可观测）
- 数据库：PostgreSQL（含 pgvector 扩展用于向量检索）
- 对象存储：MinIO（本地/自建）或 S3（云端）
- 推理接入：统一 InferenceProvider 抽象；优先 Nanobanana 云端 API；姿态与换装保留开源强约束兜底
- 观测：OpenTelemetry Trace + 结构化日志；关键指标（P95耗时/失败率/质检通过率）

## 3. 路由定义
| 路由 | 用途 |
|------|------|
| / | 工作台：状态概览与入口 |
| /avatar | 数字人定制：上传与参数 |
| /studio | 姿态与试穿：姿态库 + 试穿 |
| /closet | 个人衣橱：上传/筛选/收藏 |
| /orders | 订单与授权：OAuth/Excel导入 |
| /stylist | AI穿搭顾问：建议列表与预览 |

## 4. API 定义（核心：任务化 + 可插拔推理）
### 4.1 数据类型（TypeScript）
```ts
export type JobType = "avatar_generate" | "pose_render" | "vton_tryon" | "outfit_render";

export type ProviderPreference = "nanobanana_first" | "open_source_first" | "comfyui_first";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface BodyParams {
  heightCm: number;
  weightKg: number;
  shoulderWidthCm?: number;
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
}

export interface JobCreateRequest {
  jobType: JobType;
  providerPreference: ProviderPreference;
  inputs: Record<string, unknown>;
  constraints?: {
    identityLock?: boolean;
    poseLock?: boolean;
    garmentLock?: boolean;
    seed?: number;
    qualityLevel?: "standard" | "high";
    timeoutSec?: number;
  };
}

export interface QualityScores {
  idSimilarity?: number;
  poseMatch?: number;
  boundaryF1?: number;
  artifactScore?: number;
}

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  stage?: string;
  progress?: number;
  artifacts?: Array<{ kind: "image" | "mask" | "json"; url: string; meta?: Record<string, unknown> }>;
  qualityScores?: QualityScores;
  error?: { code: string; message: string; detail?: Record<string, unknown> };
}
```

### 4.2 端点清单
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/jobs | 创建任务（avatar/pose/vton/outfit） |
| GET | /v1/jobs/{jobId} | 查询任务状态、进度、产物、质检分 |
| POST | /v1/assets/upload-url | 获取直传URL（图片/Excel） |
| POST | /v1/avatar/profile | 保存身体参数与当前数字人引用 |
| POST | /v1/closet/items | 创建衣橱单品（类目/图片/收藏） |
| POST | /v1/orders/oauth/{provider}/start | 发起OAuth（PKCE） |
| POST | /v1/orders/import/excel | 导入Excel（返回行级错误） |
| POST | /v1/stylist/recommendations | 生成穿搭建议（异步） |

## 5. 服务端架构图（FastAPI示例）
```mermaid
flowchart TD
  C1["Controller\n(API Routers)"] --> S1["Service\n(业务编排/权限/校验)"]
  S1 --> R1["Repository\n(PostgreSQL/对象存储)"]
  S1 --> Q1["Job Service\n(Celery/Redis)"]
  Q1 --> P1["InferenceProvider\n(可插拔)"]
  P1 --> N1["Nanobanana Adapter"]
  P1 --> O1["OpenSource Adapter"]
  S1 --> K1["RAG/LLM Service"]
  R1 --> D1["Database/Storage"]
```

## 6. 数据模型
### 6.1 ER 图
```mermaid
erDiagram
  USER ||--o{ AVATAR : has
  USER ||--o{ CLOSET_ITEM : owns
  USER ||--o{ ORDER : imports
  USER ||--o{ JOB : runs
  USER ||--o{ RECOMMENDATION : receives
  AVATAR ||--o{ JOB : used_in
  CLOSET_ITEM ||--o{ JOB : used_in

  USER {
    uuid id PK
    string email
    string display_name
    datetime created_at
  }
  AVATAR {
    uuid id PK
    uuid user_id FK
    json body_params
    string base_image_url
    string ref_face_url
    string current_pose_id
    datetime created_at
  }
  CLOSET_ITEM {
    uuid id PK
    uuid user_id FK
    string category
    string image_url
    string mask_url
    boolean favorited
    json garment_params
    datetime created_at
  }
  ORDER {
    uuid id PK
    uuid user_id FK
    string source
    string external_order_id
    json raw
    json normalized
    datetime purchased_at
  }
  JOB {
    uuid id PK
    uuid user_id FK
    string job_type
    string status
    string provider_used
    json inputs
    json constraints
    json quality_scores
    json artifacts
    int latency_ms
    datetime created_at
  }
  RECOMMENDATION {
    uuid id PK
    uuid user_id FK
    json outfit_plan
    string preview_image_url
    json evidence_refs
    datetime created_at
  }
```

### 6.2 DDL（概要）
```sql
create table users (
  id uuid primary key,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table avatars (
  id uuid primary key,
  user_id uuid not null references users(id),
  body_params jsonb not null,
  base_image_url text not null,
  ref_face_url text,
  current_pose_id text,
  created_at timestamptz not null default now()
);

create table closet_items (
  id uuid primary key,
  user_id uuid not null references users(id),
  category text not null,
  image_url text not null,
  mask_url text,
  favorited boolean not null default false,
  garment_params jsonb,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key,
  user_id uuid not null references users(id),
  source text not null,
  external_order_id text,
  raw jsonb not null,
  normalized jsonb,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, external_order_id)
);

create table jobs (
  id uuid primary key,
  user_id uuid not null references users(id),
  job_type text not null,
  status text not null,
  provider_used text,
  inputs jsonb not null,
  constraints jsonb,
  quality_scores jsonb,
  artifacts jsonb,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index jobs_user_created_idx on jobs(user_id, created_at desc);
create index closet_items_user_category_idx on closet_items(user_id, category);
```

## 7. Nanobanana-first 推理策略（定稿）
### 7.1 能力开关（你已确认支持）
- 参考人脸/参考图：支持（用于 identityLock）
- Mask 编辑：支持（用于局部修复/增强而不改轮廓）
- 控制图输入：支持（用于 OpenPose/边缘/深度等）
- 可重复参数：支持（seed/strength/guidance）
- 限流与超时：按供应商策略配置（后端实现自适应退避与降级）

### 7.2 任务质量门控（默认阈值，后续用标注集校准）
- avatar_generate：idSimilarity ≥ 0.75；artifactScore ≥ 0.6；不通过→最多2次重试→仍失败则降级返回最近一次可用头像
- pose_render：poseMatch ≥ 0.95 且 idSimilarity ≥ 0.75；不通过→切到开源 OpenPose 强约束→必要时再用 nanobanana 做细节增强（mask 约束）
- vton_tryon：boundaryF1 ≥ 0.92 且无穿模规则命中；不通过→同模型重试1次→切换备选VTON模型→仍失败则降级占位预览并后台补算

