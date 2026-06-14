"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { getUsageStats, type UsageStats } from "@/lib/credits";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export default function AdminUsagePage() {
  const { me, loading } = useAuth();
  const router = useRouter();
  const [s, setS] = useState<UsageStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  useEffect(() => {
    if (me?.role !== "admin") return;
    getUsageStats()
      .then(setS)
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, [me]);

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">需要管理员权限…</div>;
  }

  const maxJobs = s ? Math.max(1, ...s.last7days.map((d) => d.jobs)) : 1;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">用量统计（管理员）</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">整体概览</div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        {!s ? (
          <div className="py-8 text-center text-sm text-zinc-500">加载中…</div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="用户数" value={s.userCount} />
              <Stat label="任务总数" value={s.jobTotals.total} />
              <Stat label="成功率" value={s.successRate === null ? "—" : `${Math.round(s.successRate * 100)}%`} />
              <Stat label="进行中" value={s.jobTotals.running} />
              <Stat label="成功" value={s.jobTotals.succeeded} />
              <Stat label="失败" value={s.jobTotals.failed} />
              <Stat label="已消耗额度" value={s.credits.spent} />
              <Stat label="已发放额度" value={s.credits.granted} />
            </div>

            <div className="mt-6">
              <div className="text-sm font-medium">近 7 天任务量</div>
              <div className="mt-3 flex items-end gap-2" style={{ height: 120 }}>
                {s.last7days.length === 0 ? (
                  <div className="text-sm text-zinc-500">暂无数据</div>
                ) : (
                  s.last7days.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-col justify-end" style={{ height: 90 }}>
                        <div
                          className="w-full rounded-t bg-zinc-900"
                          style={{ height: `${(d.jobs / maxJobs) * 100}%` }}
                          title={`${d.jobs} 任务（成功 ${d.succeeded} / 失败 ${d.failed}）`}
                        />
                      </div>
                      <div className="text-[10px] text-zinc-500">{d.date}</div>
                      <div className="text-[10px] text-zinc-700">{d.jobs}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
