"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName);
      await refresh();
      router.push("/workbench");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-neutral-900">注册 Ailurus</h1>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-900"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">昵称（可选）</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-900"
            placeholder="店铺名 / 昵称"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">密码（至少 8 位）</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-900"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "注册中…" : "注册"}
        </button>
        <p className="text-center text-sm text-neutral-500">
          已有账号？{" "}
          <a href="/login" className="text-neutral-900 underline">
            登录
          </a>
        </p>
      </form>
    </div>
  );
}
