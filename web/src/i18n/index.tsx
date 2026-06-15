"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { DEFAULT_LOCALE, LOCALES, MESSAGES, type Locale } from "./messages";

const STORAGE_KEY = "locale";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<Ctx | null>(null);

function isLocale(v: string | null): v is Locale {
  return !!v && LOCALES.some((l) => l.id === v);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // 默认中文，避免首帧水合不一致；挂载后从 localStorage 读取真实偏好
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) setLocaleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = MESSAGES[locale]?.[key] ?? MESSAGES.zh[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
    },
    [locale],
  );

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // 容错：未包裹 Provider 时回退中文，避免崩溃
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => {
        const raw = MESSAGES.zh[key] ?? key;
        return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`)) : raw;
      },
    };
  }
  return ctx;
}

/** 便捷 hook：只取翻译函数 */
export function useT() {
  return useI18n().t;
}
