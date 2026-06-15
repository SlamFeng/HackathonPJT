"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { grantCredits, listAdminUsers, type AdminUser } from "@/lib/credits";
import { formatMessage, useI18n } from "@/lib/i18n";

export default function AdminUsersPage() {
  const { t, locale } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  useEffect(() => {
    if (me?.role !== "admin") return;
    let cancelled = false;
    listAdminUsers()
      .then((next) => {
        if (!cancelled) setUsers(next);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : t.admin.loadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [me, t.admin.loadFailed]);

  async function onGrant(u: AdminUser) {
    const raw = window.prompt(formatMessage(t.adminUsers.grantPrompt, { email: u.email }), "20");
    if (raw === null) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      const updated = await grantCredits(u.id, amount, "admin_grant");
      setUsers((prev) => (prev ? prev.map((x) => (x.id === u.id ? updated : x)) : prev));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t.adminUsers.grantFailed);
    }
  }

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">{t.admin.needAdmin}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.adminUsers.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.adminUsers.title}</div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">{t.adminUsers.email}</th>
                <th className="py-2 pr-3">{t.adminUsers.role}</th>
                <th className="py-2 pr-3">{t.adminUsers.status}</th>
                <th className="py-2 pr-3">{t.adminUsers.credits}</th>
                <th className="py-2 pr-3">{t.adminUsers.registered}</th>
                <th className="py-2 pr-3">{t.adminUsers.lastLogin}</th>
                <th className="py-2">{t.adminUsers.actions}</th>
              </tr>
            </thead>
            <tbody>
              {!users ? (
                <tr><td colSpan={7} className="py-6 text-center text-zinc-500">{t.common.loading}</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{u.email}</td>
                    <td className="py-2 pr-3">{u.role === "admin" ? t.admin.roles.admin : t.admin.roles.user}</td>
                    <td className="py-2 pr-3">{u.status}</td>
                    <td className="py-2 pr-3 font-medium">{u.credits}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{new Date(u.createdAt).toLocaleDateString(locale)}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString(locale) : "—"}</td>
                    <td className="py-2">
                      <button
                        onClick={() => onGrant(u)}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50"
                      >
                        {t.adminUsers.grant}
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
