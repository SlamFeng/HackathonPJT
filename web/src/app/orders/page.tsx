"use client";

import { useI18n } from "@/i18n/I18nProvider";

export default function OrdersPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("orders.title")}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t("orders.subtitle")}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t("orders.desc")}
        </div>
      </div>
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">{t("orders.coming")}</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>{t("orders.item.1")}</li>
          <li>{t("orders.item.2")}</li>
          <li>{t("orders.item.3")}</li>
        </ul>
      </div>
    </div>
  );
}
