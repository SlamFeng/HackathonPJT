"use client";

import { useI18n } from "@/lib/i18n";

export default function OrdersPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.orders.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.orders.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.orders.description}
        </div>
      </div>
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">{t.orders.upcoming}</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          {t.orders.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
