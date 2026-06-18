// 额度（用户侧）+ 管理后台数据 API 客户端
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export type UsageEvent = {
  eventType: "grant" | "spend" | "refund" | string;
  amount: number;
  reason: string | null;
  jobId: string | null;
  createdAt: string;
};

export type MyCredits = { credits: number; events: UsageEvent[] };

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  credits: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AdminJob = {
  id: string;
  userEmail: string;
  jobType: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type UsageStats = {
  userCount: number;
  jobTotals: { total: number; succeeded: number; failed: number; running: number };
  successRate: number | null;
  credits: { spent: number; granted: number; refunded: number };
  last7days: Array<{ date: string; jobs: number; succeeded: number; failed: number }>;
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

export const getMyCredits = () => req<MyCredits>("/v1/me/credits");

export const listAdminUsers = () => req<AdminUser[]>("/v1/admin/users");
export const grantCredits = (userId: string, amount: number, reason?: string) =>
  req<AdminUser>(`/v1/admin/users/${userId}/grant`, { method: "POST", body: JSON.stringify({ amount, reason }) });
export const listAdminJobs = (status?: string) =>
  req<AdminJob[]>(`/v1/admin/jobs${status ? `?status=${status}` : ""}`);
export const getUsageStats = () => req<UsageStats>("/v1/admin/usage");
