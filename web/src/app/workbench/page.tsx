"use client";

import Link from "next/link";

import { useAppStore } from "@/stores/useAppStore";

export default function WorkbenchPage() {
  const avatar = useAppStore((s) => s.avatar);
  const closetCount = useAppStore((s) => s.closet.length);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500">全链路 MVP</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              数字人定制 · 姿态调试 · 虚拟试穿
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              UI 保持 ins 极简插画风，人物与试穿预览为写实输出，身份保持优先（nanobanana-first）。
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/avatar"
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
            >
              生成数字人
            </Link>
            <Link
              href="/studio"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              去试穿
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">数字人</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{avatar.avatarImageUrl ? "已生成" : "未生成"}</div>
          <div className="mt-4">
            {avatar.avatarImageUrl ? (
              <img src={avatar.avatarImageUrl} alt="avatar" className="h-44 w-full rounded-2xl bg-zinc-100 object-cover" />
            ) : (
              <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-zinc-50 text-xs text-zinc-500">
                去 /avatar 上传照片
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">个人衣橱</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{closetCount} 件</div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">上传白底单品图并分类管理，试穿时一键调用。</p>
          <Link
            href="/closet"
            className="mt-4 inline-flex rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            打开衣橱
          </Link>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">穿搭顾问</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">结构化建议 + 必带预览</div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            订单/衣橱数据 → 风格画像 → 天气&趋势 → 可直接试穿的搭配方案。
          </p>
          <Link
            href="/stylist"
            className="mt-4 inline-flex rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            查看建议
          </Link>
        </div>
      </section>
    </div>
  );
}

