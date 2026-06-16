"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { getConfigStatus } from "@/lib/admin";
import { getMyCredits } from "@/lib/credits";
import { useAuth } from "@/lib/auth-context";
import { useHydrateAssets } from "@/lib/useHydrateAssets";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// 主线导航：按卖家的活儿顺序排列（批量出图 → 模特 → 商品 → 交付）
const nav = [
  { href: "/workbench", key: "nav.workbench" },
  { href: "/avatar", key: "nav.avatar" },
  { href: "/closet", key: "nav.closet" },
  { href: "/history", key: "nav.history" },
];

// 次要功能：精修/调试与 toC 残留，折叠在「更多」下，不进主线
const secondaryNav = [
  { href: "/studio", key: "nav.studio" },
  { href: "/stylist", key: "nav.stylist" },
  { href: "/orders", key: "nav.orders" },
];

// 仅管理员可见的导航项
const adminNav = [
  { href: "/admin/users", key: "nav.admin.users" },
  { href: "/admin/jobs", key: "nav.admin.jobs" },
  { href: "/admin/usage", key: "nav.admin.usage" },
  { href: "/admin/settings", key: "nav.admin.settings" },
  { href: "/debug/generation-logs", key: "nav.admin.logs" },
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
  const t = useT();
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

  // 移动端导航开关（窄屏侧边栏隐藏时用汉堡菜单访问）；切换路由自动收起
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const isPublic = PUBLIC_ROUTES.has(pathname);

  // 受保护路由的主动守卫：登录态确定后若未登录，立即跳转登录页
  useEffect(() => {
    if (!isPublic && !loading && !me) {
      router.replace("/login");
    }
  }, [isPublic, loading, me, router]);

  // 已登录用户访问营销门户「/」时，直接进入工作流主页（批量出图）
  useEffect(() => {
    if (pathname === "/" && !loading && me) {
      router.replace("/workbench");
    }
  }, [pathname, loading, me, router]);

  // 门户/登录/注册：不套外壳，直接渲染各自整屏布局
  if (isPublic) {
    return <div className="min-h-full">{children}</div>;
  }

  if (loading) {
    return <FullscreenHint text={t("common.loading")} />;
  }

  // 未登录：等待上面的 effect 完成跳转，先渲染占位避免闪现工作台内容
  if (!me) {
    return <FullscreenHint text={t("common.redirectingLogin")} />;
  }

  async function onLogout() {
    await signOut();
    router.replace("/login");
  }

  const isAdmin = me.role === "admin";
  // 分组导航：主线 / 更多 / 管理（仅管理员）
  const navGroups: Array<{ title: string | null; items: Array<{ href: string; key: string }> }> = [
    { title: null, items: nav },
    { title: "nav.group.more", items: secondaryNav },
    ...(isAdmin ? [{ title: "nav.group.admin", items: adminNav }] : []),
  ];

  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 text-zinc-950">
      <aside className="hidden w-[280px] shrink-0 border-r border-zinc-200/70 bg-white p-6 md:flex md:flex-col">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold tracking-tight">{t("brand.sidebar")}</div>
          <div className="text-[11px] text-zinc-500">{t("brand.tagline")}</div>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {navGroups.map((group) => (
            <div key={group.title ?? "main"} className={group.title ? "mt-4" : ""}>
              {group.title ? (
                <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  {t(group.title)}
                </div>
              ) : null}
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "block rounded-xl px-3 py-2 text-sm transition-colors",
                      active ? "bg-zinc-900 text-zinc-50" : "text-zinc-700 hover:bg-zinc-100",
                    ].join(" ")}
                  >
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-zinc-500">
          {t("shell.footer")}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200/70 bg-zinc-50/80 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t("header.menu")}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
              className="-ml-1 rounded-lg p-1.5 text-zinc-700 hover:bg-zinc-200/60 md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileNavOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
            <div className="text-sm font-medium tracking-tight">{t("brand.name")}</div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {credits !== null ? (
              <Link
                href="/credits"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                title={t("header.creditsTitle")}
              >
                {t("header.credits", { n: credits })}
              </Link>
            ) : null}
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {me.displayName || me.email}
              {me.role === "admin" ? t("header.adminSuffix") : ""}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              {t("header.logout")}
            </button>
          </div>
        </header>
        {mobileNavOpen ? (
          <nav className="flex flex-col gap-1 border-b border-zinc-200/70 bg-white px-3 py-3 md:hidden">
            {navGroups.map((group) => (
              <div key={group.title ?? "main"} className={group.title ? "mt-3" : ""}>
                {group.title ? (
                  <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    {t(group.title)}
                  </div>
                ) : null}
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={[
                        "block rounded-xl px-3 py-2 text-sm transition-colors",
                        active ? "bg-zinc-900 text-zinc-50" : "text-zinc-700 hover:bg-zinc-100",
                      ].join(" ")}
                    >
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        ) : null}
        {hasApiKey === false ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800 md:px-8">
            {isAdmin ? (
              <span>
                {t("banner.noKey.admin")}
                <Link href="/admin/settings" className="ml-1 font-medium text-amber-900 underline">
                  {t("banner.noKey.adminCta")}
                </Link>
              </span>
            ) : (
              <span>{t("banner.noKey.user")}</span>
            )}
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
