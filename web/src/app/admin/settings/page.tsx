"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { getAdminSettings, updateAdminSettings, type AdminSettings } from "@/lib/admin";
import { useI18n } from "@/lib/i18n";

const CUSTOM = "__custom__";

export default function AdminSettingsPage() {
  const { t } = useI18n();
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
        setErr(e instanceof Error ? e.message : t.admin.loadFailed);
      }
    })();
  }, [me, t.admin.loadFailed]);

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
      setMsg(t.adminSettings.saved);
      window.dispatchEvent(new Event("config-changed")); // 通知顶部横幅即时刷新
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.adminSettings.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function onClearKey() {
    if (!window.confirm(t.adminSettings.clearConfirm)) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const s = await updateAdminSettings({ apiKey: "" });
      setSettings(s);
      setMsg(t.adminSettings.cleared);
      window.dispatchEvent(new Event("config-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.adminSettings.operationFailed);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !me || me.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">{t.admin.needAdmin}</div>;
  }

  const sourceLabel =
    settings?.keySource === "runtime"
      ? t.adminSettings.keySourceRuntime
      : settings?.keySource === "env"
        ? t.adminSettings.keySourceEnv
        : t.adminSettings.keySourceNone;
  const usingCustom = model === CUSTOM || (settings != null && !settings.availableModels.includes(model) && model !== "");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.adminSettings.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.adminSettings.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.adminSettings.description}
        </div>

        {/* 当前状态 */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">{t.adminSettings.keyStatus}</div>
            <div className={["mt-1 text-sm font-medium", settings?.hasApiKey ? "text-green-600" : "text-red-600"].join(" ")}>
              {settings?.hasApiKey ? t.adminSettings.keyConfigured : t.adminSettings.keyNotConfigured}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">{t.adminSettings.keySource}</div>
            <div className="mt-1 text-sm font-medium text-zinc-800">{sourceLabel}</div>
            <div className="text-[11px] text-zinc-500">{settings?.apiKeyMasked ?? "—"}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">{t.adminSettings.currentModel}</div>
            <div className="mt-1 break-all text-sm font-medium text-zinc-800">{settings?.model ?? "—"}</div>
          </div>
        </div>

        {/* 表单 */}
        <div className="mt-6 space-y-5">
          <div>
            <label className="text-sm font-medium">{t.adminSettings.changeApiKey}</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={t.adminSettings.apiKeyPlaceholder}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <div className="mt-1 text-xs text-zinc-500">{t.adminSettings.apiKeyHint}</div>
          </div>

          <div>
            <label className="text-sm font-medium">{t.adminSettings.model}</label>
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
              <option value={CUSTOM}>{t.adminSettings.customModel}</option>
            </select>
            {usingCustom ? (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder={t.adminSettings.customModelPlaceholder}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            ) : null}
            <div className="mt-1 text-xs text-zinc-500">{t.adminSettings.modelHint}</div>
          </div>

          {msg ? <div className="text-sm text-green-600">{msg}</div> : null}
          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? t.adminSettings.saving : t.adminSettings.save}
            </button>
            <button
              onClick={onClearKey}
              disabled={saving}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
            >
              {t.adminSettings.clearRuntimeKey}
            </button>
            <Link
              href="/debug/generation-logs"
              className="ml-auto rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {t.adminSettings.viewLogs}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
