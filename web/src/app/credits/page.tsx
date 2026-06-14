"use client";

import { useEffect, useState } from "react";

import { getMyCredits, type MyCredits } from "@/lib/credits";

const EVENT_LABEL: Record<string, string> = { grant: "发放", spend: "消费", refund: "退款" };

export default function CreditsPage() {
  const [data, setData] = useState<MyCredits | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMyCredits()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">我的额度</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-4xl font-semibold tracking-tight">{data ? data.credits : "—"}</div>
          <div className="pb-1 text-sm text-zinc-500">点 · 用于数字人/姿态/试穿等生成</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => alert("在线购买即将上线。当前可联系管理员为你充值额度。")}
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
          >
            购买额度
          </button>
          <span className="text-xs text-zinc-500">额度不足时无法发起生成。</span>
        </div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6">
        <div className="text-sm font-medium">额度明细</div>
        <div className="mt-3 divide-y divide-zinc-100">
          {!data ? (
            <div className="py-6 text-center text-sm text-zinc-500">加载中…</div>
          ) : data.events.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">暂无记录</div>
          ) : (
            data.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
                  <span className="ml-2 text-xs text-zinc-500">{e.reason ?? ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={e.amount >= 0 ? "text-green-600" : "text-zinc-700"}>
                    {e.amount >= 0 ? `+${e.amount}` : e.amount}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
