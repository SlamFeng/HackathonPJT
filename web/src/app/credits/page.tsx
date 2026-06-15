"use client";

import { useEffect, useState } from "react";

import { getMyCredits, type MyCredits } from "@/lib/credits";
import { useT } from "@/i18n";

export default function CreditsPage() {
  const t = useT();
  const [data, setData] = useState<MyCredits | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMyCredits()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : t("av.err.generic")));
  }, [t]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("cr.kicker")}</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-4xl font-semibold tracking-tight">{data ? data.credits : "—"}</div>
          <div className="pb-1 text-sm text-zinc-500">{t("cr.unit")}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => alert(t("cr.buyHint"))}
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
          >
            {t("cr.buy")}
          </button>
          <span className="text-xs text-zinc-500">{t("cr.buyHint")}</span>
        </div>
        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6">
        <div className="text-sm font-medium">{t("cr.ledger")}</div>
        <div className="mt-3 divide-y divide-zinc-100">
          {!data ? (
            <div className="py-6 text-center text-sm text-zinc-500">{t("common.loading")}</div>
          ) : data.events.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">{t("cr.empty")}</div>
          ) : (
            data.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium">{t(`cr.evt.${e.eventType}`)}</span>
                  <span className="ml-2 text-xs text-zinc-500">{e.reason ?? ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={e.amount >= 0 ? "text-green-600" : "text-zinc-700"}>
                    {e.amount >= 0 ? `+${e.amount}` : e.amount}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
