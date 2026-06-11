const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
};

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

export async function getMe(): Promise<Me | null> {
  const res = await fetch(`${API_BASE}/v1/auth/me`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}

export async function login(email: string, password: string): Promise<Me> {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, "登录失败"));
  return (await res.json()) as Me;
}

export async function register(email: string, password: string, displayName?: string): Promise<Me> {
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, displayName: displayName || null }),
  });
  if (!res.ok) throw new Error(await parseError(res, "注册失败"));
  return (await res.json()) as Me;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/v1/auth/logout`, { method: "POST", credentials: "include" });
}
