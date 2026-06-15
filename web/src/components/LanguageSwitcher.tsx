"use client";

import { useI18n } from "@/i18n";
import { LOCALES } from "@/i18n/messages";

/** 顶栏语言切换（中 / EN / 日），即时切换并记忆到 localStorage。 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex items-center rounded-full border border-zinc-300 p-0.5 text-xs">
      {LOCALES.map((l) => {
        const active = l.id === locale;
        return (
          <button
            key={l.id}
            onClick={() => setLocale(l.id)}
            title={l.label}
            className={[
              "rounded-full px-2 py-0.5 transition-colors",
              active ? "bg-zinc-900 text-zinc-50" : "text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
