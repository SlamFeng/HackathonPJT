"use client";

import { ChevronDown } from "lucide-react";

import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, Locale } from "@/i18n/messages";

export function LanguageSelect({ variant }: { variant: "light" | "dark" }) {
  const { locale, setLocale, t } = useI18n();

  const base =
    variant === "dark"
      ? "border-white/30 bg-white/10 text-white hover:bg-white/15"
      : "border-zinc-200/70 bg-white text-zinc-900 hover:bg-zinc-50";

  const icon = variant === "dark" ? "text-white/80" : "text-zinc-500";

  return (
    <div className="relative inline-flex items-center">
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("lang.label")}
        className={[
          "h-9 w-[140px] cursor-pointer appearance-none rounded-full border px-3 pr-9 text-sm outline-none ring-zinc-900/10 focus:ring-4 sm:w-[160px]",
          base,
        ].join(" ")}
      >
        {LOCALES.map((it) => (
          <option key={it.value} value={it.value}>
            {it.label}
          </option>
        ))}
      </select>
      <ChevronDown className={["pointer-events-none absolute right-3 h-4 w-4", icon].join(" ")} />
    </div>
  );
}

