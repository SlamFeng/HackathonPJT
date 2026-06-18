// Phase 2 资产持久化的前端 API 客户端。所有请求带 cookie（credentials:include）。
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export type AvatarRecord = {
  id: string;
  name: string | null;
  imageUrl: string;
  paramsJson?: Record<string, unknown> | null;
  isDefault: boolean;
  status: string;
  createdAt: string;
};

export type ClosetItemRecord = {
  id: string;
  name: string | null;
  garmentType: string;
  originalImageUrl: string | null;
  extractedImageUrl: string;
  favorited: boolean;
  createdAt: string;
};

export type PoseRecord = {
  id: string;
  avatarId: string;
  poseKey: string;
  imageUrl: string;
  status: string;
  updatedAt: string;
};

export type TryonRecord = {
  id: string;
  avatarId: string;
  poseRenderId: string | null;
  closetItemId: string | null;
  poseKey: string | null;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// 数字人
export const createAvatar = (body: {
  imageUrl: string;
  name?: string;
  paramsJson?: Record<string, unknown>;
  sourceJobId?: string;
  makeDefault?: boolean;
}) => req<AvatarRecord>("/v1/avatars", { method: "POST", body: JSON.stringify(body) });

export const listAvatars = () => req<AvatarRecord[]>("/v1/avatars");
export const setDefaultAvatar = (id: string) => req<AvatarRecord>(`/v1/avatars/${id}/default`, { method: "POST" });
export const deleteAvatar = (id: string) => req<void>(`/v1/avatars/${id}`, { method: "DELETE" });

// 衣橱
export const createClosetItem = (body: {
  garmentType: string;
  extractedImageUrl: string;
  originalImageUrl?: string;
  name?: string;
  extractJobId?: string;
}) => req<ClosetItemRecord>("/v1/closet-items", { method: "POST", body: JSON.stringify(body) });

export const listClosetItems = () => req<ClosetItemRecord[]>("/v1/closet-items");
export const deleteClosetItem = (id: string) => req<void>(`/v1/closet-items/${id}`, { method: "DELETE" });
export const toggleFavoriteApi = (id: string) => req<ClosetItemRecord>(`/v1/closet-items/${id}/favorite`, { method: "POST" });

// 姿态
export const upsertPose = (avatarId: string, poseKey: string, body: { imageUrl: string; jobId?: string }) =>
  req<PoseRecord>(`/v1/avatars/${avatarId}/poses/${poseKey}`, {
    method: "PUT",
    body: JSON.stringify({ poseKey, ...body }),
  });

export const listPoses = (avatarId: string) => req<PoseRecord[]>(`/v1/avatars/${avatarId}/poses`);

// 试穿
export const createTryon = (body: {
  avatarId: string;
  imageUrl: string;
  poseRenderId?: string;
  closetItemId?: string;
  poseKey?: string;
  jobId?: string;
}) => req<TryonRecord>("/v1/tryon-results", { method: "POST", body: JSON.stringify(body) });

export const listTryons = (avatarId?: string) =>
  req<TryonRecord[]>(`/v1/tryon-results${avatarId ? `?avatarId=${avatarId}` : ""}`);

export const deleteTryon = (id: string) => req<void>(`/v1/tryon-results/${id}`, { method: "DELETE" });
