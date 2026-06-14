"use client";

import { useMemo, useState } from "react";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import { formatMessage, useI18n } from "@/lib/i18n";
import { ClosetCategory, ClosetItem, useAppStore } from "@/stores/useAppStore";

const categories: Array<{ id: ClosetCategory }> = [
  { id: "top" },
  { id: "pants" },
  { id: "skirt" },
  { id: "dress" },
  { id: "outerwear" },
  { id: "suit" },
  { id: "underwear" },
  { id: "shoes" },
  { id: "accessory" },
];

export default function ClosetPage() {
  const { t } = useI18n();
  const closet = useAppStore((s) => s.closet);
  const upsert = useAppStore((s) => s.upsertClosetItem);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<ClosetCategory>("top");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  async function handleUpload() {
    setError(null);
    setBusy(true);
    setProgress(0.05);
    try {
      if (!file) throw new Error(t.closet.selectImageError);
      if (file.size > 8 * 1024 * 1024) throw new Error(t.closet.fileTooLarge);
      const uploaded = await uploadAsset(file);
      setProgress(0.15);

      const job = await createJob({
        jobType: "garment_extract",
        inputs: { imageUrl: uploaded.url, garmentCategory: category },
        constraints: { garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      const { image } = await waitForImageJob(job.jobId, {
        messages: t.common.job,
        onUpdate: (latest) => setProgress(Math.max(latest.progress ?? 0.15, 0.15)),
      });

      const item: ClosetItem = {
        id: uploaded.assetId,
        category,
        imageUrl: absUrl(image.url),
        originalImageUrl: uploaded.url,
        favorited: false,
      };
      upsert(item);
      setFile(null);
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
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    className={[
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => setCategory(c.id)}
                    disabled={busy}
                  >
                    {t.common.categories[c.id]}
                  </button>
                );
              })}
            </div>
            <button
              className={[
                "mt-4 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
              ].join(" ")}
              onClick={handleUpload}
              disabled={!canSubmit}
            >
              {busy ? formatMessage(t.closet.processing, { progress: Math.round(progress * 100) }) : t.closet.uploadButton}
            </button>
            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          </div>
        </div>
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
                <button
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    item.favorited ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => toggleFavorite(item.id)}
                >
                  {item.favorited ? t.closet.favorited : t.closet.favorite}
                </button>
              </div>
              <img src={item.imageUrl} alt={t.common.garmentAlt} className="mt-3 h-56 w-full rounded-2xl bg-zinc-50 object-contain" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
