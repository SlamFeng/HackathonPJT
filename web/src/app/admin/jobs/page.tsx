"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { listAdminJobs, type AdminJob } from "@/lib/credits";
import { useI18n } from "@/lib/i18n";

const STATUSES = ["", "queued", "running", "succeeded", "failed"];
const badge: Record<string, string> = {
  succeeded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-amber-100 text-amber-700",
  queued: "bg-zinc-100 text-zinc-600",
};

export default function AdminJobsPage() {
  const { t, locale } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  useEffect(() => {
    if (me?.role !== "admin") return;
    let cancelled = false;
    listAdminJobs(status || undefined)
      .then((next) => {
        if (!cancelled) setJobs(next);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : t.admin.loadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [me, status, t.admin.loadFailed]);

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">{t.admin.needAdmin}</div>;
  }

  const statusLabels = t.admin.statusLabels;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.adminJobs.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.adminJobs.title}</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s || "all"}
              onClick={() => {
                setJobs(null);
                setStatus(s);
              }}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                status === s ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {statusLabels[s as keyof typeof statusLabels] ?? s}
            </button>
          ))}
        </div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">{t.adminJobs.user}</th>
                <th className="py-2 pr-3">{t.adminJobs.type}</th>
                <th className="py-2 pr-3">{t.adminJobs.status}</th>
                <th className="py-2 pr-3">{t.adminJobs.created}</th>
                <th className="py-2">{t.adminJobs.errorReason}</th>
              </tr>
            </thead>
            <tbody>
              {!jobs ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">{t.common.loading}</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">{t.adminJobs.empty}</td></tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{j.userEmail}</td>
                    <td className="py-2 pr-3">{j.jobType}</td>
                    <td className="py-2 pr-3">
                      <span className={["rounded-full px-2 py-0.5 text-xs", badge[j.status] ?? "bg-zinc-100"].join(" ")}>
                        {statusLabels[j.status as keyof typeof statusLabels] ?? j.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{new Date(j.createdAt).toLocaleString(locale)}</td>
                    <td className="py-2 max-w-xs truncate text-xs text-red-600" title={j.errorMessage ?? ""}>
                      {j.errorMessage ?? ""}
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
