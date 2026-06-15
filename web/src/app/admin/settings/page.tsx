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

  // 垂立调试链路（demo lane）
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoModel, setDemoModel] = useState("");
  const [demoPrompt, setDemoPrompt] = useState("");
  const [demoSaving, setDemoSaving] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);

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
        setDemoEnabled(s.demoLaneEnabled);
        setDemoModel(s.demoLaneModel ?? "");
        setDemoPrompt(s.demoLanePrompt ?? "");
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

  async function onSaveDemo() {
    setDemoSaving(true);
    setDemoMsg(null);
    setErr(null);
    try {
      const s = await updateAdminSettings({
        demoLaneEnabled: demoEnabled,
        demoLaneModel: demoModel.trim() || null,
        demoLanePrompt: demoPrompt.trim() || null,
      });
      setSettings(s);
      setDemoEnabled(s.demoLaneEnabled);
      setDemoModel(s.demoLaneModel ?? "");
      setDemoPrompt(s.demoLanePrompt ?? "");
      setDemoMsg("已保存，立即对新的「垂立」试穿任务生效。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setDemoSaving(false);
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

      {/* 垂立调试链路（demo lane） */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="flex items-center gap-2">
          <div className="text-xs text-zinc-500">垂立调试链路（demo lane）</div>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              demoEnabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500",
            ].join(" ")}
          >
            {demoEnabled ? "已启用" : "未启用"}
          </span>
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight">独立调试「垂立」试穿的提示词与模型</div>
        <div className="mt-2 text-sm text-zinc-600">
          开启后，<strong>仅 poseId=neutral_stand（垂立）</strong>的试穿走这条与生产隔离的单遍链路，
          用下面单独的模型与提示词，<strong>不影响其它姿态/生产链路</strong>。专为给客户 demo 冲质量上限做调试。
        </div>

        <div className="mt-6 space-y-5">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={demoEnabled}
              onChange={(e) => setDemoEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">启用垂立调试链路</span>
          </label>

          <div>
            <label className="text-sm font-medium">该链路使用的模型</label>
            <select
              value={demoModel}
              onChange={(e) => setDemoModel(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
            >
              <option value="">（用当前默认模型）</option>
              {settings?.availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-zinc-500">
              demo 建议选 <code>gemini-3-pro-image-preview</code>（pro 档，细节/保真更高，慢一点贵一点也无妨）。
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">该链路使用的提示词（留空=用内置 demo 提示词）</label>
            <textarea
              value={demoPrompt}
              onChange={(e) => setDemoPrompt(e.target.value)}
              rows={8}
              placeholder="留空则使用代码内置的 demo 提示词（已含服装保真硬约束）。在这里粘贴自定义提示词可即时迭代，无需改代码或重启。模型仍会同时收到图片 A（人物）与图片 B（服装）。"
              className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-zinc-900"
            />
            <div className="mt-1 text-xs text-zinc-500">
              改完保存即时生效；到「生图日志」可看到该链路的 <code>demoLane=true</code> 记录与所用模型，便于对比。
            </div>
          </div>

          {demoMsg ? <div className="text-sm text-green-600">{demoMsg}</div> : null}

          <button
            onClick={onSaveDemo}
            disabled={demoSaving}
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {demoSaving ? "保存中…" : "保存调试链路设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
