"use client";

import { useEffect, useMemo, useState } from "react";

import { absUrl, exportJobsZip, listBatches, type BatchSummary } from "@/lib/api";
import {
  deleteTryon,
  listAvatars,
  listClosetItems,
  listTryons,
  type AvatarRecord,
  type ClosetItemRecord,
  type TryonRecord,
} from "@/lib/assets";
import { POSES } from "@/stores/useAppStore";

const poseLabel = (key: string | null) => POSES.find((p) => p.id === key)?.label ?? key ?? "—";

export default function HistoryPage() {
  const [tryons, setTryons] = useState<TryonRecord[]>([]);
  const [avatars, setAvatars] = useState<AvatarRecord[]>([]);
  const [closet, setCloset] = useState<ClosetItemRecord[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [avatarFilter, setAvatarFilter] = useState<string>("all");
  const [view, setView] = useState<"batch" | "single">("batch");
  const [loading, setLoading] = useState(true);
  const [zipBusyId, setZipBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [t, a, c, b] = await Promise.all([listTryons(), listAvatars(), listClosetItems(), listBatches()]);
      setTryons(t);
      setAvatars(a);
      setCloset(c);
      setBatches(b);
    } finally {
      setLoading(false);
    }
  }

  async function downloadBatch(b: BatchSummary) {
    setZipBusyId(b.batchId);
    try {
      await exportJobsZip(b.jobIds);
    } catch {
      /* 忽略：可能本批暂无成功结果 */
    } finally {
      setZipBusyId(null);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const closetById = useMemo(() => new Map(closet.map((c) => [c.id, c])), [closet]);
  const avatarById = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);

  const filtered = useMemo(
    () => (avatarFilter === "all" ? tryons : tryons.filter((t) => t.avatarId === avatarFilter)),
    [tryons, avatarFilter],
  );

  async function handleDelete(id: string) {
    setTryons((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTryon(id);
    } catch {
      void reload();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">出图记录</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">我的上身图</div>
        <div className="mt-2 text-sm text-zinc-600">这里的记录已保存在服务器，刷新或换设备登录都还在。</div>

        {/* 视图切换：按批次（交付单位）/ 按单图 */}
        <div className="mt-5 flex gap-2">
          {([
            { id: "batch", label: "按批次" },
            { id: "single", label: "按单图" },
          ] as const).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={[
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                view === v.id ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "single" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">按模特筛选：</span>
            <button
              onClick={() => setAvatarFilter("all")}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                avatarFilter === "all" ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              全部
            </button>
            {avatars.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setAvatarFilter(a.id)}
                className={[
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  avatarFilter === a.id ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
                ].join(" ")}
              >
                {a.name || `模特 ${i + 1}`}
                {a.isDefault ? " · 默认" : ""}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">加载中…</div>
      ) : view === "batch" ? (
        batches.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
            暂无批次记录。去「批量出图」产出第一批上身图吧。
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {batches.map((b) => (
              <div key={b.batchId} className="rounded-3xl border border-zinc-200/70 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-800">
                      批次 · {b.total} 张
                      <span className="ml-2 text-xs font-normal text-green-600">成功 {b.succeeded}</span>
                      {b.failed ? <span className="ml-1 text-xs font-normal text-red-600">失败 {b.failed}</span> : null}
                      {b.running + b.queued > 0 ? (
                        <span className="ml-1 text-xs font-normal text-amber-600">进行中 {b.running + b.queued}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      {b.createdAt ? new Date(b.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => downloadBatch(b)}
                    disabled={b.succeeded === 0 || zipBusyId === b.batchId}
                    className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {zipBusyId === b.batchId ? "打包中…" : `打包下载 ${b.succeeded} 张`}
                  </button>
                </div>
                {b.thumbnails.length > 0 ? (
                  <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {b.thumbnails.map((url, i) => (
                      <img
                        key={i}
                        src={absUrl(url)}
                        alt="result"
                        className="aspect-[3/4] w-full rounded-xl bg-zinc-50 object-contain"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-zinc-400">该批次暂无成功出图</div>
                )}
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
          暂无出图记录。去「批量出图」产出第一批上身图吧。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((t) => {
            const garment = t.closetItemId ? closetById.get(t.closetItemId) : undefined;
            const av = avatarById.get(t.avatarId);
            return (
              <div key={t.id} className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white">
                <img src={absUrl(t.imageUrl)} alt="tryon" className="h-64 w-full bg-zinc-50 object-contain" />
                <div className="space-y-1 p-3">
                  <div className="text-xs font-medium text-zinc-800">姿态：{poseLabel(t.poseKey)}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    模特：{av?.name || t.avatarId.slice(0, 8)}
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">
                    商品：{garment ? garment.garmentType : t.closetItemId?.slice(0, 8) ?? "—"}
                  </div>
                  <div className="text-[11px] text-zinc-400">{new Date(t.updatedAt).toLocaleString()}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="/studio"
                      className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-50 hover:bg-zinc-800"
                    >
                      去精修
                    </a>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 hover:border-red-200 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
