"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** 当前选中的文件（受控）。父组件持有，便于上传后清空。 */
  file: File | null;
  /** 仅在文件「通过格式/大小校验」时回调有效 File；移除或非法时回调 null。 */
  onSelect: (file: File | null) => void;
  accept?: string; // 传给 <input accept>
  /** 允许的扩展名校验（小写，含点），默认 png/jpg/jpeg/webp */
  exts?: string[];
  maxBytes?: number;
  disabled?: boolean;
  /** 推荐尺寸（不阻断，仅在低于时给出温和提示） */
  recommendW?: number;
  recommendH?: number;
  hint?: string;
};

const DEFAULT_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/**
 * 带本地预览 + 即时校验的上传选择器。
 * 选中后立刻渲染缩略图（URL.createObjectURL，无需先上传），并当场校验格式/大小，
 * 不合格立刻标红且不向父级传递文件，避免「点了上传才报错」。
 */
export function UploadField({
  file,
  onSelect,
  accept = "image/png,image/jpeg,image/webp",
  exts = DEFAULT_EXTS,
  maxBytes = 10 * 1024 * 1024,
  disabled = false,
  recommendW,
  recommendH,
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // 本地预览 URL（随 file 变化创建/回收）
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 读出真实像素尺寸用于展示与「低于推荐」温和提示。
  // 仅在异步 onload 回调里 setState；清理时复位，避免在 effect 同步体内 setState。
  useEffect(() => {
    if (!previewUrl) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = previewUrl;
    return () => setDims(null);
  }, [previewUrl]);

  function validateAndSelect(f: File | null) {
    setError(null);
    if (!f) {
      onSelect(null);
      return;
    }
    if (!exts.includes(extOf(f.name))) {
      setError(`仅支持 ${exts.map((e) => e.slice(1)).join("/")} 格式`);
      onSelect(null);
      return;
    }
    if (f.size > maxBytes) {
      setError(`文件需 ≤${Math.round(maxBytes / 1024 / 1024)}MB（当前 ${(f.size / 1024 / 1024).toFixed(2)}MB）`);
      onSelect(null);
      return;
    }
    onSelect(f);
  }

  const belowRecommend =
    dims && recommendW && recommendH && (dims.w < recommendW || dims.h < recommendH);

  return (
    <div>
      {!file ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            validateAndSelect(e.dataTransfer.files?.[0] ?? null);
          }}
          className={[
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors",
            dragOver ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
            <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
          </svg>
          <div className="text-sm font-medium text-zinc-700">点击选择，或把图片拖到这里</div>
          <div className="text-xs text-zinc-500">{hint ?? `支持 ${exts.map((e) => e.slice(1)).join("/")}，≤${Math.round(maxBytes / 1024 / 1024)}MB`}</div>
        </button>
      ) : (
        <div className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-3">
          <img
            src={previewUrl ?? ""}
            alt="preview"
            className="h-28 w-24 shrink-0 rounded-xl bg-zinc-50 object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-800">{file.name}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {(file.size / 1024 / 1024).toFixed(2)}MB
              {dims ? ` · ${dims.w}×${dims.h}` : ""}
            </div>
            {belowRecommend ? (
              <div className="mt-1 text-xs text-amber-600">
                建议 ≥{recommendW}×{recommendH}，当前偏小可能影响效果
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                重新选择
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => validateAndSelect(null)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      )}

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => validateAndSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
