"use client";

import { useEffect, useState } from "react";

import { generateScript, getBodyAnalysis, listScripts, saveScript, toggleScriptFavorite } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";

export default function StylistPage() {
  const avatar = useAppStore((s) => s.avatar);
  const sessionId = useAppStore((s) => s.sessionId);
  const savedScripts = useAppStore((s) => s.savedScripts);
  const setSavedScripts = useAppStore((s) => s.setSavedScripts);
  const addSavedScript = useAppStore((s) => s.addSavedScript);
  const updateScriptFavorite = useAppStore((s) => s.updateScriptFavorite);

  const [scriptText, setScriptText] = useState("");
  const [busyGen, setBusyGen] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const bodyAnalysis = avatar.bodyAnalysis;

  useEffect(() => {
    listScripts(showFavoritesOnly)
      .then((scripts) => setSavedScripts(scripts as typeof savedScripts))
      .catch(() => {});
  }, [showFavoritesOnly, setSavedScripts]);

  useEffect(() => {
    if (!bodyAnalysis) {
      getBodyAnalysis(sessionId).then((res) => {
        if (res.analysis) {
          useAppStore.getState().setBodyAnalysis(res.analysis as unknown as typeof bodyAnalysis);
        }
      }).catch(() => {});
    }
  }, [bodyAnalysis, sessionId]);

  async function handleGenerate() {
    setError(null);
    setBusyGen(true);
    try {
      const { script } = await generateScript(sessionId, customerNote);
      setScriptText(script);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成话术失败");
    } finally {
      setBusyGen(false);
    }
  }

  async function handleSave() {
    if (!scriptText) return;
    setBusySave(true);
    try {
      const summary = bodyAnalysis
        ? `${bodyAnalysis.body_shape} · ${bodyAnalysis.height_estimate}`
        : "未知体型";
      const { id } = await saveScript({
        sessionId,
        bodyTypeSummary: summary,
        category: bodyAnalysis?.body_shape ?? "通用",
        content: scriptText,
      });
      addSavedScript({
        id,
        session_id: sessionId,
        body_type_summary: summary,
        category: bodyAnalysis?.body_shape ?? "通用",
        content: scriptText,
        favorite: false,
        created_at_ms: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusySave(false);
    }
  }

  async function handleToggleFavorite(scriptId: string) {
    try {
      const { favorite } = await toggleScriptFavorite(scriptId);
      updateScriptFavorite(scriptId, favorite);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">AI 穿搭顾问</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">体型分析 → 智能话术 → 收藏复用</div>
        <div className="mt-2 text-sm text-zinc-600">基于顾客体型特征，生成个性化推荐话术，可收藏复用。</div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-sm font-medium">体型信息</div>
          {bodyAnalysis ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-zinc-50 p-2.5">
                  <div className="text-zinc-500">体型</div>
                  <div className="mt-0.5 font-medium text-zinc-800">{bodyAnalysis.body_shape}</div>
                </div>
                <div className="rounded-xl bg-zinc-50 p-2.5">
                  <div className="text-zinc-500">身高评估</div>
                  <div className="mt-0.5 font-medium text-zinc-800">{bodyAnalysis.height_estimate}</div>
                </div>
                <div className="rounded-xl bg-zinc-50 p-2.5">
                  <div className="text-zinc-500">肩宽</div>
                  <div className="mt-0.5 font-medium text-zinc-800">{bodyAnalysis.shoulder_width}</div>
                </div>
                <div className="rounded-xl bg-zinc-50 p-2.5">
                  <div className="text-zinc-500">腰线</div>
                  <div className="mt-0.5 font-medium text-zinc-800">{bodyAnalysis.waist_definition}</div>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2.5 text-xs text-zinc-600 leading-relaxed">
                {bodyAnalysis.style_suggestion}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-xs text-zinc-500">
              暂无体型分析。请先在「数字人」页面生成 Avatar，系统会自动分析体型。
            </div>
          )}

          <div className="mt-5">
            <div className="text-sm font-medium">体型备注</div>
            <textarea
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs outline-none ring-zinc-900/10 focus:ring-4"
              rows={2}
              placeholder="补充顾客信息（如偏好风格、场合等）"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
            />
          </div>

          <button
            className={[
              "mt-4 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              bodyAnalysis && !busyGen
                ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800"
                : "bg-zinc-200 text-zinc-500",
            ].join(" ")}
            onClick={handleGenerate}
            disabled={!bodyAnalysis || busyGen}
          >
            {busyGen ? "生成中…" : "生成推荐话术"}
          </button>
        </div>

        <div className="lg:col-span-4 rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">话术卡片</div>
            {scriptText && (
              <button
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  busySave ? "bg-zinc-200 text-zinc-500" : "bg-zinc-900 text-zinc-50 hover:bg-zinc-800",
                ].join(" ")}
                onClick={handleSave}
                disabled={busySave}
              >
                {busySave ? "保存中…" : "收藏话术"}
              </button>
            )}
          </div>
          {scriptText ? (
            <div className="mt-4">
              {bodyAnalysis && (
                <div className="mb-2 text-[10px] text-zinc-500">
                  体型备注：{bodyAnalysis.body_shape} · {bodyAnalysis.height_estimate} · 肩宽{bodyAnalysis.shoulder_width}
                </div>
              )}
              <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700 whitespace-pre-wrap">
                {scriptText}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex h-40 items-center justify-center text-xs text-zinc-500">
              点击左侧「生成推荐话术」
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">话术库</div>
            <button
              className={[
                "rounded-full px-3 py-1 text-xs transition-colors",
                showFavoritesOnly
                  ? "bg-zinc-900 text-zinc-50"
                  : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              {showFavoritesOnly ? "全部" : "仅收藏"}
            </button>
          </div>
          <div className="mt-4 space-y-2 max-h-[480px] overflow-y-auto">
            {savedScripts.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
                暂无收藏话术
              </div>
            ) : (
              savedScripts.map((s) => (
                <div key={s.id} className="rounded-2xl border border-zinc-200/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-zinc-500">
                      {s.body_type_summary || s.category}
                    </div>
                    <button
                      className={[
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] transition-colors",
                        s.favorite
                          ? "bg-zinc-900 text-zinc-50"
                          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                      ].join(" ")}
                      onClick={() => handleToggleFavorite(s.id)}
                    >
                      {s.favorite ? "已收藏" : "收藏"}
                    </button>
                  </div>
                  <div className="mt-1.5 text-xs text-zinc-700 line-clamp-3 leading-relaxed">
                    {s.content}
                  </div>
                  <button
                    className="mt-1.5 text-[10px] text-zinc-500 hover:text-zinc-800"
                    onClick={() => setScriptText(s.content)}
                  >
                    使用此话术
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
