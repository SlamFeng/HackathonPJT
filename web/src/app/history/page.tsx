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
import { useT } from "@/i18n";

export default function HistoryPage() {
  const t = useT();
  const poseLabel = (key: string | null) =>
    key && POSES.some((p) => p.id === key) ? t(`pose.${key}`) : key ?? "—";
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
        <div className="text-xs text-zinc-500">{t("hi.kicker")}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t("hi.title")}</div>
        <div className="mt-2 text-sm text-zinc-600">{t("hi.desc")}</div>

        {/* 视图切换：按批次（交付单位）/ 按单图 */}
        <div className="mt-5 flex gap-2">
          {([
            { id: "batch", label: t("hi.view.batch") },
            { id: "single", label: t("hi.view.single") },
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
            <span className="text-xs text-zinc-500">{t("hi.filterModel")}</span>
            <button
              onClick={() => setAvatarFilter("all")}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                avatarFilter === "all" ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {t("hi.all")}
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
                {a.name || t("hi.modelN", { n: i + 1 })}
                {a.isDefault ? ` · ${t("av.default")}` : ""}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">{t("common.loading")}</div>
      ) : view === "batch" ? (
        batches.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
            {t("hi.emptyBatch")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {batches.map((b) => (
              <div key={b.batchId} className="rounded-3xl border border-zinc-200/70 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-800">
                      {t("hi.batchN", { n: b.total })}
                      <span className="ml-2 text-xs font-normal text-green-600">{t("hi.succeeded", { n: b.succeeded })}</span>
                      {b.failed ? <span className="ml-1 text-xs font-normal text-red-600">{t("hi.failed", { n: b.failed })}</span> : null}
                      {b.running + b.queued > 0 ? (
                        <span className="ml-1 text-xs font-normal text-amber-600">{t("hi.inProgress", { n: b.running + b.queued })}</span>
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
                    {zipBusyId === b.batchId ? t("wb.packing") : t("wb.downloadN", { n: b.succeeded })}
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
                  <div className="mt-3 text-xs text-zinc-400">{t("hi.batchNoSuccess")}</div>
                )}
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
          {t("hi.emptySingle")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => {
            const garment = r.closetItemId ? closetById.get(r.closetItemId) : undefined;
            const av = avatarById.get(r.avatarId);
            return (
              <div key={r.id} className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white">
                <img src={absUrl(r.imageUrl)} alt="tryon" className="h-64 w-full bg-zinc-50 object-contain" />
                <div className="space-y-1 p-3">
                  <div className="text-xs font-medium text-zinc-800">{t("hi.pose", { v: poseLabel(r.poseKey) })}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {t("hi.model", { v: av?.name || r.avatarId.slice(0, 8) })}
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {t("hi.product", { v: garment ? t(`cat.${garment.garmentType}`) : r.closetItemId?.slice(0, 8) ?? "—" })}
                  </div>
                  <div className="text-[11px] text-zinc-400">{new Date(r.updatedAt).toLocaleString()}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="/studio"
                      className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-50 hover:bg-zinc-800"
                    >
                      {t("act.refine")}
                    </a>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 hover:border-red-200 hover:text-red-600"
                    >
                      {t("common.delete")}
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
