"use client";

import { useMemo, useState } from "react";

import { uploadAsset } from "@/lib/api";
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

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<ClosetCategory>("top");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  async function handleUpload() {
    setError(null);
    setBusy(true);
    try {
      if (!file) throw new Error("请选择图片");
      if (file.size > 8 * 1024 * 1024) throw new Error("服装图需 ≤8MB");
      const uploaded = await uploadAsset(file);
      const item: ClosetItem = {
        id: uploaded.assetId,
        category,
        imageUrl: uploaded.url,
        favorited: false,
      };
      upsert(item);
      setFile(null);
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
        <div className="mt-1 text-xl font-semibold tracking-tight">上传单品白底图并分类管理</div>
        <div className="mt-2 text-sm text-zinc-600">单张图片 ≤8MB。上传后可在「工作室」中一键试穿。</div>

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
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB` : "建议：服装占画面大部分、光照均匀、边缘清晰"}
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
            <button
              className={[
                "mt-4 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
              ].join(" ")}
              onClick={handleUpload}
              disabled={!canSubmit}
            >
              {busy ? "上传中…" : "上传到衣橱"}
            </button>
            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          </div>
        </div>
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
                <button
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    item.favorited ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => toggleFavorite(item.id)}
                >
                  {item.favorited ? "已收藏" : "收藏"}
                </button>
              </div>
              <img src={item.imageUrl} alt="garment" className="mt-3 h-56 w-full rounded-2xl bg-zinc-50 object-contain" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
