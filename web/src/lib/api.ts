export type JobType = "avatar_generate" | "pose_render" | "vton_tryon" | "outfit_render";
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function absUrl(pathOrUrl: string) {
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:")
  )
    return pathOrUrl;
  return `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export async function uploadAsset(file: File) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/v1/assets/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { assetId: string; url: string };
  return { assetId: data.assetId, url: absUrl(data.url) };
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
}) {
  const res = await fetch(`${API_BASE}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobType: input.jobType,
      providerPreference: input.providerPreference ?? "nanobanana_first",
      inputs: input.inputs,
      constraints: input.constraints ?? {},
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobResponse;
}

export async function getJob(jobId: string) {
  const res = await fetch(`${API_BASE}/v1/jobs/${jobId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobResponse;
}
