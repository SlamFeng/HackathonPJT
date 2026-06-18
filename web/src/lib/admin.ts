// 管理员设置 + 全局配置状态的前端 API 客户端
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export type AdminSettings = {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  keySource: "runtime" | "env" | "none" | string;
  model: string;
  availableModels: string[];
  // 垂立调试链路（demo lane）
  demoLaneEnabled: boolean;
  demoLaneModel: string | null;
  demoLanePrompt: string | null;
};

export type ConfigStatus = {
  hasApiKey: boolean;
  model: string;
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

export const getConfigStatus = () => req<ConfigStatus>("/v1/config/status");
export const getAdminSettings = () => req<AdminSettings>("/v1/admin/settings");

// 只传需要修改的字段：传 apiKey:"" 表示清除；不传则不动
export const updateAdminSettings = (body: {
  apiKey?: string | null;
  model?: string;
  demoLaneEnabled?: boolean;
  demoLaneModel?: string | null;
  demoLanePrompt?: string | null;
}) => req<AdminSettings>("/v1/admin/settings", { method: "PUT", body: JSON.stringify(body) });
