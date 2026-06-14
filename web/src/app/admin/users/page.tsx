"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { grantCredits, listAdminUsers, type AdminUser } from "@/lib/credits";

export default function AdminUsersPage() {
  const { me, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  async function load() {
    try {
      setUsers(await listAdminUsers());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    if (me?.role === "admin") void load();
  }, [me]);

  async function onGrant(u: AdminUser) {
    const raw = window.prompt(`给 ${u.email} 发放额度（正数充值，负数扣减）：`, "20");
    if (raw === null) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      const updated = await grantCredits(u.id, amount, "admin_grant");
      setUsers((prev) => (prev ? prev.map((x) => (x.id === u.id ? updated : x)) : prev));
    } catch (e) {
      alert(e instanceof Error ? e.message : "发放失败");
    }
  }

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">需要管理员权限…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">用户管理（管理员）</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">用户与额度</div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">邮箱</th>
                <th className="py-2 pr-3">角色</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">额度</th>
                <th className="py-2 pr-3">注册</th>
                <th className="py-2 pr-3">最近登录</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {!users ? (
                <tr><td colSpan={7} className="py-6 text-center text-zinc-500">加载中…</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{u.email}</td>
                    <td className="py-2 pr-3">{u.role === "admin" ? "管理员" : "用户"}</td>
                    <td className="py-2 pr-3">{u.status}</td>
                    <td className="py-2 pr-3 font-medium">{u.credits}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}</td>
                    <td className="py-2">
                      <button
                        onClick={() => onGrant(u)}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50"
                      >
                        发放额度
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
