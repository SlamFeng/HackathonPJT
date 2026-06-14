"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { getConfigStatus } from "@/lib/admin";
import { getMyCredits } from "@/lib/credits";
import { useAuth } from "@/lib/auth-context";
import { useHydrateAssets } from "@/lib/useHydrateAssets";

const nav = [
  { href: "/", label: "门户" },
  { href: "/workbench", label: "工作台" },
  { href: "/avatar", label: "数字人" },
  { href: "/studio", label: "工作室" },
  { href: "/closet", label: "衣橱" },
  { href: "/history", label: "历史" },
  { href: "/orders", label: "订单" },
  { href: "/stylist", label: "穿搭顾问" },
];

// 仅管理员可见的导航项
const adminNav = [
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/jobs", label: "任务监控" },
  { href: "/admin/usage", label: "用量统计" },
  { href: "/admin/settings", label: "系统设置" },
  { href: "/debug/generation-logs", label: "生图日志" },
];

// 无需登录、且自带整屏布局的路由：门户与登录/注册页
const PUBLIC_ROUTES = new Set(["/", "/login", "/register"]);

function FullscreenHint({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading, signOut } = useAuth();
  // 登录后把该用户的数字人/衣橱/姿态/试穿从后端载入（每个用户一次）
  useHydrateAssets();

  // 全局检测是否已配置 AI 模型 Key（未配置则顶部横幅提醒）
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  useEffect(() => {
    if (!me) {
      setHasApiKey(null);
      return;
    }
    let cancelled = false;
    const refetch = () =>
      getConfigStatus()
        .then((s) => {
          if (!cancelled) setHasApiKey(s.hasApiKey);
        })
        .catch(() => {});
    refetch();
    // 管理员在设置页改完 Key 后会派发该事件，让横幅即时刷新（无需导航）
    window.addEventListener("config-changed", refetch);
    return () => {
      cancelled = true;
      window.removeEventListener("config-changed", refetch);
    };
  }, [me, pathname]);

  // 顶栏额度余额（生成扣费后通过 credits-changed 事件刷新）
  const [credits, setCredits] = useState<number | null>(null);
  useEffect(() => {
    if (!me) {
      setCredits(null);
      return;
    }
    let cancelled = false;
    const refetch = () =>
      getMyCredits()
        .then((c) => {
          if (!cancelled) setCredits(c.credits);
        })
        .catch(() => {});
    refetch();
    window.addEventListener("credits-changed", refetch);
    return () => {
      cancelled = true;
      window.removeEventListener("credits-changed", refetch);
    };
  }, [me, pathname]);

  const isPublic = PUBLIC_ROUTES.has(pathname);

  // 受保护路由的主动守卫：登录态确定后若未登录，立即跳转登录页
  useEffect(() => {
    if (!isPublic && !loading && !me) {
      router.replace("/login");
    }
  }, [isPublic, loading, me, router]);

  // 门户/登录/注册：不套外壳，直接渲染各自整屏布局
  if (isPublic) {
    return <div className="min-h-full">{children}</div>;
  }

  if (loading) {
    return <FullscreenHint text="加载中…" />;
  }

  // 未登录：等待上面的 effect 完成跳转，先渲染占位避免闪现工作台内容
  if (!me) {
    return <FullscreenHint text="正在跳转到登录…" />;
  }

  async function onLogout() {
    await signOut();
    router.replace("/login");
  }

  const navItems = me.role === "admin" ? [...nav, ...adminNav] : nav;
  const isAdmin = me.role === "admin";

  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 text-zinc-950">
      <aside className="hidden w-[280px] shrink-0 border-r border-zinc-200/70 bg-white p-6 md:flex md:flex-col">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold tracking-tight">AI 试衣间</div>
          <div className="text-[11px] text-zinc-500">nanobanana-first</div>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {navItems.map((item) => {
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
          <div className="flex items-center gap-3">
            {credits !== null ? (
              <Link
                href="/credits"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                title="我的额度"
              >
                额度 {credits}
              </Link>
            ) : null}
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {me.displayName || me.email}
              {me.role === "admin" ? "（管理员）" : ""}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              退出
            </button>
          </div>
        </header>
        {hasApiKey === false ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800 md:px-8">
            {isAdmin ? (
              <span>
                ⚠️ 尚未配置 AI 模型 API Key，生成将走 mock（仅回显原图）。
                <Link href="/admin/settings" className="ml-1 font-medium text-amber-900 underline">
                  前往「系统设置」配置 →
                </Link>
              </span>
            ) : (
              <span>⚠️ 系统尚未配置 AI 模型 Key，生成暂为 mock 效果，请联系管理员配置后再使用。</span>
            )}
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
