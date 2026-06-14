"use client";

import { useMemo, useState } from "react";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import { createClosetItem, deleteClosetItem, toggleFavoriteApi } from "@/lib/assets";
import { ClosetCategory, ClosetItem, useAppStore } from "@/stores/useAppStore";

const categories: Array<{ id: ClosetCategory; label: string }> = [
  { id: "top", label: "上衣" },
  { id: "pants", label: "裤子" },
  { id: "skirt", label: "裙子" },
  { id: "dress", label: "连衣裙" },
  { id: "outerwear", label: "外套" },
  { id: "suit", label: "套装" },
  { id: "underwear", label: "贴身衣物" },
  { id: "shoes", label: "鞋子" },
  { id: "accessory", label: "配饰" },
];

export default function ClosetPage() {
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
      if (!file) throw new Error("请选择图片");
      if (file.size > 8 * 1024 * 1024) throw new Error("服装图需 ≤8MB");
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
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">个人衣橱</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">上传服装单品到衣橱</div>
        <div className="mt-2 text-sm text-zinc-600">
          单张图片 ≤8MB。可让系统<strong>智能提取</strong>成干净单品图，或当图片本身就是干净商品图时<strong>直接上传</strong>。处理完成后在「工作室」一键试穿。
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2 rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">选择图片</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-4 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-50 hover:file:bg-zinc-800"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <div className="mt-4 text-xs text-zinc-600">
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB` : "支持模特图或白底商品图；选好分类与处理方式后上传"}
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">分类</div>
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
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 处理方式：智能提取 vs 直接上传 */}
        <div className="mt-4">
          <div className="text-sm font-medium">处理方式</div>
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
                智能提取单品
                <span className={["rounded-full px-2 py-0.5 text-[10px]", mode === "extract" ? "bg-zinc-50 text-zinc-900" : "bg-zinc-900 text-zinc-50"].join(" ")}>推荐</span>
              </div>
              <div className={["mt-1.5 text-xs leading-5", mode === "extract" ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                图里有<strong>模特 / 人体 / 背景 / 杂物</strong>时选这个。系统自动抠出干净的服装单品图，试穿效果最好。
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
              <div className="text-sm font-medium">已是干净商品图，直接上传</div>
              <div className={["mt-1.5 text-xs leading-5", mode === "direct" ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                仅当图片是<strong>纯色 / 白底、只有服装本体、无模特无杂物</strong>时用。跳过提取，秒入库。
              </div>
            </button>
          </div>

          {mode === "direct" ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-900">⚠️ 直接上传前请确认图片是干净的商品图</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                若图中含<strong>模特或杂物</strong>，试穿会出现「衣服穿在别人身上」「版型错乱」等问题。这种情况请改用「智能提取单品」。
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800">
                <span>✓ 纯色/白底、只有服装本体</span>
                <span>✗ 含模特/人体/复杂背景</span>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={directConfirmed}
                  onChange={(e) => setDirectConfirmed(e.target.checked)}
                  className="mt-0.5"
                  disabled={busy}
                />
                <span>我确认这是干净的商品图（无模特、无杂物）</span>
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
            ? `${mode === "extract" ? "提取处理中" : "上传中"}... ${Math.round(progress * 100)}%`
            : mode === "extract"
              ? "提取单品并上传到衣橱"
              : "直接上传到衣橱"}
        </button>
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {closet.length === 0 ? (
          <div className="md:col-span-3 rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
            暂无单品。先上传一件衣服开始试穿。
          </div>
        ) : (
          closet.map((item) => (
            <div key={item.id} className="rounded-3xl border border-zinc-200/70 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">
                  {categories.find((c) => c.id === item.category)?.label ?? item.category}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      item.favorited ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => handleToggleFavorite(item.id)}
                  >
                    {item.favorited ? "已收藏" : "收藏"}
                  </button>
                  <button
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-red-200 hover:text-red-600"
                    onClick={() => handleDelete(item.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
              <img src={item.imageUrl} alt="garment" className="mt-3 h-56 w-full rounded-2xl bg-zinc-50 object-contain" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
