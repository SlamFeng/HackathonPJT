"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/stores/useAppStore";

export default function WorkbenchPage() {
  const { t } = useI18n();
  const avatar = useAppStore((s) => s.avatar);
  const closetCount = useAppStore((s) => s.closet.length);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500">{t.workbench.eyebrow}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              {t.workbench.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              {t.workbench.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/avatar"
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
            >
              {t.workbench.createAvatar}
            </Link>
            <Link
              href="/studio"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              {t.workbench.tryOn}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t.workbench.avatarCard}</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{avatar.avatarImageUrl ? t.common.generated : t.common.notGenerated}</div>
          <div className="mt-4">
            {avatar.avatarImageUrl ? (
              <img src={avatar.avatarImageUrl} alt={t.common.avatarAlt} className="h-44 w-full rounded-2xl bg-zinc-100 object-cover" />
            ) : (
              <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-zinc-50 text-xs text-zinc-500">
                {t.workbench.uploadAtAvatar}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t.workbench.closetCard}</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">
            {closetCount} {t.common.itemUnit}
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{t.workbench.closetDescription}</p>
          <Link
            href="/closet"
            className="mt-4 inline-flex rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t.workbench.openCloset}
          </Link>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t.workbench.stylistCard}</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{t.workbench.stylistStatus}</div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {t.workbench.stylistDescription}
          </p>
          <Link
            href="/stylist"
            className="mt-4 inline-flex rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t.workbench.viewAdvice}
          </Link>
        </div>
      </section>
    </div>
  );
}
