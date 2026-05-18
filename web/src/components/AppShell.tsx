"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const nav = [
  { href: "/", label: "门户" },
  { href: "/workbench", label: "工作台" },
  { href: "/avatar", label: "数字人" },
  { href: "/studio", label: "工作室" },
  { href: "/closet", label: "衣橱" },
  { href: "/orders", label: "订单" },
  { href: "/stylist", label: "穿搭顾问" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return <div className="min-h-full">{children}</div>;
  }
  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 text-zinc-950">
      <aside className="hidden w-[280px] shrink-0 border-r border-zinc-200/70 bg-white p-6 md:flex md:flex-col">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold tracking-tight">AI 试衣间</div>
          <div className="text-[11px] text-zinc-500">nanobanana-first</div>
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-6 text-xs text-zinc-500">
          UI 极简插画风，出图写实身份保持
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200/70 bg-zinc-50/80 px-5 py-4 backdrop-blur md:px-8">
          <div className="text-sm font-medium tracking-tight">AI 智能试衣间</div>
          <div className="text-xs text-zinc-500">MVP：Avatar → Pose → Try-on</div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
