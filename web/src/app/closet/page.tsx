"use client";

import { useEffect, useMemo, useState } from "react";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import { createClosetItem, deleteClosetItem, toggleFavoriteApi } from "@/lib/assets";
import { ClosetCategory, ClosetItem, useAppStore } from "@/stores/useAppStore";
import { NextStepBar } from "@/components/NextStepBar";

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

const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const MAX_BYTES = 8 * 1024 * 1024;

type FileStatus = "pending" | "uploading" | "extracting" | "done" | "failed";
const STATUS_LABEL: Record<FileStatus, string> = {
  pending: "排队",
  uploading: "上传中",
  extracting: "提取中",
  done: "完成",
  failed: "失败",
};

export default function ClosetPage() {
  const closet = useAppStore((s) => s.closet);
  const upsert = useAppStore((s) => s.upsertClosetItem);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const removeClosetItem = useAppStore((s) => s.removeClosetItem);

  async function handleToggleFavorite(id: string) {
    toggleFavorite(id);
    try {
      await toggleFavoriteApi(id);
    } catch {
      toggleFavorite(id);
    }
  }

  async function handleDelete(id: string) {
    removeClosetItem(id);
    try {
      await deleteClosetItem(id);
    } catch {
      /* 删除失败：下次刷新会从服务端恢复 */
    }
  }

  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<ClosetCategory>("top");
  // 默认智能提取（对卖家最稳）；「这些都是干净商品图」可整批跳过提取
  const [mode, setMode] = useState<"extract" | "direct">("extract");
  const [directConfirmed, setDirectConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Record<number, FileStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 选中文件的本地预览（随 files 变化创建/回收）
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  const canSubmit = files.length > 0 && !busy && (mode === "extract" || directConfirmed);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setDone(null);
    const incoming = Array.from(list);
    const valid: File[] = [];
    let rejected = 0;
    for (const f of incoming) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!EXTS.includes(ext) || f.size > MAX_BYTES) {
        rejected++;
        continue;
      }
      valid.push(f);
    }
    setError(rejected ? `已忽略 ${rejected} 个不合格文件（仅支持 ${EXTS.map((e) => e.slice(1)).join("/")}，≤8MB）` : null);
    if (valid.length) setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadBatch() {
    setError(null);
    setDone(null);
    setBusy(true);
    const init: Record<number, FileStatus> = {};
    files.forEach((_, i) => (init[i] = "pending"));
    setStatus(init);

    // 逐张处理（顺序执行，避免一次性打满供应商；失败不影响其它）
    const results: FileStatus[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i]!;
      try {
        setStatus((s) => ({ ...s, [i]: "uploading" }));
        const uploaded = await uploadAsset(f);
        let extractedUrl = uploaded.rawUrl;
        let extractJobId: string | undefined;
        if (mode === "extract") {
          setStatus((s) => ({ ...s, [i]: "extracting" }));
          const job = await createJob({
            jobType: "garment_extract",
            inputs: { imageUrl: uploaded.url, garmentCategory: category },
            constraints: { garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
          });
          const { image } = await waitForImageJob(job.jobId);
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
        setStatus((s) => ({ ...s, [i]: "done" }));
        results[i] = "done";
      } catch {
        setStatus((s) => ({ ...s, [i]: "failed" }));
        results[i] = "failed";
      }
    }

    const ok = results.filter((r) => r === "done").length;
    const fail = results.filter((r) => r === "failed").length;
    setBusy(false);
    setDone({ ok, fail });
    setDirectConfirmed(false);
    // 仅保留失败的文件，便于重试；成功的已入库
    setFiles((prev) => prev.filter((_, i) => results[i] === "failed"));
    setStatus({});
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">商品库</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">批量上传新品到商品库</div>
        <div className="mt-2 text-sm text-zinc-600">
          可一次选多张（单张 ≤8MB）。默认<strong>智能提取</strong>成干净单品图；若整批都是干净商品图可勾选<strong>直接上传</strong>。处理完成后到「批量出图」一键产出整批上身图。
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 多选拖拽区 + 已选缩略图队列 */}
          <div className="md:col-span-2 rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">选择图片（可多选）</div>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!busy) addFiles(e.dataTransfer.files);
              }}
              className={[
                "mt-4 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragOver ? "border-zinc-900 bg-white" : "border-zinc-300 hover:border-zinc-400 hover:bg-white",
                busy ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
              </svg>
              <div className="text-sm font-medium text-zinc-700">点击选择多张，或把图片拖进来</div>
              <div className="text-xs text-zinc-500">支持 png/jpg/jpeg/webp，单张 ≤8MB</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>

            {files.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>已选 {files.length} 张</span>
                  {!busy ? (
                    <button onClick={() => setFiles([])} className="underline hover:text-zinc-700">
                      全部清空
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {files.map((f, i) => {
                    const st = status[i];
                    return (
                      <div key={`${f.name}-${i}`} className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white">
                        <img src={previews[i]} alt={f.name} className="h-16 w-full object-contain" />
                        {st ? (
                          <div
                            className={[
                              "absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px]",
                              st === "done"
                                ? "bg-green-100 text-green-700"
                                : st === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700",
                            ].join(" ")}
                          >
                            {STATUS_LABEL[st]}
                          </div>
                        ) : null}
                        {!busy ? (
                          <button
                            onClick={() => removeFile(i)}
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[10px] text-zinc-500 ring-1 ring-zinc-200 hover:text-red-600"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">分类（应用于本次全部）</div>
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

        {/* 处理方式：智能提取（默认） vs 直接上传 */}
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
              <div className="text-sm font-medium">这些都是干净商品图，直接上传</div>
              <div className={["mt-1.5 text-xs leading-5", mode === "direct" ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                仅当本批图片都是<strong>纯色 / 白底、只有服装本体、无模特无杂物</strong>时用。跳过提取，秒入库。
              </div>
            </button>
          </div>

          {mode === "direct" ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-900">⚠️ 直接上传前请确认本批都是干净的商品图</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                若图中含<strong>模特或杂物</strong>，试穿会出现「衣服穿在别人身上」「版型错乱」等问题。这种情况请改用「智能提取单品」。
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={directConfirmed}
                  onChange={(e) => setDirectConfirmed(e.target.checked)}
                  className="mt-0.5"
                  disabled={busy}
                />
                <span>我确认本批都是干净的商品图（无模特、无杂物）</span>
              </label>
            </div>
          ) : null}
        </div>

        <button
          className={[
            "mt-5 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
            canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
          ].join(" ")}
          onClick={handleUploadBatch}
          disabled={!canSubmit}
        >
          {busy
            ? `处理中…（${Object.values(status).filter((s) => s === "done").length}/${files.length}）`
            : mode === "extract"
              ? `提取并上传 ${files.length || ""} 张`
              : `直接上传 ${files.length || ""} 张`}
        </button>
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        {done ? (
          <div className="mt-3 text-sm text-zinc-700">
            已入库 <strong>{done.ok}</strong> 件
            {done.fail ? <span className="text-red-600">，失败 {done.fail} 件（已保留可重试）</span> : null}。
          </div>
        ) : null}
      </div>

      {done && done.ok > 0 ? (
        <NextStepBar text={`已上传 ${done.ok} 件新品，去批量出图产出整批上身图。`} href="/workbench" cta="去批量出图" />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {closet.length === 0 ? (
          <div className="md:col-span-3 rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
            商品库还是空的。上传新品后即可到「批量出图」一键产出上身图。
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
