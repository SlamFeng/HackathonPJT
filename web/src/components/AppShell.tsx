"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { LanguageToggle, useI18n } from "@/lib/i18n";

const nav = [
  { href: "/", key: "home" },
  { href: "/workbench", key: "workbench" },
  { href: "/avatar", key: "avatar" },
  { href: "/studio", key: "studio" },
  { href: "/closet", key: "closet" },
  { href: "/orders", key: "orders" },
  { href: "/stylist", key: "stylist" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname === "/") {
    return <div className="min-h-full">{children}</div>;
  }
  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 text-zinc-950">
      <aside className="hidden w-[280px] shrink-0 border-r border-zinc-200/70 bg-white p-6 md:flex md:flex-col">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold tracking-tight">{t.shell.brand}</div>
          <div className="text-[11px] text-zinc-500">{t.shell.productTag}</div>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-xl px-3 py-2 text-sm transition-colors",
                  active ? "bg-zinc-900 text-zinc-50" : "text-zinc-700 hover:bg-zinc-100",
                ].join(" ")}
              >
                {t.shell.nav[item.key]}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-6 text-xs text-zinc-500">
          {t.shell.footer}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200/70 bg-zinc-50/80 px-5 py-4 backdrop-blur md:px-8">
          <div className="text-sm font-medium tracking-tight">{t.shell.headerTitle}</div>
          <div className="flex items-center gap-3">
            <div className="hidden text-xs text-zinc-500 sm:block">{t.shell.headerSubtitle}</div>
            <LanguageToggle />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
