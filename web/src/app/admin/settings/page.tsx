"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { getAdminSettings, updateAdminSettings, type AdminSettings } from "@/lib/admin";

const CUSTOM = "__custom__";

export default function AdminSettingsPage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 仅管理员可访问
  useEffect(() => {
    if (!loading && me && me.role !== "admin") router.replace("/workbench");
  }, [loading, me, router]);

  useEffect(() => {
    if (me?.role !== "admin") return;
    (async () => {
      try {
        const s = await getAdminSettings();
        setSettings(s);
        setModel(s.model);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "加载失败");
      }
    })();
  }, [me]);

  async function onSave() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const body: { apiKey?: string; model?: string } = {};
      if (apiKeyInput.trim()) body.apiKey = apiKeyInput.trim();
      const chosen = model === CUSTOM ? customModel.trim() : model;
      if (chosen) body.model = chosen;
      const s = await updateAdminSettings(body);
      setSettings(s);
      setModel(s.model);
      setApiKeyInput("");
      setMsg("已保存，立即对新的生成任务生效（无需重启）。");
      window.dispatchEvent(new Event("config-changed")); // 通知顶部横幅即时刷新
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onClearKey() {
    if (!window.confirm("确定清除运行时 API Key？清除后回退到 .env 默认（若有），否则生成走 mock。")) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const s = await updateAdminSettings({ apiKey: "" });
      setSettings(s);
      setMsg("已清除运行时 Key。");
      window.dispatchEvent(new Event("config-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">需要管理员权限…</div>;
  }

  const sourceLabel =
    settings?.keySource === "runtime" ? "管理员配置" : settings?.keySource === "env" ? ".env 环境变量" : "未配置";
  const usingCustom = model === CUSTOM || (settings != null && !settings.availableModels.includes(model) && model !== "");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">系统设置（管理员）</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">AI 模型 API Key 与模型</div>
        <div className="mt-2 text-sm text-zinc-600">
          在这里动态更换 Key、切换模型，保存后立即对新生成任务生效，无需改 .env 或重启。
        </div>

        {/* 当前状态 */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Key 状态</div>
            <div className={["mt-1 text-sm font-medium", settings?.hasApiKey ? "text-green-600" : "text-red-600"].join(" ")}>
              {settings?.hasApiKey ? "已配置" : "未配置（生成走 mock）"}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Key 来源</div>
            <div className="mt-1 text-sm font-medium text-zinc-800">{sourceLabel}</div>
            <div className="text-[11px] text-zinc-500">{settings?.apiKeyMasked ?? "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">当前模型</div>
            <div className="mt-1 break-all text-sm font-medium text-zinc-800">{settings?.model ?? "—"}</div>
          </div>
        </div>

        {/* 表单 */}
        <div className="mt-6 space-y-5">
          <div>
            <label className="text-sm font-medium">更换 API Key</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="粘贴新的 API Key 以更新；留空表示不修改"
              className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <div className="mt-1 text-xs text-zinc-500">Key 仅保存在后端数据库，不会回传前端（只显示掩码）。</div>
          </div>

          <div>
            <label className="text-sm font-medium">模型</label>
            <select
              value={usingCustom ? CUSTOM : model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
            >
              {settings?.availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={CUSTOM}>自定义…</option>
            </select>
            {usingCustom ? (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="输入模型名，例如 gemini-3-pro-image"
                className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            ) : null}
            <div className="mt-1 text-xs text-zinc-500">切换模型后可在「生图日志」对比不同模型的耗时与 token，评估性价比。</div>
          </div>

          {msg ? <div className="text-sm text-green-600">{msg}</div> : null}
          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              onClick={onClearKey}
              disabled={saving}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
            >
              清除运行时 Key
            </button>
            <Link
              href="/debug/generation-logs"
              className="ml-auto rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              查看生图日志 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
