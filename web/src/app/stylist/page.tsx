"use client";

import Link from "next/link";

import { useI18n } from "@/i18n/I18nProvider";

export default function StylistPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("stylist.title")}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t("stylist.subtitle")}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t("stylist.desc")}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">{t("stylist.engine")}</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>{t("stylist.item.1")}</li>
          <li>{t("stylist.item.2")}</li>
          <li>{t("stylist.item.3")}</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <Link
            href="/studio"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
          >
            {t("stylist.next.1")}
          </Link>
          <Link
            href="/orders"
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t("stylist.next.2")}
          </Link>
        </div>
      </div>
    </div>
  );
}
