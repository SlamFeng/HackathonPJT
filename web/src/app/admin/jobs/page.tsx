"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { listAdminJobs, type AdminJob } from "@/lib/credits";

const STATUSES = ["", "queued", "running", "succeeded", "failed"];
const STATUS_LABEL: Record<string, string> = {
  "": "全部", queued: "排队", running: "执行中", succeeded: "成功", failed: "失败",
};
const badge: Record<string, string> = {
  succeeded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-amber-100 text-amber-700",
  queued: "bg-zinc-100 text-zinc-600",
};

export default function AdminJobsPage() {
  const { me, loading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  async function load(s: string) {
    setJobs(null);
    try {
      setJobs(await listAdminJobs(s || undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    if (me?.role === "admin") void load(status);
  }, [me, status]);

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">需要管理员权限…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">任务监控（管理员）</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">全部生成任务</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                status === s ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">用户</th>
                <th className="py-2 pr-3">类型</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">创建</th>
                <th className="py-2">失败原因</th>
              </tr>
            </thead>
            <tbody>
              {!jobs ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">加载中…</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">暂无任务</td></tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{j.userEmail}</td>
                    <td className="py-2 pr-3">{j.jobType}</td>
                    <td className="py-2 pr-3">
                      <span className={["rounded-full px-2 py-0.5 text-xs", badge[j.status] ?? "bg-zinc-100"].join(" ")}>
                        {STATUS_LABEL[j.status] ?? j.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{new Date(j.createdAt).toLocaleString()}</td>
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
