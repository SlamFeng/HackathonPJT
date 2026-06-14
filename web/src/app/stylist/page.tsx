"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n";

export default function StylistPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.stylist.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.stylist.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.stylist.description}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">{t.stylist.engineTitle}</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          {t.stylist.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <Link
            href="/studio"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
          >
            {t.stylist.goStudio}
          </Link>
          <Link
            href="/orders"
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t.stylist.goOrders}
          </Link>
        </div>
      </div>
    </div>
  );
}
