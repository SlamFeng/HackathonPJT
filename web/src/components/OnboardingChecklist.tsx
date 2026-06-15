"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/useAppStore";

const DISMISS_KEY = "onboarding_dismissed_v1";

/**
 * 首登 3 步主线引导：① 创建模特 → ② 上传商品 → ③ 批量出图。
 * 数据驱动自动勾选已完成步骤；可关闭（记 localStorage，不重复打扰）。
 * 放在批量出图页顶部（登录默认落地页）。
 */
export function OnboardingChecklist() {
  const avatars = useAppStore((s) => s.avatars);
  const closet = useAppStore((s) => s.closet);
  const hydrated = useAppStore((s) => s.hydrated);
  const [dismissed, setDismissed] = useState(true); // 默认隐藏，避免首帧闪现

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const hasModel = avatars.length > 0;
  const hasProduct = closet.length > 0;
  const allDone = hasModel && hasProduct;

  // 已主动关闭，或数据已齐（两步都完成）则不再显示
  if (dismissed || !hydrated || allDone) return null;

  const steps = [
    { done: hasModel, label: "创建模特", hint: "上传一张全身照，生成可复用的模特", href: "/avatar", cta: "去创建" },
    { done: hasProduct, label: "上传商品", hint: "把新品图片传入商品库（支持智能提取）", href: "/closet", cta: "去上传" },
    { done: false, label: "批量出图", hint: "选模特+商品，一键生成整批上身图并打包下载", href: "/workbench", cta: "开始出图" },
  ];

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-gradient-to-b from-zinc-50 to-white p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">新手指引 · 三步出图</div>
          <div className="mt-0.5 text-xs text-zinc-500">按这三步走，几分钟就能产出第一批商品上身图。</div>
        </div>
        <button onClick={dismiss} className="rounded-full px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
          不再显示
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={[
              "rounded-2xl border p-4",
              s.done ? "border-green-200 bg-green-50/50" : "border-zinc-200 bg-white",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  s.done ? "bg-green-600 text-white" : "bg-zinc-900 text-zinc-50",
                ].join(" ")}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="text-sm font-medium text-zinc-800">{s.label}</span>
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">{s.hint}</div>
            {!s.done ? (
              <Link href={s.href} className="mt-3 inline-flex text-xs font-medium text-zinc-900 underline">
                {s.cta} →
              </Link>
            ) : (
              <div className="mt-3 text-xs text-green-600">已完成</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
