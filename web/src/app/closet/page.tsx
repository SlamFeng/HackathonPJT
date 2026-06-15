"use client";

import { useMemo, useState } from "react";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import { createClosetItem, deleteClosetItem, toggleFavoriteApi } from "@/lib/assets";
import { formatMessage, useI18n } from "@/lib/i18n";
import { ClosetCategory, ClosetItem, useAppStore } from "@/stores/useAppStore";

const categories: ClosetCategory[] = ["top", "pants", "skirt", "dress", "outerwear", "suit", "underwear", "shoes", "accessory"];

export default function ClosetPage() {
  const { t } = useI18n();
  const closet = useAppStore((s) => s.closet);
  const upsert = useAppStore((s) => s.upsertClosetItem);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const removeClosetItem = useAppStore((s) => s.removeClosetItem);

  async function handleToggleFavorite(id: string) {
    toggleFavorite(id); // 乐观更新
    try {
      await toggleFavoriteApi(id);
    } catch {
      toggleFavorite(id); // 失败回滚
    }
  }

  async function handleDelete(id: string) {
    removeClosetItem(id); // 乐观更新
    try {
      await deleteClosetItem(id);
    } catch {
      /* 删除失败：下次刷新会从服务端恢复 */
    }
  }

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<ClosetCategory>("top");
  // 处理方式：extract = 智能提取单品（默认）；direct = 已是干净商品图，直接上传
  const [mode, setMode] = useState<"extract" | "direct">("extract");
  const [directConfirmed, setDirectConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 直接上传必须勾选确认，避免把模特图/杂物图直接入库
  const canSubmit = useMemo(
    () => !!file && !busy && (mode === "extract" || directConfirmed),
    [file, busy, mode, directConfirmed],
  );

  async function handleUpload() {
    setError(null);
    setBusy(true);
    setProgress(0.05);
    try {
      if (!file) throw new Error(t.closet.selectImageError);
      if (file.size > 8 * 1024 * 1024) throw new Error(t.closet.fileTooLarge);
      const uploaded = await uploadAsset(file);
      setProgress(0.2);

      // extractedUrl / extractJobId 取决于处理方式（都用相对 /static 路径落库）
      let extractedUrl = uploaded.rawUrl;
      let extractJobId: string | undefined;
      if (mode === "extract") {
        const job = await createJob({
          jobType: "garment_extract",
          inputs: { imageUrl: uploaded.url, garmentCategory: category },
          constraints: { garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
        });
        const { image } = await waitForImageJob(job.jobId, {
          messages: t.common.job,
          onUpdate: (latest) => setProgress(Math.max(latest.progress ?? 0.2, 0.2)),
        });
        extractedUrl = image.url;
        extractJobId = job.jobId;
      }

      const saved = await createClosetItem({
        garmentType: category,
        extractedImageUrl: extractedUrl,
        originalImageUrl: uploaded.rawUrl,
        extractJobId,
      });
      const item: ClosetItem = {
        id: saved.id,
        category,
        imageUrl: absUrl(saved.extractedImageUrl),
        originalImageUrl: saved.originalImageUrl ? absUrl(saved.originalImageUrl) : undefined,
        favorited: saved.favorited,
      };
      upsert(item);
      setFile(null);
      setDirectConfirmed(false);
      setProgress(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.closet.fallbackError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.closet.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.closet.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.closet.description}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2 rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">{t.closet.chooseImage}</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-4 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-50 hover:file:bg-zinc-800"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <div className="mt-4 text-xs text-zinc-600">
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB` : t.closet.helper}
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">{t.closet.category}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    className={[
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => setCategory(c)}
                    disabled={busy}
                  >
                    {t.common.categories[c]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 处理方式：智能提取 vs 直接上传 */}
        <div className="mt-4">
          <div className="text-sm font-medium">{t.closet.processingMethod}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("extract")}
              disabled={busy}
              className={[
                "rounded-2xl border p-4 text-left transition-colors",
                mode === "extract" ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {t.closet.extractTitle}
                <span className={["rounded-full px-2 py-0.5 text-[10px]", mode === "extract" ? "bg-zinc-50 text-zinc-900" : "bg-zinc-900 text-zinc-50"].join(" ")}>{t.closet.recommended}</span>
              </div>
              <div className={["mt-1.5 text-xs leading-5", mode === "extract" ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                {t.closet.extractDescription}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("direct")}
              disabled={busy}
              className={[
                "rounded-2xl border p-4 text-left transition-colors",
                mode === "direct" ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{t.closet.directTitle}</div>
              <div className={["mt-1.5 text-xs leading-5", mode === "direct" ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                {t.closet.directDescription}
              </div>
            </button>
          </div>

          {mode === "direct" ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-900">{t.closet.directWarningTitle}</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                {t.closet.directWarningDescription}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800">
                <span>{t.closet.directGood}</span>
                <span>{t.closet.directBad}</span>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={directConfirmed}
                  onChange={(e) => setDirectConfirmed(e.target.checked)}
                  className="mt-0.5"
                  disabled={busy}
                />
                <span>{t.closet.directConfirm}</span>
              </label>
            </div>
          ) : null}
        </div>

        <button
          className={[
            "mt-5 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
            canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
          ].join(" ")}
          onClick={handleUpload}
          disabled={!canSubmit}
        >
          {busy
            ? formatMessage(mode === "extract" ? t.closet.extracting : t.closet.uploading, { progress: Math.round(progress * 100) })
            : mode === "extract"
              ? t.closet.uploadExtractButton
              : t.closet.uploadDirectButton}
        </button>
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {closet.length === 0 ? (
          <div className="md:col-span-3 rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
            {t.closet.empty}
          </div>
        ) : (
          closet.map((item) => (
            <div key={item.id} className="rounded-3xl border border-zinc-200/70 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">
                  {t.common.categories[item.category] ?? item.category}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      item.favorited ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => handleToggleFavorite(item.id)}
                  >
                    {item.favorited ? t.closet.favorited : t.closet.favorite}
                  </button>
                  <button
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-red-200 hover:text-red-600"
                    onClick={() => handleDelete(item.id)}
                  >
                    {t.closet.delete}
                  </button>
                </div>
              </div>
              <img src={item.imageUrl} alt={t.common.garmentAlt} className="mt-3 h-56 w-full rounded-2xl bg-zinc-50 object-contain" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
