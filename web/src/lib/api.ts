export type JobType = "avatar_generate" | "pose_render" | "garment_extract" | "vton_tryon" | "outfit_render";
export type ProviderPreference = "nanobanana_first" | "open_source_first" | "comfyui_first";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type JobResponse = {
  jobId: string;
  status: JobStatus;
  stage?: string;
  progress?: number;
  artifacts?: Array<{ kind: "image" | "mask" | "json"; url: string; meta?: Record<string, unknown> }>;
  qualityScores?: {
    idSimilarity?: number;
    poseMatch?: number;
    boundaryF1?: number;
    artifactScore?: number;
  };
  error?: { code: string; message: string; detail?: Record<string, unknown> };
};

export type GenerationAttempt = {
  model: string;
  status: "succeeded" | "failed";
  startedAtMs?: number;
  finishedAtMs?: number;
  durationMs?: number;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    [key: string]: unknown;
  } | null;
  error?: string;
};

export type GenerationRound = {
  roundIndex: number;
  kind: "initial_generation" | "self_correction" | string;
  prompt: string;
  inputImageUrls: string[];
  inputPartCount?: number;
  outputImageUrl?: string | null;
  attempts: GenerationAttempt[];
  error?: string;
};

export type GenerationLogSummary = {
  remoteCallCount: number;
  successfulCallCount: number;
  failedCallCount: number;
  roundCount: number;
  selfCorrectionUsed: boolean;
  totalTokenCount?: number | null;
};

export type GenerationLogListItem = {
  id: string;
  jobId?: string;
  task: JobType;
  status: "running" | "succeeded" | "failed" | string;
  createdAtMs: number;
  updatedAtMs: number;
  finalImageUrl?: string | null;
  summary?: GenerationLogSummary;
};

export type GenerationLogDetail = GenerationLogListItem & {
  inputs: Record<string, unknown>;
  constraints?: Record<string, unknown> | null;
  rounds: GenerationRound[];
  meta?: Record<string, unknown>;
  error?: string | null;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// 统一携带会话 Cookie；遇到 401 自动跳转登录页。
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login") &&
    !window.location.pathname.startsWith("/register")
  ) {
    window.location.href = "/login";
  }
  return res;
}

export function absUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  return `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export async function uploadAsset(file: File) {
  const form = new FormData();
  form.append("file", file);

  const res = await apiFetch(`${API_BASE}/v1/assets/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { assetId: string; url: string };
  // url: 绝对地址（用于直接展示）；rawUrl: 相对路径 /v1/files/<key>（用于落库，便于跨主机部署）
  return { assetId: data.assetId, url: absUrl(data.url), rawUrl: data.url };
}

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createJob(input: {
  jobType: JobType;
  providerPreference?: ProviderPreference;
  inputs: Record<string, unknown>;
  constraints?: {
    identityLock?: boolean;
    poseLock?: boolean;
    garmentLock?: boolean;
    seed?: number;
    qualityLevel?: "standard" | "high";
    timeoutSec?: number;
  };
  // 幂等键：默认每次提交生成一个新 UUID（防止网络重试重复创建）；
  // 调用方可显式传入稳定的 key，对同一逻辑操作做去重。
  idempotencyKey?: string;
}) {
  const res = await apiFetch(`${API_BASE}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobType: input.jobType,
      providerPreference: input.providerPreference ?? "nanobanana_first",
      inputs: input.inputs,
      constraints: input.constraints ?? {},
      idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
    }),
  });
  if (!res.ok) {
    let msg = await res.text();
    try {
      const d = JSON.parse(msg);
      if (d?.detail) msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }
  // 扣了额度，通知顶栏刷新余额
  if (typeof window !== "undefined") window.dispatchEvent(new Event("credits-changed"));
  return (await res.json()) as JobResponse;
}

export type BatchJobItem = {
  jobType: JobType;
  providerPreference?: ProviderPreference;
  inputs: Record<string, unknown>;
  constraints?: {
    identityLock?: boolean;
    poseLock?: boolean;
    garmentLock?: boolean;
    seed?: number;
    qualityLevel?: "standard" | "high";
    timeoutSec?: number;
  };
  idempotencyKey?: string;
};

export type BatchJobResponse = {
  jobs: JobResponse[];
  batchId: string;
  charged: number;
  duplicates: number;
};

export type BatchSummary = {
  batchId: string;
  createdAt: string;
  jobType?: string;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
  thumbnails: string[];
  jobIds: string[];
};

// 出图记录「按批次」：列出本用户的所有批量出图分组。
export async function listBatches() {
  const res = await apiFetch(`${API_BASE}/v1/batches`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as BatchSummary[];
}

// 批量出图：一次提交多个生成任务。后端先按总额度原子扣减，余额不足整批拒绝（402）。
export async function createJobsBatch(items: BatchJobItem[]) {
  const res = await apiFetch(`${API_BASE}/v1/jobs/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobs: items.map((it) => ({
        jobType: it.jobType,
        providerPreference: it.providerPreference ?? "nanobanana_first",
        inputs: it.inputs,
        constraints: it.constraints ?? {},
        idempotencyKey: it.idempotencyKey ?? newIdempotencyKey(),
      })),
    }),
  });
  if (!res.ok) {
    let msg = await res.text();
    try {
      const d = JSON.parse(msg);
      if (d?.detail) msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("credits-changed"));
  return (await res.json()) as BatchJobResponse;
}

// 把若干任务的成功出图打包成 ZIP 并触发浏览器下载。
export async function exportJobsZip(jobIds: string[]) {
  const res = await apiFetch(`${API_BASE}/v1/exports/zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
  if (!res.ok) {
    let msg = await res.text();
    try {
      const d = JSON.parse(msg);
      if (d?.detail) msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tryon_batch.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getJob(jobId: string) {
  const res = await apiFetch(`${API_BASE}/v1/jobs/${jobId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobResponse;
}

export async function waitForImageJob(
  jobId: string,
  options?: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
    minProgress?: number;
    onUpdate?: (job: JobResponse) => void;
  },
) {
  const maxWaitMs = options?.maxWaitMs ?? 5 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 350;
  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const latest = await getJob(jobId);
    options?.onUpdate?.(latest);

    if (latest.status === "succeeded") {
      const image = latest.artifacts?.find((a) => a.kind === "image");
      if (!image?.url) throw new Error("未返回图片");
      return { job: latest, image };
    }
    if (latest.status === "failed") {
      throw new Error(latest.error?.message ?? "任务失败");
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("任务超时（等待超过 5 分钟）");
}

export async function listGenerationLogs(limit = 50) {
  const res = await apiFetch(`${API_BASE}/v1/debug/generation-logs?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { logs: GenerationLogListItem[] };
  return data.logs;
}

export async function getGenerationLog(logId: string) {
  const res = await apiFetch(`${API_BASE}/v1/debug/generation-logs/${logId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as GenerationLogDetail;
}
